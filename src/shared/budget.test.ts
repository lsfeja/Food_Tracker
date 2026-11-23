import { describe, expect, it } from "vitest";
import { budgetFor, calorieBudget, type DayTotals, totalsByDay } from "./budget";
import { addDays } from "./days";
import { dayStats, weekStats } from "./historyStats";
import type { UserSettings } from "./settings";

const n = (kcal: number, protein = 0) => ({ kcal, protein, carbs: 0, fat: 0 });
const totals = (kcal: number, active = 0, extra: Partial<DayTotals> = {}): DayTotals => ({ eaten: n(kcal), activeCalories: active, ...extra });

function settings(o: { kcal?: number; active?: boolean; percent?: number } = {}): UserSettings {
  return {
    targets: { kcal: o.kcal ?? 2000, protein: 150, carbs: 200, fat: 70 },
    budget: { activeCaloriesEnabled: o.active ?? true, activeCaloriesPercent: o.percent ?? 100, restDayActivePct: 75, maxDailyDeficit: 700, carryOverPct: 70 },
    timezone: "UTC",
  };
}

// 2025-11-17 is a Monday.
const monday = "2025-11-17";
const tuesday = "2025-11-18";
const wednesday = "2025-11-19";

/** 12 weeks of history with `active` kcal per day before `monday`. */
function history(active: number): Record<string, DayTotals> {
  const result: Record<string, DayTotals> = {};
  for (let i = 1; i <= 84; i++) result[addDays(monday, -i)] = totals(0, active);
  return result;
}

describe("budget", () => {
  it("computes remaining and progress", () => {
    expect(calorieBudget(2500, 3000)).toMatchObject({ remaining: -500, isOver: true });
    expect(calorieBudget(2000, 500).progress).toBe(0.25);
  });

  it("uses base + 4-week average as the daily target (not the day's own activity)", () => {
    const b = budgetFor(monday, settings(), { ...history(400), [monday]: totals(500, 300) }, monday);
    expect(b.calories.total).toBeCloseTo(2400);
    expect(b.calories.remaining).toBeCloseTo(1900);
    expect(b.active).toBe(300);
    expect(b.week?.plan).toBeCloseTo(7 * 2400);
  });

  it("applies the counted share and can ignore activity", () => {
    expect(budgetFor(monday, settings({ percent: 50 }), history(400), monday).calories.total).toBeCloseTo(2200);
    expect(budgetFor(monday, settings({ active: false }), history(400), monday).calories.total).toBe(2000);
  });

  it("protects rest days read from the plan", () => {
    const b = budgetFor(monday, settings(), { ...history(400), [monday]: totals(0, 0, { restDay: true }) }, monday);
    expect(b.calories.total).toBeGreaterThanOrEqual(2300);
    expect(b.plan?.restDay).toBe(true);
  });

  it("groups entries and activities by day", () => {
    const t = totalsByDay(
      [
        { day: monday, kcal: 300, protein: 10, carbs: 0, fat: 0 },
        { day: monday, kcal: 700, protein: 25, carbs: 0, fat: 0 },
        { day: tuesday, kcal: 90, protein: 0, carbs: 0, fat: 0 },
      ],
      [{ day: monday, activeKcal: 650 }],
    );
    expect(t[monday].eaten.kcal).toBe(1000);
    expect(t[monday].eaten.protein).toBe(35);
    expect(t[monday].activeCalories).toBe(650);
    expect(t[tuesday].eaten.kcal).toBe(90);
  });
});

describe("history stats", () => {
  const s = settings();

  it("lists days oldest first with their targets", () => {
    const stats = dayStats(wednesday, 3, { ...history(300), [monday]: totals(0, 300), [tuesday]: totals(1800, 300) }, s);
    expect(stats.map((d) => d.day)).toEqual([monday, tuesday, wednesday]);
    expect(stats[1].budget).toBeCloseTo(2300);
    expect(stats[0].eaten.kcal).toBe(0);
    // Tuesday's 500 kcal left over move to Wed–Sun.
    expect(stats[2].budget).toBeCloseTo(2300 + 500 / 5);
  });

  it("sums weeks with their plans", () => {
    const stats = weekStats(wednesday, 2, { ...history(300), [monday]: totals(2000, 300), [wednesday]: totals(1500, 300), "2025-11-10": totals(2500, 300) }, s);
    expect(stats.map((w) => w.start)).toEqual(["2025-11-10", monday]);
    expect(stats[0].eatenKcal).toBe(2500);
    expect(stats[1].eatenKcal).toBe(3500);
    expect(stats[1].plan).toBeCloseTo(7 * 2300);
    expect(stats[1].loggedDays).toBe(2);
    expect(stats[1].averagePerLoggedDay).toBe(1750);
  });
});
