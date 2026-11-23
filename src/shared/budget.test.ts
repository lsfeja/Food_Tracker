import { describe, expect, it } from "vitest";
import { budgetFor, countedActiveCalories, type DayTotals, totalsByDay } from "./budget";
import { dayStats, weekStats } from "./historyStats";
import type { UserSettings } from "./settings";

const n = (kcal: number, protein = 0) => ({ kcal, protein, carbs: 0, fat: 0 });
const totals = (kcal: number, active = 0): DayTotals => ({ eaten: n(kcal), activeCalories: active });

function settings(o: { kcal?: number; weekly?: boolean; limit?: number; active?: boolean; percent?: number } = {}): UserSettings {
  return {
    targets: { kcal: o.kcal ?? 2000, protein: 150, carbs: 200, fat: 70 },
    budget: {
      weeklyModeEnabled: o.weekly ?? false,
      weeklyLimitKcal: o.limit ?? 0,
      activeCaloriesEnabled: o.active ?? true,
      activeCaloriesPercent: o.percent ?? 100,
    },
    timezone: "UTC",
  };
}

// 2025-11-17 is a Monday.
const monday = "2025-11-17";
const tuesday = "2025-11-18";
const wednesday = "2025-11-19";

describe("budget", () => {
  it("adds active calories in daily mode", () => {
    const b = budgetFor(monday, settings(), { [monday]: totals(500, 300) });
    expect(b.calories.baseTarget).toBe(2000);
    expect(b.calories.activeBonus).toBe(300);
    expect(b.calories.remaining).toBe(1800);
    expect(b.weekly).toBeNull();
  });

  it("applies and clamps the active percentage", () => {
    expect(budgetFor(monday, settings({ percent: 50 }), { [monday]: totals(0, 300) }).calories.activeBonus).toBe(150);
    expect(countedActiveCalories(400, settings({ percent: 20 }).budget)).toBe(200);
    expect(countedActiveCalories(400, settings({ percent: 150 }).budget)).toBe(400);
    expect(budgetFor(monday, settings({ active: false }), { [monday]: totals(0, 300) }).calories.remaining).toBe(2000);
  });

  it("splits the weekly limit evenly on Monday", () => {
    const b = budgetFor(monday, settings({ weekly: true }), {});
    expect(b.calories.baseTarget).toBe(2000);
    expect(b.weekly?.limit).toBe(14000);
    expect(b.weekly?.daysRemaining).toBe(7);
  });

  it("carries over previous days in weekly mode", () => {
    const b = budgetFor(wednesday, settings({ weekly: true }), {
      [monday]: totals(2500),
      [tuesday]: totals(1500),
      [wednesday]: totals(600),
    });
    expect(b.calories.baseTarget).toBe(2000); // (14,000 − 4,000) / 5
    expect(b.calories.remaining).toBe(1400);
    expect(b.weekly?.daysRemaining).toBe(5);
    expect(b.weekly?.eaten).toBe(4600);
    expect(b.weekly?.remaining).toBe(9400);
  });

  it("counts previous active calories and custom limits; never negative", () => {
    expect(budgetFor(tuesday, settings({ weekly: true, percent: 50 }), { [monday]: totals(2000, 600) }).calories.baseTarget).toBe(2050);
    expect(budgetFor(monday, settings({ weekly: true, limit: 12600 }), {}).calories.baseTarget).toBe(1800);
    const over = budgetFor(tuesday, settings({ weekly: true }), { [monday]: totals(20000) });
    expect(over.calories.baseTarget).toBe(0);
    expect(over.weekly!.remaining).toBeLessThan(0);
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
  const s = settings({ percent: 50 });

  it("lists days oldest first with budgets", () => {
    const stats = dayStats(wednesday, 3, { [tuesday]: totals(1800, 400) }, s);
    expect(stats.map((d) => d.day)).toEqual([monday, tuesday, wednesday]);
    expect(stats[1].budget).toBe(2200);
    expect(stats[0].hasData).toBe(false);
  });

  it("sums weeks with counted active calories", () => {
    const stats = weekStats(wednesday, 2, { [monday]: totals(2000, 600), [wednesday]: totals(1500), "2025-11-10": totals(2500) }, s);
    expect(stats.map((w) => w.start)).toEqual(["2025-11-10", monday]);
    expect(stats[0].eatenKcal).toBe(2500);
    expect(stats[1].eatenKcal).toBe(3500);
    expect(stats[1].budget).toBe(14300);
    expect(stats[1].loggedDays).toBe(2);
    expect(stats[1].averagePerLoggedDay).toBe(1750);
  });
});
