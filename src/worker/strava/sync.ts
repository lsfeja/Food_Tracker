import { addDays, type Day, dayInTimeZone, dayToUTC, daysBetween, weekStart } from "../../shared/days";
import { loadSettings, newId } from "../db";
import type { Env } from "../env";
import { autoLink } from "../linker";
import { type DetailedActivity, type ImportedActivity, loadConnection, NotConnectedError, PROVIDER, StravaClient, type SummaryActivity, toImported } from "./client";
import { RateLimitedError } from "./rateLimiter";

/** 4 weeks: the weekly budget averages exact calories of the last 4 weeks. */
export const LOOKBACK_DAYS = 28;
export const MIN_AUTO_SYNC_INTERVAL = 10 * 60 * 1000;
const MAX_PAGES = 3;
const PAGE_SIZE = 100;
/** Detail requests per sync (subrequest budget); the rest follow in the next sync. */
const MAX_DETAILS = 25;

/** The regular window: the last 28 days, at least back to Monday. */
export function syncStartDay(today: Day): Day {
  const lookback = addDays(today, -(LOOKBACK_DAYS - 1));
  const monday = weekStart(today);
  return lookback < monday ? lookback : monday;
}

/** Extends the window back to shortly before the last successful sync (max. 60 days). */
export function fetchStartDay(today: Day, lastSyncAt: number | null, timeZone: string): Day {
  const standard = syncStartDay(today);
  if (lastSyncAt === null) return standard;
  const catchUp = dayInTimeZone(lastSyncAt - 2 * 86_400_000, timeZone);
  const floor = addDays(today, -60);
  const start = catchUp < standard ? catchUp : standard;
  return start > floor ? start : floor;
}

/** Epoch seconds safely before the start of `day` in any time zone. */
export const dayStartEpoch = (day: Day) => Math.floor(dayToUTC(day) / 1000) - 14 * 3600;

export type SyncStatus = "synced" | "skipped" | "notConnected" | "rateLimited" | "failed";

export interface SyncResult {
  status: SyncStatus;
  changed: boolean;
  message?: string;
}

type Row = Record<string, unknown>;

export function upsertActivity(db: D1Database, userId: string, a: ImportedActivity, keepCalories = false): D1PreparedStatement {
  const calorieUpdate = keepCalories
    ? ""
    : ", active_kcal = excluded.active_kcal, kcal_estimated = excluded.kcal_estimated, details_complete = excluded.details_complete";
  return db
    .prepare(
      `INSERT INTO activities (id, user_id, source, external_id, name, type, start_at, day, duration_s, distance_m, elevation_m, is_indoor,
         active_kcal, kcal_estimated, details_complete, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, source, external_id) DO UPDATE SET name = excluded.name, type = excluded.type, start_at = excluded.start_at,
         day = excluded.day, duration_s = excluded.duration_s, distance_m = excluded.distance_m, elevation_m = excluded.elevation_m,
         is_indoor = excluded.is_indoor, updated_at = excluded.updated_at${calorieUpdate}`,
    )
    .bind(
      newId(),
      userId,
      PROVIDER,
      a.externalId,
      a.name,
      a.type,
      a.startAt,
      a.day,
      a.durationS,
      a.distanceM,
      a.elevationM,
      a.isIndoor ? 1 : 0,
      a.activeKcal,
      a.kcalEstimated ? 1 : 0,
      a.detailsComplete ? 1 : 0,
      Date.now(),
    );
}

function differs(row: Row | undefined, a: ImportedActivity): boolean {
  if (!row) return true;
  return (
    row.name !== a.name ||
    row.type !== a.type ||
    Number(row.start_at) !== a.startAt ||
    row.day !== a.day ||
    Number(row.duration_s) !== a.durationS ||
    Number(row.distance_m) !== a.distanceM ||
    Number(row.elevation_m) !== a.elevationM ||
    Number(row.active_kcal) !== a.activeKcal ||
    Number(row.kcal_estimated) !== (a.kcalEstimated ? 1 : 0) ||
    Number(row.details_complete) !== (a.detailsComplete ? 1 : 0)
  );
}

/**
 * Imports recent activities (list + one detail request per new activity for its
 * calories), removes deleted ones and re-runs session matching for the window.
 */
