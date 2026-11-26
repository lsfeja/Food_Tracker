import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayDTO, SessionDTO, StravaStatusDTO } from "../../src/shared/api";
import { localToday } from "../../src/shared/days";
import { decrypt, encrypt } from "../../src/worker/crypto";
import { RateLimitedError, reserve } from "../../src/worker/strava/rateLimiter";
import { fetchStartDay, syncStartDay } from "../../src/worker/strava/sync";
import { api } from "./helpers";

type Handler = (url: URL, init?: RequestInit) => { status?: number; body: unknown; headers?: Record<string, string> } | undefined;

/** Routes outgoing fetches to `handler`; responses are created inside the request. */
function mockStrava(handler: Handler) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const result = handler(url, init);
    if (!result) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200, headers: { "Content-Type": "application/json", ...result.headers } });
  });
}

const tokenBody = { access_token: "access-1", refresh_token: "refresh-1", expires_at: Math.floor(Date.now() / 1000) + 6 * 3600, athlete: { id: 42, firstname: "Lucas", lastname: "F" } };

async function connect(email: string) {
  const call = (path: string) => SELF.fetch(`https://app.test/api${path}`, { headers: { "Cf-Access-Authenticated-User-Email": email }, redirect: "manual" });
  const start = await call("/strava/connect");
  const location = new URL(start.headers.get("Location")!);
  const state = location.searchParams.get("state")!;
  return call(`/strava/callback?state=${state}&code=abc&scope=read,activity:read_all`);
}

const iso = (ms: number) => new Date(ms).toISOString().replace(".000", "");

describe("token encryption", () => {
  it("round-trips and uses a random IV", async () => {
    const a = await encrypt("secret-token", "key");
    const b = await encrypt("secret-token", "key");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(await decrypt(a, "key")).toBe("secret-token");
    await expect(decrypt(a, "other-key")).rejects.toThrow();
  });
});

describe("sync window", () => {
  it("covers 28 days back, with catch-up up to 60 days", () => {
    expect(syncStartDay("2026-03-12")).toBe("2026-02-13");
    expect(fetchStartDay("2026-03-12", null, "UTC")).toBe("2026-02-13");
    expect(fetchStartDay("2026-03-12", Date.UTC(2026, 1, 1), "UTC")).toBe("2026-01-30");
    expect(fetchStartDay("2026-03-12", Date.UTC(2025, 0, 1), "UTC")).toBe("2026-01-11");
  });
});

describe("rate limiter", () => {
  it("blocks before the 15-minute limit", async () => {
    const now = Date.UTC(2026, 2, 10, 12, 1);
    for (let i = 0; i < 95; i++) await reserve(env.DB, "test-limits", now);
    await expect(reserve(env.DB, "test-limits", now)).rejects.toBeInstanceOf(RateLimitedError);
    // Next window: allowed again.
    await reserve(env.DB, "test-limits", now + 15 * 60 * 1000);
  });
});

