import { Hono } from "hono";
import type { CalibrationDTO } from "../../shared/api";
import { loadSettings, newId, recordBudgetChange } from "../db";
import type { AppContext } from "../env";
import { badRequest, jsonBody, num, requireDay, str } from "../http";

/** Calibration log: the client computes the proposal; applying it moves the baseline from `day`. */
export const calibration = new Hono<AppContext>();

type Row = Record<string, unknown>;

const fromRow = (r: Row): CalibrationDTO => {
  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(String(r.details ?? "{}")) as Record<string, unknown>;
  } catch {
    details = {};
  }
  return {
    id: String(r.id),
    day: String(r.day),
    decision: r.decision === "accepted" ? "accepted" : "declined",
    oldBaseline: Number(r.old_baseline),
    newBaseline: Number(r.new_baseline),
    adjustment: Number(r.adjustment),
    reason: String(r.reason ?? ""),
    details,
    createdAt: Number(r.created_at),
  };
};

calibration.get("/calibrations", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM calibrations WHERE user_id = ? ORDER BY day DESC, created_at DESC").bind(c.get("userId")).all<Row>();
  return c.json((rows.results ?? []).map(fromRow));
});

calibration.post("/calibrations", async (c) => {
  const body = await jsonBody<{ day?: unknown; decision?: unknown; adjustment?: unknown; reason?: unknown; details?: unknown }>(c.req.raw);
  const day = requireDay(body.day);
  if (body.decision !== "accepted" && body.decision !== "declined") badRequest("decision must be accepted or declined");
  const adjustment = Math.round(num(body.adjustment, Number.NaN));
  if (!Number.isFinite(adjustment)) badRequest("adjustment must be a number");
  const db = c.env.DB;
  const userId = c.get("userId");
  const settings = await loadSettings(db, userId);
  if (Math.abs(adjustment) > settings.budget.calibration.maxStepKcal) badRequest(`adjustment exceeds ±${settings.budget.calibration.maxStepKcal} kcal`);
  const oldBaseline = settings.targets.kcal;
  const row: CalibrationDTO = {
    id: newId(),
    day,
    decision: body.decision,
    oldBaseline,
    newBaseline: oldBaseline + adjustment,
    adjustment,
    reason: str(body.reason).slice(0, 500),
    details: body.details && typeof body.details === "object" ? (body.details as Record<string, unknown>) : {},
    createdAt: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO calibrations (id, user_id, day, decision, old_baseline, new_baseline, adjustment, reason, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, userId, day, row.decision, row.oldBaseline, row.newBaseline, adjustment, row.reason, JSON.stringify(row.details).slice(0, 4000), row.createdAt)
    .run();
  if (row.decision === "accepted" && adjustment !== 0) {
    await db.prepare("UPDATE settings SET target_kcal = ?, updated_at = ? WHERE user_id = ?").bind(row.newBaseline, Date.now(), userId).run();
    await recordBudgetChange(db, userId, settings, day);
  }
  return c.json({ calibration: row, settings: await loadSettings(db, userId) });
});
