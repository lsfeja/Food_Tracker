import { describe, expect, it } from "vitest";
import type { DayDTO, EntryDTO, FoodDTO } from "../../src/shared/api";
import { env } from "cloudflare:test";
import type { DayTotals } from "../../src/shared/budget";
import type { UserSettings } from "../../src/shared/settings";
import { api } from "./helpers";

describe("settings", () => {
  it("returns defaults and saves partial updates", async () => {
    const call = api("settings@example.com");
    const initial = await call<UserSettings>("GET", "/settings");
    expect(initial.data.targets.kcal).toBe(2200);
    expect(initial.data.timezone).toBe("Europe/Berlin");

    expect(initial.data.budget).toMatchObject({ activeCaloriesEnabled: true, goalKcal: 0 });

    const updated = await call<UserSettings>("PUT", "/settings", { targets: { kcal: 2500 }, budget: { activeCaloriesEnabled: false } });
    expect(updated.data.targets.kcal).toBe(2500);
    expect(updated.data.targets.protein).toBe(140);
    expect(updated.data.budget.activeCaloriesEnabled).toBe(false);
    expect(updated.data.budget.goalKcal).toBe(0);

    const goal = await call<UserSettings>("PUT", "/settings", { budget: { goalKcal: -250 } });
    expect(goal.data.budget.goalKcal).toBe(-250);
    expect(goal.data.budget.activeCaloriesEnabled).toBe(false);
    const surplus = await call<UserSettings>("PUT", "/settings", { budget: { goalKcal: 5000 } });
    expect(surplus.data.budget.goalKcal).toBe(750);
  });
});

describe("budget settings per day", () => {
  it("has the new defaults and clamps values", async () => {
    const call = api("budget-defaults@example.com");
    const initial = await call<UserSettings>("GET", "/settings");
    expect(initial.data.budget).toMatchObject({ alpha: 0.2, carryEnabled: true, carryCapKcal: 300, sportFactors: {} });
    expect(initial.data.budget.calibration).toEqual({ intervalDays: 14, maxStepKcal: 100, damping: 0.5, kcalPerKg: 7700 });
    expect(initial.data.budgetHistory).toEqual([]);
    const updated = await call<UserSettings>("PUT", "/settings", {
      budget: { alpha: 5, carryCapKcal: -10, sportFactors: { weightTraining: 0.5, run: 9, bogus: 1 }, calibration: { intervalDays: 2, damping: 0.7 } },
    });
    expect(updated.data.budget).toMatchObject({ alpha: 0.9, carryCapKcal: 0, sportFactors: { weightTraining: 0.5 } });
    expect(updated.data.budget.calibration).toMatchObject({ intervalDays: 7, damping: 0.7, maxStepKcal: 100 });
  });

  it("keeps the old values for past days and applies changes from the given day", async () => {
    const call = api("budget-history@example.com");
    await call("PUT", "/settings", { targets: { kcal: 2400 }, day: "2026-11-01" });
    const first = await call<UserSettings>("PUT", "/settings", { budget: { goalKcal: -200 }, day: "2026-11-20" });
    expect(first.data.budgetHistory.map((e) => [e.day, e.baselineKcal, e.goalKcal])).toEqual([
      ["1970-01-01", 2200, 0],
      ["2026-11-01", 2400, 0],
      ["2026-11-20", 2400, -200],
    ]);
    // Same day again: replaces that day's row. Time zone only: no new row.
    await call("PUT", "/settings", { targets: { kcal: 2300 }, day: "2026-11-20" });
    const last = await call<UserSettings>("PUT", "/settings", { timezone: "Europe/Vienna", day: "2026-11-21" });
    expect(last.data.budgetHistory).toHaveLength(3);
    expect(last.data.budgetHistory[2]).toMatchObject({ day: "2026-11-20", baselineKcal: 2300, goalKcal: -200, alpha: 0.2, carryEnabled: true });
    // Other users don't see it.
    expect((await api("budget-other@example.com")<UserSettings>("GET", "/settings")).data.budgetHistory).toEqual([]);
  });

  it("returns the day's activities with moving time, sport and power meter in the totals", async () => {
    const call = api("budget-totals@example.com");
    await call("GET", "/settings");
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind("budget-totals@example.com").first<{ id: string }>();
    const insert = (id: string, type: string, kcal: number, moving: number, power: number) =>
      env.DB.prepare(
        `INSERT INTO activities (id, user_id, source, external_id, name, type, start_at, day, duration_s, active_kcal, has_power, updated_at)
         VALUES (?, ?, 'strava', ?, 'A', ?, ?, '2026-11-22', ?, ?, ?, 0)`,
      )
        .bind(id, user!.id, id, type, Number(id.slice(1)), moving, kcal, power)
        .run();
    await insert("a1", "Ride", 900, 3600, 1);
    await insert("a2", "WeightTraining", 300, 2700, 0);
    const totals = await call<Record<string, DayTotals>>("GET", "/totals?from=2026-11-22&to=2026-11-23");
    expect(totals.data["2026-11-22"].activeCalories).toBe(1200);
    expect(totals.data["2026-11-22"].activities).toEqual([
      { kcal: 900, movingS: 3600, sport: "Ride", hasPower: true },
      { kcal: 300, movingS: 2700, sport: "WeightTraining", hasPower: false },
    ]);
  });
});

