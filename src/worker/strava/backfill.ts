import type { BackfillDTO } from "../../shared/api";
import { dayInTimeZone } from "../../shared/days";
import { loadSettings } from "../db";
import type { Env } from "../env";
import { loadConnection, NotConnectedError, PROVIDER, StravaClient, type SummaryActivity, toImported } from "./client";
import { RateLimitedError } from "./rateLimiter";
import { dayStartEpoch, syncStartDay, upsertActivity } from "./sync";

/**
 * One-time import of everything before the regular sync window: pages of 200
 * summaries (no detail requests). State is saved after every page; a rate limit
 * pauses the import and the cron job resumes it. Exact calories of known
 * activities are never overwritten; old activities get kJ-based estimates (or 0).
 */
export const PAGE_SIZE = 200;
const PAGES_PER_RUN = 3;

interface StateRow {
  status: BackfillDTO["status"];
  fixed_before: number | null;
  next_page: number;
  imported_count: number;
  oldest_at: number | null;
  expected_total: number | null;
  paused_until: number | null;
  last_error: string | null;
}

const idle: StateRow = { status: "idle", fixed_before: null, next_page: 1, imported_count: 0, oldest_at: null, expected_total: null, paused_until: null, last_error: null };

async function load(env: Env, userId: string): Promise<StateRow> {
  return (await env.DB.prepare("SELECT * FROM backfill_state WHERE user_id = ? AND provider = ?").bind(userId, PROVIDER).first<StateRow>()) ?? { ...idle };
}

async function save(env: Env, userId: string, s: StateRow) {
  await env.DB.prepare(
    `INSERT INTO backfill_state (user_id, provider, status, fixed_before, next_page, imported_count, oldest_at, expected_total, paused_until, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET status = excluded.status, fixed_before = excluded.fixed_before, next_page = excluded.next_page,
       imported_count = excluded.imported_count, oldest_at = excluded.oldest_at, expected_total = excluded.expected_total,
       paused_until = excluded.paused_until, last_error = excluded.last_error, updated_at = excluded.updated_at`,
  )
    .bind(userId, PROVIDER, s.status, s.fixed_before, s.next_page, s.imported_count, s.oldest_at, s.expected_total, s.paused_until, s.last_error, Date.now())
    .run();
}

export function toDTO(s: StateRow): BackfillDTO {
  return {
    status: s.status,
    importedCount: s.imported_count,
    expectedTotal: s.expected_total,
    oldestAt: s.oldest_at,
    pausedUntil: s.paused_until,
    lastError: s.last_error,
  };
}

export async function backfillStatus(env: Env, userId: string): Promise<BackfillDTO> {
  return toDTO(await load(env, userId));
}

export async function resetBackfill(env: Env, userId: string) {
  await env.DB.prepare("DELETE FROM backfill_state WHERE user_id = ? AND provider = ?").bind(userId, PROVIDER).run();
}

/** Starts (or restarts) the import and runs the first pages. */
export async function startBackfill(env: Env, userId: string, restart = false): Promise<BackfillDTO> {
  let state = await load(env, userId);
  if (restart || state.status === "idle" || state.status === "completed") state = { ...idle };
  if (state.fixed_before === null) {
    const settings = await loadSettings(env.DB, userId);
    state.fixed_before = dayStartEpoch(syncStartDay(dayInTimeZone(Date.now(), settings.timezone))) + 14 * 3600;
  }
  state.status = "running";
  state.paused_until = null;
  state.last_error = null;
  await save(env, userId, state);
  return runBackfill(env, userId);
}

/** Continues a running import, or a paused one whose pause is over. */
export async function runBackfill(env: Env, userId: string, maxPages = PAGES_PER_RUN): Promise<BackfillDTO> {
  const state = await load(env, userId);
  if (state.status === "paused" && (state.paused_until ?? 0) <= Date.now()) state.status = "running";
  if (state.status !== "running" || state.fixed_before === null) return toDTO(state);

  const connection = await loadConnection(env, userId);
  if (!connection) {
    state.status = "failed";
    state.last_error = new NotConnectedError().message;
    await save(env, userId, state);
    return toDTO(state);
  }
  const client = new StravaClient(env, userId, connection);
  try {
    if (state.expected_total === null && client.athleteId) {
      try {
        const stats = await client.get<Record<string, { count?: number } | undefined>>(`athletes/${client.athleteId}/stats`);
        state.expected_total = ["all_ride_totals", "all_run_totals", "all_swim_totals"].reduce((sum, key) => sum + (stats[key]?.count ?? 0), 0) || null;
      } catch (error) {
        if (error instanceof RateLimitedError || error instanceof NotConnectedError) throw error;
      }
    }
    for (let i = 0; i < maxPages; i++) {
      const batch = await client.get<SummaryActivity[]>("athlete/activities", { before: state.fixed_before, page: state.next_page, per_page: PAGE_SIZE });
      if (batch.length) {
        const activities = batch.map((s) => toImported(s, null, true));
        await env.DB.batch(activities.map((a) => upsertActivity(env.DB, userId, a, true)));
        state.imported_count += batch.length;
        const oldest = Math.min(...activities.map((a) => a.startAt));
        state.oldest_at = state.oldest_at === null ? oldest : Math.min(state.oldest_at, oldest);
      }
      state.next_page += 1;
      if (batch.length < PAGE_SIZE) {
        state.status = "completed";
        break;
      }
      await save(env, userId, state);
    }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      state.status = "paused";
      state.paused_until = error.until;
    } else {
      state.status = "failed";
      state.last_error = error instanceof Error ? error.message : "Import failed.";
    }
  }
  await save(env, userId, state);
  return toDTO(state);
}
