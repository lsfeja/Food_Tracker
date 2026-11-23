import { Hono } from "hono";
import type { WeightDTO } from "../../shared/api";
import { BODY_FAT_RANGE, validBodyFat, validWeight, WEIGHT_RANGE } from "../../shared/weight";
import type { AppContext } from "../env";
import { badRequest, jsonBody, optNum, requireDay } from "../http";

/** Body weight: one value per day (PUT replaces it), optional body fat. */
export const weight = new Hono<AppContext>();

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

const fromRow = (row: { day: string; weight_kg: number; body_fat_pct: number | null }): WeightDTO => ({
  day: row.day,
  weightKg: row.weight_kg,
  bodyFatPct: row.body_fat_pct ?? null,
});

weight.get("/weights", async (c) => {
  const rows = await c.env.DB.prepare("SELECT day, weight_kg, body_fat_pct FROM body_weights WHERE user_id = ? ORDER BY day")
    .bind(c.get("userId"))
    .all<{ day: string; weight_kg: number; body_fat_pct: number | null }>();
  return c.json((rows.results ?? []).map(fromRow));
});

weight.put("/weights/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  const body = await jsonBody<{ weightKg?: unknown; bodyFatPct?: unknown }>(c.req.raw);
  const weightKg = optNum(body.weightKg);
  if (!validWeight(weightKg)) badRequest(`weightKg must be between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max}`);
  const bodyFatPct = optNum(body.bodyFatPct);
  if (bodyFatPct !== null && !validBodyFat(bodyFatPct)) badRequest(`bodyFatPct must be between ${BODY_FAT_RANGE.min} and ${BODY_FAT_RANGE.max}`);
  const now = Date.now();
  const dto: WeightDTO = { day, weightKg: round(weightKg, 2), bodyFatPct: bodyFatPct === null ? null : round(bodyFatPct, 1) };
  await c.env.DB.prepare(
    `INSERT INTO body_weights (user_id, day, weight_kg, body_fat_pct, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET weight_kg = excluded.weight_kg, body_fat_pct = excluded.body_fat_pct, updated_at = excluded.updated_at`,
  )
    .bind(c.get("userId"), day, dto.weightKg, dto.bodyFatPct, now, now)
    .run();
  return c.json(dto);
});

weight.delete("/weights/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  await c.env.DB.prepare("DELETE FROM body_weights WHERE user_id = ? AND day = ?").bind(c.get("userId"), day).run();
  return c.body(null, 204);
});
