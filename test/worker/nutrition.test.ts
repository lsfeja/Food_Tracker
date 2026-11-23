import { describe, expect, it } from "vitest";
import type { DayDTO, EntryDTO, FoodDTO } from "../../src/shared/api";
import type { UserSettings } from "../../src/shared/settings";
import { api } from "./helpers";

describe("settings", () => {
  it("returns defaults and saves partial updates", async () => {
    const call = api("settings@example.com");
    const initial = await call<UserSettings>("GET", "/settings");
    expect(initial.data.targets.kcal).toBe(2200);
    expect(initial.data.timezone).toBe("Europe/Berlin");

    const updated = await call<UserSettings>("PUT", "/settings", {
      targets: { kcal: 2500 },
      budget: { weeklyModeEnabled: true, weeklyLimitKcal: 16000, activeCaloriesPercent: 30 },
    });
    expect(updated.data.targets.kcal).toBe(2500);
    expect(updated.data.targets.protein).toBe(140);
    expect(updated.data.budget.weeklyModeEnabled).toBe(true);
    expect(updated.data.budget.weeklyLimitKcal).toBe(16000);
    expect(updated.data.budget.activeCaloriesPercent).toBe(50); // clamped to 50–100
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

    const day = await call<DayDTO>("GET", "/day/2026-03-10");
    expect(day.data.entries).toHaveLength(1);
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
});
