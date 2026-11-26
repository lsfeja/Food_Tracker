import { Hono } from "hono";
import type { DayDTO } from "../../shared/api";
import { addDays, weekStart } from "../../shared/days";
import { inputStart } from "../../shared/energyBudget";
import { barcodeVariants } from "../../shared/food";
import { forAmount } from "../../shared/nutrients";
import { activityFromRow, entryFromRow, foodFromRow, loadSettings, newId, parseFactors, recordBudgetChange, totalsBetween } from "../db";
import type { AppContext } from "../env";
import { badRequest, isDay, jsonBody, notFound, num, optNum, requireDay, str } from "../http";

export const nutrition = new Hono<AppContext>();

// MARK: Settings

nutrition.get("/settings", async (c) => c.json(await loadSettings(c.env.DB, c.get("userId"))));

nutrition.put("/settings", async (c) => {
  const body = await jsonBody<Record<string, any>>(c.req.raw);
  const userId = c.get("userId");
  const db = c.env.DB;
  const current = await loadSettings(db, userId);
  const t = { ...current.targets, ...(body.targets ?? {}) };
  const b = { ...current.budget, ...(body.budget ?? {}) };
  const cal = { ...current.budget.calibration, ...(body.budget?.calibration ?? {}) };
  const timezone = typeof body.timezone === "string" && body.timezone ? body.timezone : current.timezone;
  const positive = (v: unknown, fallback: number) => (num(v, fallback) > 0 ? num(v, fallback) : fallback);
  const within = (v: unknown, fallback: number, min: number, max: number) => Math.min(Math.max(num(v, fallback), min), max);
  await db
    .prepare(
      `UPDATE settings SET target_kcal = ?, target_protein = ?, target_carbs = ?, target_fat = ?, active_enabled = ?, goal_kcal = ?, alpha = ?,
         carry_enabled = ?, carry_cap_kcal = ?,
         sport_factors = ?, calib_interval_days = ?, calib_max_step_kcal = ?, calib_damping = ?, kcal_per_kg = ?, timezone = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(
      positive(t.kcal, current.targets.kcal),
      positive(t.protein, current.targets.protein),
      positive(t.carbs, current.targets.carbs),
      positive(t.fat, current.targets.fat),
      b.activeCaloriesEnabled ? 1 : 0,
      // Negative = deficit; a surplus is capped at +750.
      within(b.goalKcal, 0, -2000, 750),
      within(b.alpha, 0.2, 0.05, 0.9),
      b.carryEnabled ? 1 : 0,
      within(b.carryCapKcal, 300, 0, 1500),
      JSON.stringify(parseFactors(b.sportFactors)),
      Math.round(within(cal.intervalDays, 14, 7, 60)),
      within(cal.maxStepKcal, 100, 0, 500),
      within(cal.damping, 0.5, 0, 1),
      within(cal.kcalPerKg, 7700, 5000, 10000),
      timezone,
      Date.now(),
      userId,
    )
    .run();

  // Budget values apply per day: a change is valid from the user's today, past days keep theirs.
  await recordBudgetChange(db, userId, current, isDay(body.day) ? body.day : null);
  return c.json(await loadSettings(db, userId));
});

// MARK: Day & totals

nutrition.get("/day/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  const userId = c.get("userId");
  const db = c.env.DB;
  const [entries, activities] = await db.batch([
    db.prepare("SELECT * FROM food_entries WHERE user_id = ? AND day = ? ORDER BY logged_at DESC").bind(userId, day),
    db.prepare("SELECT * FROM activities WHERE user_id = ? AND day = ? ORDER BY start_at").bind(userId, day),
  ]);
  const result: DayDTO = {
    day,
    entries: ((entries.results ?? []) as Record<string, unknown>[]).map(entryFromRow),
    activities: ((activities.results ?? []) as Record<string, unknown>[]).map(activityFromRow),
    // Calorie target: the smoothing chain reaches back 12 weeks.
    totals: await totalsBetween(db, userId, inputStart(day), addDays(weekStart(day), 7)),
  };
  return c.json(result);
});

// MARK: Vacation days (not tracked)

nutrition.get("/untracked-days", async (c) => {
  const rows = await c.env.DB.prepare("SELECT day FROM untracked_days WHERE user_id = ? ORDER BY day").bind(c.get("userId")).all<{ day: string }>();
  return c.json((rows.results ?? []).map((r) => r.day));
});

nutrition.put("/untracked-days/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  await c.env.DB.prepare("INSERT OR IGNORE INTO untracked_days (user_id, day, created_at) VALUES (?, ?, ?)").bind(c.get("userId"), day, Date.now()).run();
  return c.body(null, 204);
});

nutrition.delete("/untracked-days/:day", async (c) => {
  const day = requireDay(c.req.param("day"));
  await c.env.DB.prepare("DELETE FROM untracked_days WHERE user_id = ? AND day = ?").bind(c.get("userId"), day).run();
  return c.body(null, 204);
});

nutrition.get("/totals", async (c) => {
  const from = requireDay(c.req.query("from"), "from");
  const to = requireDay(c.req.query("to"), "to");
  return c.json(await totalsBetween(c.env.DB, c.get("userId"), from, to));
});

// MARK: Foods

nutrition.get("/foods", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM foods WHERE user_id = ? AND hidden = 0 ORDER BY name COLLATE NOCASE")
    .bind(c.get("userId"))
    .all<Record<string, unknown>>();
  return c.json((rows.results ?? []).map(foodFromRow));
});

async function findByBarcode(db: D1Database, userId: string, code: string) {
  const variants = barcodeVariants(code);
  if (!variants.length) return null;
  const placeholders = variants.map(() => "?").join(", ");
  return db
    .prepare(`SELECT * FROM foods WHERE user_id = ? AND barcode IN (${placeholders}) ORDER BY hidden, created_at LIMIT 1`)
    .bind(userId, ...variants)
    .first<Record<string, unknown>>();
}

nutrition.get("/foods/barcode/:code", async (c) => {
  const row = await findByBarcode(c.env.DB, c.get("userId"), c.req.param("code"));
  if (!row) return c.json(null);
  if (Number(row.hidden) === 1) {
    await c.env.DB.prepare("UPDATE foods SET hidden = 0 WHERE id = ?").bind(row.id).run();
    row.hidden = 0;
  }
  return c.json(foodFromRow(row));
});

interface FoodBody {
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  servingGrams?: number | null;
  source?: string;
}

function foodValues(body: FoodBody) {
  const name = str(body.name).trim();
  if (!name) badRequest("name is required");
  const kcal = optNum(body.kcal);
  if (kcal === null || kcal < 0) badRequest("kcal is required");
  const brand = str(body.brand).trim() || null;
  const barcode = str(body.barcode).replace(/\D/g, "") || null;
  const serving = optNum(body.servingGrams);
  const source = ["custom", "openFoodFacts", "label"].includes(str(body.source)) ? str(body.source) : "custom";
  return {
    name,
    brand,
    barcode,
    kcal,
    protein: Math.max(optNum(body.protein) ?? 0, 0),
    carbs: Math.max(optNum(body.carbs) ?? 0, 0),
    fat: Math.max(optNum(body.fat) ?? 0, 0),
    serving: serving !== null && serving > 0 ? serving : null,
    source,
  };
}

/** Creates a food; reuses an existing one with the same barcode. */
nutrition.post("/foods", async (c) => {
  const body = await jsonBody<FoodBody>(c.req.raw);
  const userId = c.get("userId");
  const v = foodValues(body);
  if (v.barcode) {
    const existing = await findByBarcode(c.env.DB, userId, v.barcode);
    if (existing) {
      await c.env.DB.prepare("UPDATE foods SET hidden = 0 WHERE id = ?").bind(existing.id).run();
      return c.json(foodFromRow({ ...existing, hidden: 0 }));
    }
  }
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO foods (id, user_id, name, brand, barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, v.name, v.brand, v.barcode, v.kcal, v.protein, v.carbs, v.fat, v.serving, v.source, Date.now())
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM foods WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json(foodFromRow(row!), 201);
});

nutrition.put("/foods/:id", async (c) => {
  const body = await jsonBody<FoodBody>(c.req.raw);
  const v = foodValues(body);
  const result = await c.env.DB.prepare(
    `UPDATE foods SET name = ?, brand = ?, barcode = ?, kcal_100g = ?, protein_100g = ?, carbs_100g = ?, fat_100g = ?, serving_g = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(v.name, v.brand, v.barcode, v.kcal, v.protein, v.carbs, v.fat, v.serving, c.req.param("id"), c.get("userId"))
    .run();
  if (!result.meta.changes) notFound();
  const row = await c.env.DB.prepare("SELECT * FROM foods WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  return c.json(foodFromRow(row!));
});

/** Hides a food (history keeps referring to it). */
nutrition.delete("/foods/:id", async (c) => {
  await c.env.DB.prepare("UPDATE foods SET hidden = 1 WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("userId")).run();
  return c.body(null, 204);
});

// MARK: Entries

interface EntryBody {
  day?: string;
  loggedAt?: number;
  source?: string;
  foodId?: string;
  grams?: number;
  name?: string;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  isEstimated?: boolean;
  note?: string | null;
}

const entrySources = ["manual", "barcode", "label", "ai"];

nutrition.post("/entries", async (c) => {
  const body = await jsonBody<EntryBody>(c.req.raw);
  const userId = c.get("userId");
  const db = c.env.DB;
  const day = requireDay(body.day);
  const loggedAt = optNum(body.loggedAt) ?? Date.now();
  const source = entrySources.includes(str(body.source)) ? str(body.source) : "manual";
  const id = newId();
  const statements: D1PreparedStatement[] = [];

  if (body.foodId) {
    const food = await db.prepare("SELECT * FROM foods WHERE id = ? AND user_id = ?").bind(body.foodId, userId).first<Record<string, unknown>>();
    if (!food) notFound("Food not found");
    const grams = optNum(body.grams);
    if (grams === null || grams <= 0) badRequest("grams must be > 0");
    const values = forAmount(
      { kcal: Number(food.kcal_100g), protein: Number(food.protein_100g), carbs: Number(food.carbs_100g), fat: Number(food.fat_100g) },
      grams,
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO food_entries (id, user_id, day, logged_at, name, grams, kcal, protein, carbs, fat, source, is_estimated, note, food_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(id, userId, day, loggedAt, String(food.name), grams, values.kcal, values.protein, values.carbs, values.fat, source, body.note ?? null, food.id),
      db
        .prepare("UPDATE foods SET last_used_at = ?, use_count = use_count + 1, last_amount_g = ?, hidden = 0 WHERE id = ?")
        .bind(Date.now(), grams, food.id),
    );
  } else {
    const kcal = optNum(body.kcal);
    if (kcal === null || kcal <= 0) badRequest("kcal must be > 0");
    const name = str(body.name).trim() || "Quick add";
    statements.push(
      db
        .prepare(
          `INSERT INTO food_entries (id, user_id, day, logged_at, name, grams, kcal, protein, carbs, fat, source, is_estimated, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          userId,
          day,
          loggedAt,
          name,
          optNum(body.grams),
          kcal,
          Math.max(optNum(body.protein) ?? 0, 0),
          Math.max(optNum(body.carbs) ?? 0, 0),
          Math.max(optNum(body.fat) ?? 0, 0),
          source,
          body.isEstimated ? 1 : 0,
          body.note ?? null,
        ),
    );
  }
  await db.batch(statements);
  const row = await db.prepare("SELECT * FROM food_entries WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json(entryFromRow(row!), 201);
});

nutrition.patch("/entries/:id", async (c) => {
  const body = await jsonBody<EntryBody>(c.req.raw);
  const userId = c.get("userId");
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM food_entries WHERE id = ? AND user_id = ?").bind(c.req.param("id"), userId).first<Record<string, unknown>>();
  if (!row) notFound();
  const entry = entryFromRow(row);
  let { kcal, protein, carbs, fat, grams } = entry;

  const newGrams = optNum(body.grams);
  if (newGrams !== null && newGrams > 0 && newGrams !== grams) {
    if (grams !== null && grams > 0) {
      const factor = newGrams / grams;
      kcal *= factor;
      protein *= factor;
      carbs *= factor;
      fat *= factor;
    } else if (entry.foodId) {
      const food = await db.prepare("SELECT * FROM foods WHERE id = ?").bind(entry.foodId).first<Record<string, unknown>>();
      if (food) {
        const v = forAmount({ kcal: Number(food.kcal_100g), protein: Number(food.protein_100g), carbs: Number(food.carbs_100g), fat: Number(food.fat_100g) }, newGrams);
        ({ kcal, protein, carbs, fat } = v);
      }
    }
    grams = newGrams;
  } else if (body.kcal !== undefined) {
    kcal = Math.max(num(body.kcal, kcal), 0);
    protein = Math.max(num(body.protein, protein), 0);
    carbs = Math.max(num(body.carbs, carbs), 0);
    fat = Math.max(num(body.fat, fat), 0);
  }
  const day = body.day !== undefined ? requireDay(body.day) : entry.day;
  const name = str(body.name).trim() || entry.name;
  const loggedAt = optNum(body.loggedAt) ?? entry.loggedAt;

  await db
    .prepare("UPDATE food_entries SET day = ?, logged_at = ?, name = ?, grams = ?, kcal = ?, protein = ?, carbs = ?, fat = ? WHERE id = ?")
    .bind(day, loggedAt, name, grams, kcal, protein, carbs, fat, entry.id)
    .run();
  const updated = await db.prepare("SELECT * FROM food_entries WHERE id = ?").bind(entry.id).first<Record<string, unknown>>();
  return c.json(entryFromRow(updated!));
});

nutrition.delete("/entries/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM food_entries WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("userId")).run();
  return c.body(null, 204);
});
