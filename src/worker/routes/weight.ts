import { Hono } from "hono";
import type { WeightDTO } from "../../shared/api";
import { BODY_FAT_RANGE, validBodyFat, validWeight, WEIGHT_RANGE } from "../../shared/weight";
import type { AppContext } from "../env";
import { badRequest, jsonBody, notFound, optNum, requireDay } from "../http";

/** Body weight: one value per day (PUT replaces it), optional body fat, excluded flag. */
export const weight = new Hono<AppContext>();

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

type WeightRow = { day: string; weight_kg: number; body_fat_pct: number | null; excluded: number };

const fromRow = (row: WeightRow): WeightDTO => ({
  day: row.day,
  weightKg: row.weight_kg,
  bodyFatPct: row.body_fat_pct ?? null,
  excluded: Number(row.excluded) === 1,
});

weight.get("/weights", async (c) => {
  const rows = await c.env.DB.prepare("SELECT day, weight_kg, body_fat_pct, excluded FROM body_weights WHERE user_id = ? ORDER BY day")
    .bind(c.get("userId"))
    .all<WeightRow>();
  return c.json((rows.results ?? []).map(fromRow));
});

weight.put("/weights/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  const body = await jsonBody<{ weightKg?: unknown; bodyFatPct?: unknown; excluded?: unknown }>(c.req.raw);
  const weightKg = optNum(body.weightKg);
  if (!validWeight(weightKg)) badRequest(`weightKg must be between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max}`);
  const bodyFatPct = optNum(body.bodyFatPct);
  if (bodyFatPct !== null && !validBodyFat(bodyFatPct)) badRequest(`bodyFatPct must be between ${BODY_FAT_RANGE.min} and ${BODY_FAT_RANGE.max}`);
  const now = Date.now();
  const excludedFlag = typeof body.excluded === "boolean" ? (body.excluded ? 1 : 0) : null;
  // A new value keeps the day's "excluded" flag unless the body sets it.
  const row = await c.env.DB.prepare(
    `INSERT INTO body_weights (user_id, day, weight_kg, body_fat_pct, excluded, created_at, updated_at) VALUES (?, ?, ?, ?, COALESCE(?, 0), ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET weight_kg = excluded.weight_kg, body_fat_pct = excluded.body_fat_pct,
       excluded = COALESCE(?, body_weights.excluded), updated_at = excluded.updated_at
     RETURNING day, weight_kg, body_fat_pct, excluded`,
  )
    .bind(c.get("userId"), day, round(weightKg, 2), bodyFatPct === null ? null : round(bodyFatPct, 1), excludedFlag, now, now, excludedFlag)
    .first<WeightRow>();
  return c.json(fromRow(row!));
});

/** Excludes a weigh-in from trend and calibration (or includes it again). */
weight.patch("/weights/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  const body = await jsonBody<{ excluded?: unknown }>(c.req.raw);
  if (typeof body.excluded !== "boolean") badRequest("excluded must be true or false");
  const row = await c.env.DB.prepare(
    "UPDATE body_weights SET excluded = ?, updated_at = ? WHERE user_id = ? AND day = ? RETURNING day, weight_kg, body_fat_pct, excluded",
  )
    .bind(body.excluded ? 1 : 0, Date.now(), c.get("userId"), day)
    .first<WeightRow>();
  if (!row) notFound("No weight on that day");
  return c.json(fromRow(row));
});

weight.delete("/weights/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  await c.env.DB.prepare("DELETE FROM body_weights WHERE user_id = ? AND day = ?").bind(c.get("userId"), day).run();
  return c.body(null, 204);
});
