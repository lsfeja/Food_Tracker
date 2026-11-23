import { Hono } from "hono";
import type { StravaStatusDTO } from "../../shared/api";
import type { AppContext, Env } from "../env";
import { jsonBody } from "../http";
import { autoLink } from "../linker";
import { backfillStatus, resetBackfill, runBackfill, startBackfill } from "../strava/backfill";
import { athleteName, authorizeURL, exchangeCode, isConfigured, loadConnection, PROVIDER, saveConnection, StravaClient } from "../strava/client";
import { syncUser } from "../strava/sync";

export const strava = new Hono<AppContext>();

const STATE_TTL = 10 * 60 * 1000;

async function status(env: Env, userId: string): Promise<StravaStatusDTO> {
  const connection = await loadConnection(env, userId);
  return {
    configured: isConfigured(env),
    connected: connection !== null,
    athleteName: connection?.athlete_name ?? null,
    lastSyncAt: connection?.last_sync_at ?? null,
    lastError: connection?.last_error ?? null,
    backfill: await backfillStatus(env, userId),
  };
}

strava.get("/strava/status", async (c) => c.json(await status(c.env, c.get("userId"))));

/** Starts OAuth: redirects to Strava with a one-time state bound to this user. */
strava.get("/strava/connect", async (c) => {
  if (!isConfigured(c.env)) return c.redirect("/settings?strava=error&reason=not-configured");
  const state = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(Date.now() - STATE_TTL),
    c.env.DB.prepare("INSERT INTO oauth_states (state, user_id, provider, created_at) VALUES (?, ?, ?, ?)").bind(state, c.get("userId"), PROVIDER, Date.now()),
  ]);
  const redirectUri = `${new URL(c.req.url).origin}/api/strava/callback`;
  return c.redirect(authorizeURL(c.env, redirectUri, state));
});

/** OAuth callback: checks the state, exchanges the code (in the Worker) and stores the tokens encrypted. */
strava.get("/strava/callback", async (c) => {
  const fail = (reason: string) => c.redirect(`/settings?strava=error&reason=${encodeURIComponent(reason)}`);
  const state = c.req.query("state") ?? "";
  const row = await c.env.DB.prepare("SELECT * FROM oauth_states WHERE state = ?").bind(state).first<{ user_id: string; created_at: number }>();
  await c.env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  if (!row || row.user_id !== c.get("userId") || Date.now() - row.created_at > STATE_TTL) return fail("invalid-state");
  if (c.req.query("error")) return fail(c.req.query("error") === "access_denied" ? "access-denied" : "authorization-failed");
  const code = c.req.query("code");
  const scope = c.req.query("scope") ?? "";
  if (!code) return fail("no-code");
  if (!scope.split(",").some((s) => s.startsWith("activity:read"))) return fail("missing-scope");
  try {
    const token = await exchangeCode(c.env, code);
    await saveConnection(c.env, c.get("userId"), token, scope);
    // First sync right away (in the background) so data shows up quickly.
    c.executionCtx.waitUntil(syncUser(c.env, c.get("userId"), { force: true }).then(() => undefined));
    return c.redirect(`/settings?strava=connected&name=${encodeURIComponent(athleteName(token) ?? "")}`);
  } catch {
    return fail("token-exchange-failed");
  }
});

strava.post("/strava/disconnect", async (c) => {
  const body = await jsonBody<{ deleteActivities?: boolean }>(c.req.raw).catch(() => ({}) as { deleteActivities?: boolean });
  const userId = c.get("userId");
  const db = c.env.DB;
  const connection = await loadConnection(c.env, userId);
  if (connection) await new StravaClient(c.env, userId, connection).deauthorize();
  const statements = [db.prepare("DELETE FROM connections WHERE user_id = ? AND provider = ?").bind(userId, PROVIDER)];
  let days: string[] = [];
  if (body.deleteActivities) {
    const rows = await db.prepare("SELECT DISTINCT day FROM activities WHERE user_id = ? AND source = ?").bind(userId, PROVIDER).all<{ day: string }>();
    days = (rows.results ?? []).map((r) => r.day);
    statements.push(db.prepare("DELETE FROM activities WHERE user_id = ? AND source = ?").bind(userId, PROVIDER));
  }
  await db.batch(statements);
  await resetBackfill(c.env, userId);
  // Removed activities unlink their sessions.
  if (days.length) await autoLink(db, userId, days);
  return c.json(await status(c.env, userId));
});

/** Sync now. Without `force`, runs at most every 10 minutes. */
strava.post("/strava/sync", async (c) => {
  const body = await jsonBody<{ force?: boolean }>(c.req.raw).catch(() => ({}) as { force?: boolean });
  const result = await syncUser(c.env, c.get("userId"), { force: body.force === true });
  return c.json({ ...result, strava: await status(c.env, c.get("userId")) });
});

strava.post("/strava/backfill", async (c) => {
  const body = await jsonBody<{ restart?: boolean }>(c.req.raw).catch(() => ({}) as { restart?: boolean });
  await startBackfill(c.env, c.get("userId"), body.restart === true);
  return c.json(await status(c.env, c.get("userId")));
});

/** Continues the import while the app is open (the cron job continues otherwise). */
strava.post("/strava/backfill/continue", async (c) => {
  await runBackfill(c.env, c.get("userId"));
  return c.json(await status(c.env, c.get("userId")));
});

/** Cron: regular sync for every connected user, then continue history imports. */
export async function scheduledSync(env: Env): Promise<void> {
  const rows = await env.DB.prepare("SELECT user_id FROM connections WHERE provider = ?").bind(PROVIDER).all<{ user_id: string }>();
  for (const { user_id } of rows.results ?? []) {
    await syncUser(env, user_id);
    await runBackfill(env, user_id);
  }
}