describe("Strava OAuth and sync", () => {
  afterEach(() => vi.restoreAllMocks());

  it("connects, stores tokens encrypted and imports activities", async () => {
    const email = "strava@example.com";
    const now = Date.now();
    const rideStart = now - 2 * 3600 * 1000;
    const runStart = now - 26 * 3600 * 1000;
    let detailCalls = 0;
    mockStrava((url) => {
      if (url.pathname === "/oauth/token") return { body: tokenBody };
      if (url.pathname === "/api/v3/athlete/activities") {
        return {
          headers: { "X-ReadRateLimit-Usage": "3,10", "X-ReadRateLimit-Limit": "100,1000" },
          body:
            url.searchParams.get("page") === "1"
              ? [
                  { id: 1, name: "Morning Ride", sport_type: "VirtualRide", start_date: iso(rideStart), start_date_local: iso(rideStart), moving_time: 3600, distance: 30000, kilojoules: 700, trainer: true, device_watts: true },
                  { id: 2, name: "Evening Run", sport_type: "Run", start_date: iso(runStart), start_date_local: iso(runStart), moving_time: 1800, distance: 6000 },
                ]
              : [],
        };
      }
      if (url.pathname === "/api/v3/activities/1") {
        detailCalls++;
        return { body: { id: 1, calories: 650 } };
      }
      if (url.pathname === "/api/v3/activities/2") {
        detailCalls++;
        return { body: { id: 2 } };
      }
      return undefined;
    });

    const response = await connect(email);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toMatch(/^\/settings\?strava=connected/);
    const row = await env.DB.prepare("SELECT access_token, refresh_token FROM connections c JOIN users u ON u.id = c.user_id WHERE u.email = ?").bind(email).first<{
      access_token: string;
      refresh_token: string;
    }>();
    expect(row!.access_token).not.toContain("access-1");
    expect(row!.refresh_token.startsWith("v1:")).toBe(true);

    const call = api(email);
    // Plan an indoor ride today so the sync can match it.
    const today = localToday();
    const session = await call<SessionDTO>("POST", "/sessions", {
      day: new Date(rideStart).toISOString().slice(0, 10),
      content: { sport: "indoorRide", title: "", details: { kind: "endurance" } },
    });

    const sync = await call<{ status: string; strava: StravaStatusDTO }>("POST", "/strava/sync", { force: true });
    expect(sync.data.status).toBe("synced");
    expect(sync.data.strava).toMatchObject({ connected: true, athleteName: "Lucas F" });
    expect(detailCalls).toBe(2);

    const activities = await env.DB.prepare("SELECT external_id, active_kcal, kcal_estimated, is_indoor, has_power, details_complete FROM activities ORDER BY external_id").all();
    expect(activities.results).toEqual([
      { external_id: "1", active_kcal: 650, kcal_estimated: 0, is_indoor: 1, has_power: 1, details_complete: 1 },
      { external_id: "2", active_kcal: 0, kcal_estimated: 0, is_indoor: 0, has_power: 0, details_complete: 1 },
    ]);
    const linked = await call<{ session: SessionDTO }>("GET", `/sessions/${session.data.id}`);
    expect(linked.data.session).toMatchObject({ linkedActivityKey: "strava:1", status: "done" });

    // Known activities with complete details are not fetched again; a sync within 10 min is skipped.
    detailCalls = 0;
    await call("POST", "/strava/sync", { force: true });
    expect(detailCalls).toBe(0);
    expect((await call<{ status: string }>("POST", "/strava/sync")).data.status).toBe("skipped");

    const day = await call<DayDTO>("GET", `/day/${new Date(rideStart).toISOString().slice(0, 10)}`);
    expect(day.data.activities.some((a) => a.activeKcal === 650)).toBe(true);
    expect(today).toBeTruthy();
  });

  it("estimates calories from kJ, removes deleted activities and pauses the backfill on 429", async () => {
    const email = "strava2@example.com";
    const start = Date.now() - 3600 * 1000;
    let listed = [{ id: 10, name: "Ride", sport_type: "Ride", start_date: iso(start), start_date_local: iso(start), moving_time: 3600, distance: 25000, kilojoules: 800 }];
    let historyCalls = 0;
    mockStrava((url) => {
      if (url.pathname === "/oauth/token") return { body: tokenBody };
      if (url.pathname === "/api/v3/athletes/42/stats") return { body: { all_ride_totals: { count: 300 }, all_run_totals: { count: 100 } } };
      if (url.pathname === "/api/v3/athlete/activities" && url.searchParams.has("before")) {
        historyCalls++;
        if (historyCalls === 2) return { status: 429, body: { message: "Rate Limit Exceeded" }, headers: { "X-ReadRateLimit-Usage": "101,500" } };
        const page = Number(url.searchParams.get("page"));
        const base = Date.UTC(2020, 0, 1) + page * 86_400_000;
        const size = page === 1 ? 200 : 3;
        return { body: Array.from({ length: size }, (_, i) => ({ id: 1000 * page + i, name: "Old", sport_type: "Run", start_date: iso(base + i * 60_000), moving_time: 600, distance: 2000 })) };
      }
      if (url.pathname === "/api/v3/athlete/activities") return { body: url.searchParams.get("page") === "1" ? listed : [] };
      if (url.pathname.startsWith("/api/v3/activities/")) return { status: 500, body: {} };
      return undefined;
    });
    await connect(email);
    const call = api(email);
    await call("POST", "/strava/sync", { force: true });
    let row = await env.DB.prepare("SELECT a.active_kcal, a.kcal_estimated, a.details_complete FROM activities a JOIN users u ON u.id = a.user_id WHERE u.email = ? AND external_id = '10'")
      .bind(email)
      .first();
    // Detail failed: kJ estimate, details fetched later.
    expect(row).toEqual({ active_kcal: 800, kcal_estimated: 1, details_complete: 0 });

    listed = [];
    await call("POST", "/strava/sync", { force: true });
    row = await env.DB.prepare("SELECT a.id FROM activities a JOIN users u ON u.id = a.user_id WHERE u.email = ? AND external_id = '10'").bind(email).first();
    expect(row).toBeNull();

    const started = await call<StravaStatusDTO>("POST", "/strava/backfill");
    expect(started.data.backfill).toMatchObject({ status: "paused", importedCount: 200, expectedTotal: 400 });
    expect(started.data.backfill.pausedUntil).toBeGreaterThan(Date.now());

    // Resume once the block has passed.
    await env.DB.prepare("UPDATE rate_limits SET blocked_until = 0, window_count = 0, day_count = 0").run();
    await env.DB.prepare("UPDATE backfill_state SET paused_until = 0").run();
    const resumed = await call<StravaStatusDTO>("POST", "/strava/backfill/continue");
    expect(resumed.data.backfill).toMatchObject({ status: "completed", importedCount: 203 });

    const disconnected = await call<StravaStatusDTO>("POST", "/strava/disconnect", { deleteActivities: true });
    expect(disconnected.data.connected).toBe(false);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM activities a JOIN users u ON u.id = a.user_id WHERE u.email = ?").bind(email).first<{ n: number }>();
    expect(count!.n).toBe(0);
  });

  it("rejects a callback with a foreign state", async () => {
    const response = await SELF.fetch("https://app.test/api/strava/callback?state=nope&code=x&scope=activity:read", {
      headers: { "Cf-Access-Authenticated-User-Email": "intruder@example.com" },
      redirect: "manual",
    });
    expect(response.headers.get("Location")).toContain("reason=invalid-state");
  });
});
