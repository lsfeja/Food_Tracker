import { Hono } from "hono";
import type { GoalDTO, StatsActivityDTO, StatsSessionDTO } from "../../shared/api";
import { STATS_FILTERS, type StatsSportFilter } from "../../shared/stats/endurance";
import { parseDetails, plannedMinutes, sportInfo, type SportType } from "../../shared/workout";
import type { AppContext } from "../env";
import { badRequest, jsonBody, optNum } from "../http";

/**
 * Raw data for the Stats tab. Reports are computed on the client from these
 * snapshots (no cached aggregates; the Worker stays within its CPU budget).
 */
export const stats = new Hono<AppContext>();

type Row = Record<string, unknown>;

stats.get("/stats/activities", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT source, external_id, name, start_at, day, type, is_indoor, distance_m, duration_s, elevation_m FROM activities WHERE user_id = ? ORDER BY start_at",
  )
    .bind(c.get("userId"))
    .all<Row>();
  const result: StatsActivityDTO[] = (rows.results ?? []).map((r) => ({
    key: `${r.source}:${r.external_id}`,
    name: String(r.name),
    startAt: Number(r.start_at),
    day: String(r.day),
    type: String(r.type),
    isIndoor: Number(r.is_indoor) === 1,
    distanceM: Number(r.distance_m),
    movingS: Number(r.duration_s),
    elevationM: Number(r.elevation_m),
  }));
  return c.json(result);
});

stats.get("/stats/sessions", async (c) => {
  const rows = await c.env.DB.prepare("SELECT day, sport, status, details, linked_activity_key FROM planned_sessions WHERE user_id = ? ORDER BY day, position")
    .bind(c.get("userId"))
    .all<Row>();
  const result: StatsSessionDTO[] = (rows.results ?? []).map((r) => {
    const sport = (String(r.sport) in sportInfo ? String(r.sport) : "custom") as SportType;
    return {
      day: String(r.day),
      sport,
      status: String(r.status) as StatsSessionDTO["status"],
      plannedMinutes: plannedMinutes(parseDetails(String(r.details ?? "{}"), sportInfo[sport].category)),
      linkedActivityKey: r.linked_activity_key === null ? null : String(r.linked_activity_key),
    };
  });
  return c.json(result);
});

/** First day with any data (for "All Time" and the year picker). */
stats.get("/stats/range", async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    `SELECT MIN(day) AS earliest FROM (
       SELECT MIN(day) AS day FROM food_entries WHERE user_id = ?1
       UNION ALL SELECT MIN(day) FROM activities WHERE user_id = ?1
       UNION ALL SELECT MIN(day) FROM planned_sessions WHERE user_id = ?1)`,
  )
    .bind(userId)
    .first<{ earliest: string | null }>();
  return c.json({ earliest: row?.earliest ?? null });
});

// MARK: Yearly goals

stats.get("/goals", async (c) => {
  const rows = await c.env.DB.prepare("SELECT year, sport, distance_km, hours FROM yearly_goals WHERE user_id = ? ORDER BY year, sport").bind(c.get("userId")).all<Row>();
  const result: GoalDTO[] = (rows.results ?? []).map((r) => ({
    year: Number(r.year),
    sport: String(r.sport),
    distanceKm: r.distance_km === null ? null : Number(r.distance_km),
    hours: r.hours === null ? null : Number(r.hours),
  }));
  return c.json(result);
});

/** Creates or replaces the goal for (year, sport filter). */
stats.put("/goals", async (c) => {
  const body = await jsonBody<{ year?: number; sport?: string; distanceKm?: number | null; hours?: number | null }>(c.req.raw);
  const year = Math.floor(optNum(body.year) ?? 0);
  if (year < 2000 || year > 2100) badRequest("Invalid year");
  if (!STATS_FILTERS.includes(body.sport as StatsSportFilter)) badRequest("Invalid sport");
  const distance = optNum(body.distanceKm);
  const hours = optNum(body.hours);
  const valid = (v: number | null) => (v !== null && v > 0 ? v : null);
  if (valid(distance) === null && valid(hours) === null) badRequest("Set a distance or an hours target");
  await c.env.DB.prepare(
    `INSERT INTO yearly_goals (user_id, year, sport, distance_km, hours, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, year, sport) DO UPDATE SET distance_km = excluded.distance_km, hours = excluded.hours, updated_at = excluded.updated_at`,
  )
    .bind(c.get("userId"), year, body.sport, valid(distance), valid(hours), Date.now())
    .run();
  return c.json({ year, sport: String(body.sport), distanceKm: valid(distance), hours: valid(hours) } satisfies GoalDTO);
});

stats.delete("/goals/:year/:sport", async (c) => {
  await c.env.DB.prepare("DELETE FROM yearly_goals WHERE user_id = ? AND year = ? AND sport = ?")
    .bind(c.get("userId"), Number(c.req.param("year")), c.req.param("sport"))
    .run();
  return c.body(null, 204);
});
