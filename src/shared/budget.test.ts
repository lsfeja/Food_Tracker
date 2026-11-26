import { describe, expect, it } from "vitest";
import { budgetFor, calorieBudget, type DayTotals, totalsByDay } from "./budget";
import { DEFAULT_CALIBRATION } from "./calibration";
import { addDays } from "./days";
import { dayStats, weekStats } from "./historyStats";
import type { BudgetHistoryEntry, UserSettings } from "./settings";

const n = (kcal: number, protein = 0) => ({ kcal, protein, carbs: 0, fat: 0 });
/** `active` = cleaned kcal (virtual ride without moving time, factor 1). */
const totals = (kcal: number, active = 0, extra: Partial<DayTotals> = {}): DayTotals => ({
  eaten: n(kcal),
  activeCalories: active,
  activities: active > 0 ? [{ kcal: active, movingS: 0, sport: "VirtualRide", hasPower: true }] : [],
  ...extra,
});

function settings(o: { kcal?: number; active?: boolean; goal?: number; history?: BudgetHistoryEntry[] } = {}): UserSettings {
  return {
    targets: { kcal: o.kcal ?? 2000, protein: 150, carbs: 200, fat: 70 },
    budget: {
      activeCaloriesEnabled: o.active ?? true,
      goalKcal: o.goal ?? 0,
      alpha: 0.2,
      carryEnabled: true,
      carryCapKcal: 300,
      sportFactors: {},
      calibration: DEFAULT_CALIBRATION,
    },
    timezone: "UTC",
    budgetHistory: o.history ?? [],
  };
}

// 2025-11-17 is a Monday.
const monday = "2025-11-17";
const tuesday = "2025-11-18";
const wednesday = "2025-11-19";

/** 20 weeks with `active` cleaned kcal per day before `monday` → smoothed = active. */
function history(active: number): Record<string, DayTotals> {
  const result: Record<string, DayTotals> = {};
  for (let i = 1; i <= 140; i++) result[addDays(monday, -i)] = totals(0, active);
  return result;
}

describe("budget", () => {
  it("computes remaining and progress", () => {
    expect(calorieBudget(2500, 3000)).toMatchObject({ remaining: -500, isOver: true });
    expect(calorieBudget(2000, 500).progress).toBe(0.25);
  });

  it("target = base + smoothed training − deficit; today's workout counts from tomorrow", () => {
    const data = { ...history(400), [monday]: totals(500, 300) };
    const b = budgetFor(monday, settings(), data, monday);
    expect(b.calories.total).toBeCloseTo(2400);
    expect(b.calories.remaining).toBeCloseTo(1900);
    expect(b.active).toBe(300);
    expect(b.weekPlans.map((p) => p.day)[0]).toBe(monday);
    const next = budgetFor(tuesday, settings(), data, tuesday);
    expect(next.plan?.smoothedActive).toBeCloseTo(0.2 * 300 + 0.8 * 400);
    // Monday: 1,900 under → spread over 6 days, capped at +300.
    expect(next.plan?.carry).toBe(300);
    expect(next.plan?.capped).toBe(true);
  });

  it("applies the goal slider and can ignore activity", () => {
    expect(budgetFor(monday, settings({ goal: -200 }), history(400), monday).calories.total).toBeCloseTo(2200);
    expect(budgetFor(monday, settings({ goal: 250 }), history(400), monday).calories.total).toBeCloseTo(2650);
    expect(budgetFor(monday, settings({ active: false }), history(400), monday).calories.total).toBe(2000);
  });

  it("uses the settings valid on each day", () => {
    const entry = (day: string, baselineKcal: number): BudgetHistoryEntry => ({
      day,
      baselineKcal,
      goalKcal: 0,
      alpha: 0.2,
      activeEnabled: true,
      carryEnabled: true,
      carryCapKcal: 300,
      sportFactors: {},
    });
    const s = settings({ kcal: 2100, history: [entry("1970-01-01", 2000), entry(wednesday, 2100)] });
    const data = { ...history(400), [monday]: totals(0, 400), [tuesday]: totals(0, 400) };
    expect(budgetFor(monday, s, data, wednesday).plan?.targetBase).toBeCloseTo(2400);
    expect(budgetFor(wednesday, s, data, wednesday).plan?.targetBase).toBeCloseTo(2500);
  });

  it("marks rest days read from the plan", () => {
    const b = budgetFor(monday, settings(), { ...history(400), [monday]: totals(0, 0, { restDay: true }) }, monday);
    expect(b.restDay).toBe(true);
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

  it("lists days oldest first with their targets and the balance part", () => {
    const stats = dayStats(wednesday, 3, { ...history(300), [monday]: totals(0, 300), [tuesday]: totals(1800, 300) }, s);
    expect(stats.map((d) => d.day)).toEqual([monday, tuesday, wednesday]);
    expect(stats[1].budget).toBeCloseTo(2300);
    expect(stats[0].eaten.kcal).toBe(0);
    // Tuesday's 500 kcal left over are spread over Wed–Sun.
    expect(stats[2].carry).toBeCloseTo(500 / 5);
    expect(stats[2].budget).toBeCloseTo(2300 + 500 / 5);
  });

  it("compares the eaten kcal of a week with the plan of the logged days", () => {
    const data = { ...history(300), "2025-11-10": totals(2500, 300), [monday]: totals(2000, 300), [tuesday]: totals(0, 300), [wednesday]: totals(1500, 300) };
    const stats = weekStats(wednesday, 2, data, s);
    expect(stats.map((w) => w.start)).toEqual(["2025-11-10", monday]);
    expect(stats[0]).toMatchObject({ eatenKcal: 2500, loggedDays: 1 });
    expect(stats[0].budget).toBeCloseTo(2300);
    expect(stats[1].eatenKcal).toBe(3500);
    expect(stats[1].budget).toBeCloseTo(2 * 2300);
    expect(stats[1].weekTarget).toBeCloseTo(7 * 2300);
    expect(stats[1].loggedDays).toBe(2);
    expect(stats[1].averagePerLoggedDay).toBe(1750);
  });
});
