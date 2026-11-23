/**
 * Strava's read limits apply per app (100 requests / 15 min, 1,000 / day by default),
 * so the counter is global per provider and lives in D1. Keeps a safety margin, reads
 * the X-ReadRateLimit-* headers and blocks after a 429 until the window resets.
 */
export class RateLimitedError extends Error {
  constructor(readonly until: number) {
    super(`Strava's request limit was reached. Try again after ${new Date(until).toISOString().slice(11, 16)} UTC.`);
  }
}

const MARGIN = 5;
const WINDOW = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

interface LimitRow {
  window_start: number;
  window_count: number;
  day_start: number;
  day_count: number;
  short_limit: number;
  daily_limit: number;
  blocked_until: number | null;
}

export const windowStart = (now: number) => Math.floor(now / WINDOW) * WINDOW;
export const dayStart = (now: number) => Math.floor(now / DAY) * DAY;

export function parsePair(header: string | null): [number, number] | null {
  const parts = header?.split(",").map((p) => Number(p.trim()));
  return parts && parts.length === 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] : null;
}

async function load(db: D1Database, provider: string): Promise<LimitRow> {
  const row = await db.prepare("SELECT * FROM rate_limits WHERE provider = ?").bind(provider).first<LimitRow>();
  if (!row) return { window_start: 0, window_count: 0, day_start: 0, day_count: 0, short_limit: 100, daily_limit: 1000, blocked_until: null };
  return { ...row, blocked_until: row.blocked_until ? Number(row.blocked_until) : null };
}

async function save(db: D1Database, provider: string, row: LimitRow) {
  await db
    .prepare(
      `INSERT INTO rate_limits (provider, window_start, window_count, day_start, day_count, short_limit, daily_limit, blocked_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET window_start = excluded.window_start, window_count = excluded.window_count,
         day_start = excluded.day_start, day_count = excluded.day_count, short_limit = excluded.short_limit,
         daily_limit = excluded.daily_limit, blocked_until = excluded.blocked_until`,
    )
    .bind(provider, row.window_start, row.window_count, row.day_start, row.day_count, row.short_limit, row.daily_limit, row.blocked_until ?? 0)
    .run();
}

function roll(row: LimitRow, now: number): LimitRow {
  const window = windowStart(now);
  const day = dayStart(now);
  return {
    ...row,
    window_start: window,
    window_count: row.window_start === window ? row.window_count : 0,
    day_start: day,
    day_count: row.day_start === day ? row.day_count : 0,
    blocked_until: row.blocked_until !== null && row.blocked_until > now ? row.blocked_until : null,
  };
}

/** Reserves one request or throws RateLimitedError. */
export async function reserve(db: D1Database, provider: string, now = Date.now()): Promise<void> {
  const row = roll(await load(db, provider), now);
  if (row.blocked_until !== null) throw new RateLimitedError(row.blocked_until);
  if (row.window_count >= row.short_limit - MARGIN) {
    row.blocked_until = row.window_start + WINDOW;
    await save(db, provider, row);
    throw new RateLimitedError(row.blocked_until);
  }
  if (row.day_count >= row.daily_limit - MARGIN) {
    row.blocked_until = row.day_start + DAY;
    await save(db, provider, row);
    throw new RateLimitedError(row.blocked_until);
  }
  row.window_count += 1;
  row.day_count += 1;
  await save(db, provider, row);
}

/** Applies the usage/limit headers of a response (and blocks after a 429). */
export async function record(db: D1Database, provider: string, headers: Headers, status: number, now = Date.now()): Promise<void> {
  const usage = parsePair(headers.get("X-ReadRateLimit-Usage") ?? headers.get("X-RateLimit-Usage"));
  const limit = parsePair(headers.get("X-ReadRateLimit-Limit") ?? headers.get("X-RateLimit-Limit"));
  if (!usage && !limit && status !== 429) return;
  const row = roll(await load(db, provider), now);
  if (usage) {
    row.window_count = Math.max(row.window_count, usage[0]);
    row.day_count = Math.max(row.day_count, usage[1]);
  }
  if (limit && limit[0] > 0 && limit[1] > 0) {
    row.short_limit = limit[0];
    row.daily_limit = limit[1];
  }
  if (status === 429) row.blocked_until = row.day_count >= row.daily_limit ? row.day_start + DAY : row.window_start + WINDOW;
  await save(db, provider, row);
}

export async function currentBlock(db: D1Database, provider: string, now = Date.now()): Promise<number | null> {
  const row = roll(await load(db, provider), now);
  return row.blocked_until;
}