describe("foods and entries", () => {
  it("logs a food by grams and updates usage stats", async () => {
    const call = api("foods@example.com");
    const food = await call<FoodDTO>("POST", "/foods", {
      name: "Oats",
      barcode: "4000000000017",
      kcal: 370,
      protein: 13,
      carbs: 60,
      fat: 7,
      source: "custom",
    });
    expect(food.status).toBe(201);

    const entry = await call<EntryDTO>("POST", "/entries", { day: "2026-03-10", foodId: food.data.id, grams: 50, source: "barcode" });
    expect(entry.status).toBe(201);
    expect(entry.data.kcal).toBeCloseTo(185);
    expect(entry.data.protein).toBeCloseTo(6.5);
    expect(entry.data.source).toBe("barcode");

    const foods = await call<FoodDTO[]>("GET", "/foods");
    expect(foods.data).toHaveLength(1);
    expect(foods.data[0].useCount).toBe(1);
    expect(foods.data[0].lastAmountG).toBe(50);

    // Same barcode → same food; UPC-A spelling finds the EAN-13.
    const again = await call<FoodDTO>("POST", "/foods", { name: "Oats 2", barcode: "4000000000017", kcal: 1 });
    expect(again.data.id).toBe(food.data.id);
    const byBarcode = await call<FoodDTO>("GET", "/foods/barcode/4000000000017");
    expect(byBarcode.data.name).toBe("Oats");
  });

  it("quick-adds, edits and deletes entries; day view has weekly totals", async () => {
    const call = api("entries@example.com");
    await call("POST", "/entries", { day: "2026-03-09", name: "Lunch", kcal: 800, protein: 40 });
    const quick = await call<EntryDTO>("POST", "/entries", { day: "2026-03-10", kcal: 300 });
    expect(quick.data.name).toBe("Quick add");
    expect(quick.data.grams).toBeNull();

    const edited = await call<EntryDTO>("PATCH", `/entries/${quick.data.id}`, { kcal: 350, name: "Snack" });
    expect(edited.data.kcal).toBe(350);
    expect(edited.data.name).toBe("Snack");

    await call("POST", "/sessions", { day: "2026-03-08", content: { sport: "rest", title: "", details: { kind: "general" } } });
    const day = await call<DayDTO>("GET", "/day/2026-03-10");
    expect(day.data.entries).toHaveLength(1);
    expect(day.data.totals["2026-03-08"].restDay).toBe(true);
    expect(day.data.totals["2026-03-09"].eaten.kcal).toBe(800); // Monday of the same week
    expect(day.data.totals["2026-03-10"].eaten.kcal).toBe(350);

    const deleted = await call("DELETE", `/entries/${quick.data.id}`);
    expect(deleted.status).toBe(204);
    const after = await call<DayDTO>("GET", "/day/2026-03-10");
    expect(after.data.entries).toHaveLength(0);
  });

  it("scales gram-based entries when grams change", async () => {
    const call = api("scale@example.com");
    const food = await call<FoodDTO>("POST", "/foods", { name: "Rice", kcal: 130, carbs: 28 });
    const entry = await call<EntryDTO>("POST", "/entries", { day: "2026-03-10", foodId: food.data.id, grams: 100 });
    const edited = await call<EntryDTO>("PATCH", `/entries/${entry.data.id}`, { grams: 250 });
    expect(edited.data.kcal).toBeCloseTo(325);
    expect(edited.data.carbs).toBeCloseTo(70);
  });

  it("keeps users apart and validates input", async () => {
    const a = api("a@example.com");
    const b = api("b@example.com");
    const entry = await a<EntryDTO>("POST", "/entries", { day: "2026-03-10", kcal: 100 });
    expect((await b("DELETE", `/entries/${entry.data.id}`)).status).toBe(204);
    expect((await a<DayDTO>("GET", "/day/2026-03-10")).data.entries).toHaveLength(1);
    expect((await b("PATCH", `/entries/${entry.data.id}`, { kcal: 1 })).status).toBe(404);

    expect((await a("POST", "/entries", { day: "10.03.2026", kcal: 100 })).status).toBe(400);
    expect((await a("POST", "/foods", { name: "", kcal: 100 })).status).toBe(400);
    const totals = await a<Record<string, unknown>>("GET", "/totals?from=2026-03-01&to=2026-04-01");
    expect(Object.keys(totals.data)).toEqual(["2026-03-10"]);
  });

  it("marks vacation days that are flagged in the totals", async () => {
    const call = api("vacation@example.com");
    expect((await call("PUT", "/untracked-days/2026-12-24")).status).toBe(204);
    await call("PUT", "/untracked-days/2026-12-25");
    await call("PUT", "/untracked-days/2026-12-25"); // idempotent
    expect((await call<string[]>("GET", "/untracked-days")).data).toEqual(["2026-12-24", "2026-12-25"]);
    const day = await call<DayDTO>("GET", "/day/2026-12-24");
    expect(day.data.totals["2026-12-24"].untracked).toBe(true);
    await call("DELETE", "/untracked-days/2026-12-24");
    expect((await call<string[]>("GET", "/untracked-days")).data).toEqual(["2026-12-25"]);
    expect((await call("PUT", "/untracked-days/24.12.2026")).status).toBe(400);
    // Other users don't see them.
    expect((await api("other@example.com")<string[]>("GET", "/untracked-days")).data).toEqual([]);
  });
});