export async function syncUser(env: Env, userId: string, options: { force?: boolean } = {}): Promise<SyncResult> {
  const db = env.DB;
  const connection = await loadConnection(env, userId);
  if (!connection) return { status: "notConnected", changed: false };
  if (!options.force && connection.last_sync_at !== null && Date.now() - connection.last_sync_at < MIN_AUTO_SYNC_INTERVAL) {
    return { status: "skipped", changed: false };
  }
  const settings = await loadSettings(db, userId);
  const today = dayInTimeZone(Date.now(), settings.timezone);
  const startDay = fetchStartDay(today, connection.last_sync_at, settings.timezone);
  const after = dayStartEpoch(startDay);
  const client = new StravaClient(env, userId, connection);

  try {
    const summaries: SummaryActivity[] = [];
    let listComplete = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await client.get<SummaryActivity[]>("athlete/activities", { after, page, per_page: PAGE_SIZE });
      summaries.push(...batch);
      if (batch.length < PAGE_SIZE) {
        listComplete = true;
        break;
      }
    }

    const existingRows = await db
      .prepare("SELECT * FROM activities WHERE user_id = ? AND source = ? AND start_at >= ?")
      .bind(userId, PROVIDER, after * 1000)
      .all<Row>();
    const existing = new Map((existingRows.results ?? []).map((r) => [String(r.external_id), r]));
    // Details of activities outside the window may exist too (moved start); look them up by id.
    const missing = summaries.map((s) => String(s.id)).filter((id) => !existing.has(id));
    for (let i = 0; i < missing.length; i += 90) {
      const ids = missing.slice(i, i + 90);
      const rows = await db
        .prepare(`SELECT * FROM activities WHERE user_id = ? AND source = ? AND external_id IN (${ids.map(() => "?").join(", ")})`)
        .bind(userId, PROVIDER, ...ids)
        .all<Row>();
      for (const r of rows.results ?? []) existing.set(String(r.external_id), r);
    }

    const imported: ImportedActivity[] = [];
    let detailBudget = MAX_DETAILS;
    let canFetchDetails = true;
    for (const summary of summaries) {
      const known = existing.get(String(summary.id));
      if (known && Number(known.details_complete) === 1) {
        // Details are complete: reuse the reported calories (never re-fetch).
        const reported = Number(known.kcal_estimated) === 1 ? null : Number(known.active_kcal);
        imported.push(toImported(summary, reported, true));
        continue;
      }
      let calories: number | null = null;
      let complete = false;
      if (canFetchDetails && detailBudget > 0) {
        detailBudget--;
        try {
          const detail = await client.get<DetailedActivity>(`activities/${summary.id}`);
          calories = detail.calories ?? null;
          complete = true;
        } catch (error) {
          if (error instanceof NotConnectedError) throw error;
          // Rate limit or network issue: keep the summary (kJ estimate), details later.
          canFetchDetails = false;
        }
      }
      imported.push(toImported(summary, calories, complete));
    }

    const statements: D1PreparedStatement[] = [];
    let changed = false;
    for (const activity of imported) {
      if (differs(existing.get(activity.externalId), activity)) {
        statements.push(upsertActivity(db, userId, activity));
        changed = true;
      }
    }
    if (listComplete) {
      const fetched = new Set(imported.map((a) => a.externalId));
      for (const row of existingRows.results ?? []) {
        if (!fetched.has(String(row.external_id))) {
          statements.push(db.prepare("DELETE FROM activities WHERE id = ?").bind(row.id));
          changed = true;
        }
      }
    }
    statements.push(
      db.prepare("UPDATE connections SET last_sync_at = ?, last_error = NULL WHERE user_id = ? AND provider = ?").bind(Date.now(), userId, PROVIDER),
    );
    await db.batch(statements);
    const linked = await autoLink(db, userId, daysBetween(startDay, addDays(today, 1)));
    return { status: "synced", changed: changed || linked };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    if (error instanceof NotConnectedError) return { status: "notConnected", changed: false, message };
    await db.prepare("UPDATE connections SET last_error = ? WHERE user_id = ? AND provider = ?").bind(message, userId, PROVIDER).run();
    return { status: error instanceof RateLimitedError ? "rateLimited" : "failed", changed: false, message };
  }
}
