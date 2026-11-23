import { describe, expect, it } from "vitest";
import { addDays, type Day } from "./days";
import { activeAverage, type BudgetConfig, type BudgetDayInput, simulateBudget, weekParams } from "./weeklyBudget";

// Week of Monday 2026-03-09 … Sunday 2026-03-15.
const MON = "2026-03-09";
const day = (offset: number) => addDays(MON, offset);
const [TUE, WED, THU, FRI, SAT, SUN] = [1, 2, 3, 4, 5, 6].map(day);
const NEXT_MON = day(7);
const NEXT_TUE = day(8);

const config = (overrides: Partial<BudgetConfig> = {}): BudgetConfig => ({
  baseKcal: 2400,
  goalKcal: 0,
  activeEnabled: true,
  activePercent: 100,
  restDayActivePct: 75,
  maxDailyDeficit: 700,
  carryOverPct: 70,
  ...overrides,
});

/** 4 weeks (and the carry-over chain before) with `active` kcal every day → A = active. */
function history(active = 500, from: Day = addDays(MON, -7 * 12), to: Day = addDays(MON, -1)): Record<Day, BudgetDayInput> {
  const inputs: Record<Day, BudgetDayInput> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) inputs[d] = { eaten: 0, active };
  return inputs;
}

/** This week with A-level activity every day unless overridden. */
function week(overrides: Record<Day, Partial<BudgetDayInput>> = {}, active = 500): Record<Day, BudgetDayInput> {
  const inputs = history(active);
  for (let i = 0; i < 14; i++) inputs[day(i)] = { eaten: 0, active, ...overrides[day(i)] };
  return inputs;
}

const run = (inputs: Record<Day, BudgetDayInput>, today: Day, c = config()) => simulateBudget(inputs, c, today, MON, NEXT_MON);

describe("weekly budget: plan", () => {
  it("base 2400 + Ø 500: 20,300 per week, 2,900 per day, rest-day minimum 2,775, floor 2,525", () => {
    const p = weekParams(config(), 500);
    expect(p.standard).toBe(2900);
    expect(p.restMinimum).toBe(2775);
    expect(p.floor).toBe(2525);
    const result = run(week(), MON);
    expect(result.weeks[MON].plan).toBe(20300);
    expect(result.weeks[MON].params.average).toBeCloseTo(500);
    expect(result.days[MON].target).toBeCloseTo(2900);
  });

  it("learns the average from the 4 completed weeks, the previous week counting double", () => {
    const inputs = history(300);
    for (let i = 1; i <= 7; i++) inputs[addDays(MON, -i)] = { eaten: 0, active: 1000 };
    // (3 weeks × 300 + 2 × 1 week × 1000) / 5 → 580
    expect(activeAverage(inputs, MON, config())).toBeCloseTo(580);
    // The week before that counts once: (2 × 300 + 1000 + 2 × 300) / 5 → 440
    const older = history(300);
    for (let i = 8; i <= 14; i++) older[addDays(MON, -i)] = { eaten: 0, active: 1000 };
    expect(activeAverage(older, MON, config())).toBeCloseTo(440);
    // The counted share applies to the average too.
    expect(activeAverage(history(500), MON, config({ activePercent: 80 }))).toBeCloseTo(400);
  });
});

describe("weekly budget: filling up", () => {
  it("rest day Monday without activity stays at or above 2,775", () => {
    const result = run(week({ [MON]: { active: 0, restDay: true } }), MON);
    expect(result.days[MON].target).toBeGreaterThanOrEqual(2775);
    // −500 spread over Mon–Sun.
    expect(result.days[MON].target).toBeCloseTo(2900 - 500 / 7);
    expect(result.days[SUN].target).toBeCloseTo(2900 - 500 / 7);
  });

  it("600 kcal more on Wednesday go to Wed–Sun", () => {
    const result = run(week({ [WED]: { active: 1100 } }), WED);
    expect(result.days[TUE].target).toBeCloseTo(2900);
    for (const d of [WED, THU, FRI, SAT, SUN]) expect(result.days[d].target).toBeCloseTo(3020);
  });

  it("extra activity on Saturday goes to Sat, Sun and next Monday", () => {
    const result = simulateBudget(week({ [SAT]: { active: 1100 } }), config(), NEXT_MON, MON, NEXT_MON);
    expect(result.days[FRI].target).toBeCloseTo(2900);
    expect(result.days[SAT].target).toBeCloseTo(3100);
    expect(result.days[SUN].target).toBeCloseTo(3100);
    expect(result.weeks[NEXT_MON].spillIn).toBeCloseTo(200);
    // The next week learned from this week (Ø now includes the 1,100 kcal Saturday, counted
    // double as part of the previous week: 28 days with 7 of them twice → 35 shares).
    const nextStandard = result.weeks[NEXT_MON].params.standard;
    expect(nextStandard).toBeCloseTo(2900 + (2 * 600) / 35);
    expect(result.days[NEXT_MON].target).toBeCloseTo(nextStandard + 200);
    expect(result.days[NEXT_TUE].target).toBeCloseTo(nextStandard);
  });

  it("extra activity on Sunday goes to Sun, next Monday and Tuesday", () => {
    const result = simulateBudget(week({ [SUN]: { active: 1100 } }), config(), NEXT_MON, MON, NEXT_MON);
    expect(result.days[SUN].target).toBeCloseTo(3100);
    const nextStandard = result.weeks[NEXT_MON].params.standard;
    expect(result.days[NEXT_MON].target).toBeCloseTo(nextStandard + 200);
    expect(result.days[NEXT_TUE].target).toBeCloseTo(nextStandard + 200);
    expect(result.days[day(9)].target).toBeCloseTo(nextStandard);
  });

  it("less activity counts only after the day, on the following days", () => {
    const during = run(week({ [WED]: { active: 0 } }), WED);
    expect(during.days[WED].target).toBeCloseTo(2900);
    const after = run(week({ [WED]: { active: 0 } }), THU);
    expect(after.days[WED].target).toBeCloseTo(2900);
    for (const d of [THU, FRI, SAT, SUN]) expect(after.days[d].target).toBeCloseTo(2775);
  });

  it("when the floor is reached, 70 % of the rest moves to the next week", () => {
    // No activity Mon–Sun: 3,500 kcal of cuts, the days can only absorb part of it.
    const inputs = week(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [day(i), { active: 0 }])));
    const result = simulateBudget(inputs, config(), NEXT_MON, MON, NEXT_MON);
    const w = result.weeks[MON];
    // Mon −500 → Tue–Sun, Tue → Wed–Sun, Wed → Thu–Sun, then the floor stops further cuts.
    expect(result.days[TUE].target).toBeCloseTo(2900 - 500 / 6);
    expect(result.days[THU].target).toBeCloseTo(2900 - 500 / 6 - 500 / 5 - 500 / 4);
    for (const d of [FRI, SAT, SUN]) expect(result.days[d].target).toBeCloseTo(2525);
    expect(w.unplaced).toBeCloseTo(-1800);
    expect(w.carryOut).toBeCloseTo(-1260);
    expect(result.weeks[NEXT_MON].carryIn).toBeCloseTo(-1260);
    for (const d of Object.values(result.days).filter((p) => p.week === NEXT_MON)) expect(d.target).toBeGreaterThanOrEqual(d.minimum - 1e-6);
  });

  it("1,000 kcal of cuts that don't fit on Sunday: 700 move to the next week", () => {
    const result = simulateBudget(week({ [SUN]: { eaten: 3900 } }), config(), NEXT_MON, MON, NEXT_MON);
    expect(result.weeks[MON].unplaced).toBeCloseTo(-1000);
    expect(result.weeks[MON].carryOut).toBeCloseTo(-700);
    expect(result.days[NEXT_MON].target).toBeCloseTo(2800);
  });

  it("the carry-over share is a setting", () => {
    const result = simulateBudget(week({ [SUN]: { eaten: 3900 } }), config({ carryOverPct: 50 }), NEXT_MON, MON, NEXT_MON);
    expect(result.weeks[MON].carryOut).toBeCloseTo(-500);
  });
});

describe("weekly budget: weekend bonus across the week boundary", () => {
  // Reported case: Sunday 22 Nov 2026 with 1,715 kcal (A of that week 445, surplus 1,270),
  // Monday 23 Nov is a rest day without activity, plan of the new week 17,118.
  const SUNDAY = "2026-11-22";
  const MONDAY = "2026-11-23";
  const TUESDAY = "2026-11-24";
  const LAST_MONDAY = "2026-11-16";
  const userConfig = config({ baseKcal: 2200, goalKcal: -200 });

  function scenario(): Record<Day, BudgetDayInput> {
    const inputs: Record<Day, BudgetDayInput> = {};
    for (let d = addDays(LAST_MONDAY, -7 * 14); d < LAST_MONDAY; d = addDays(d, 1)) inputs[d] = { eaten: 0, active: 445 };
    // Little activity Mon–Sat (that's why the new A stays at ~445 and cuts carry over).
    for (let i = 0; i < 6; i++) inputs[addDays(LAST_MONDAY, i)] = { eaten: 0, active: 234.6 };
    inputs[SUNDAY] = { eaten: 0, active: 1715 };
    inputs[MONDAY] = { eaten: 0, active: 0, restDay: true };
    return inputs;
  }

  it("Sunday's surplus lands on Sun, Mon and Tue, on top of the rest-day minimum", () => {
    const result = simulateBudget(scenario(), userConfig, MONDAY, LAST_MONDAY, MONDAY);
    const last = result.weeks[LAST_MONDAY];
    const week = result.weeks[MONDAY];
    const share = (1715 - 445) / 3;
    expect(last.params.average).toBeCloseTo(445);
    expect(week.plan).toBeCloseTo(17118, 0);

    // 1. The weekend surplus is written into the new week and read there.
    expect(week.spillIn).toBeCloseTo(2 * share);
    expect(week.changes.bonus).toBeCloseTo(2 * share);

    // 2. Rest-day minimum and bonus add up; the rest day's own missing activity can't eat it.
    expect(result.days[MONDAY].target).toBeCloseTo(week.params.restMinimum + share);
    expect(result.days[MONDAY].target).toBeCloseTo(2957.4, 0);
    expect(result.days[MONDAY].minimum).toBeCloseTo(week.params.restMinimum + share);
    expect(result.days[TUESDAY].target).toBeGreaterThanOrEqual(week.params.floor + share - 1e-6);
    // Sunday itself got its share (its minimum rose with it).
    expect(result.days[SUNDAY].minimum).toBeCloseTo(last.params.floor + share);

    // 3. Where the difference to the plan comes from: total = plan + each change.
    const { carry, bonus, activity, food, limits } = week.changes;
    expect(week.total).toBeCloseTo(week.plan + carry + bonus + activity + food + limits);
    // Last week's cuts that didn't fit (70 %) …
    expect(carry).toBeCloseTo(week.carryIn);
    expect(carry).toBeLessThan(0);
    // … and the rest day without activity: −A, what doesn't fit moves on (70 %).
    expect(activity + week.unplaced).toBeCloseTo(-week.params.average);
    expect(week.carryOut).toBeCloseTo(week.unplaced * 0.7);
  });

  it("extra activity within the week is protected from later cuts too", () => {
    // Wed +600 → Wed–Sun +120; Thursday 2,000 over target: Fri–Sun only down to floor + 120.
    const inputs = week({ [WED]: { active: 1100 }, [THU]: { eaten: 3020 + 2000 } });
    const result = run(inputs, FRI);
    for (const d of [FRI, SAT, SUN]) {
      expect(result.days[d].target).toBeCloseTo(2525 + 120);
      expect(result.days[d].minimum).toBeCloseTo(2525 + 120);
    }
    expect(result.weeks[MON].unplaced).toBeCloseTo(-(2000 - 3 * 375));
    expect(result.weeks[MON].changes.food).toBeCloseTo(-3 * 375);
    expect(result.weeks[MON].changes.activity).toBeCloseTo(600);
  });
});

describe("weekly budget: food", () => {
  it("eating less moves to the following days, eating more cuts them", () => {
    const less = run(week({ [MON]: { eaten: 2200 } }), TUE);
    expect(less.days[TUE].target).toBeCloseTo(2900 + 700 / 6);
    const more = run(week({ [MON]: { eaten: 3500 } }), TUE);
    expect(more.days[TUE].target).toBeCloseTo(2800);
  });

  it("days without entries are not logged and don't move anything", () => {
    const result = run(week({ [MON]: { eaten: 0 } }), TUE);
    expect(result.days[TUE].target).toBeCloseTo(2900);
  });

  it("food left over on Sunday moves to the next week in full", () => {
    const result = simulateBudget(week({ [SUN]: { eaten: 2200 } }), config(), NEXT_MON, MON, NEXT_MON);
    expect(result.weeks[MON].carryOut).toBeCloseTo(700);
    expect(result.days[NEXT_MON].target).toBeCloseTo(3000);
  });

  it("the max daily deficit is a setting", () => {
    const p = weekParams(config({ maxDailyDeficit: 300 }), 500);
    expect(p.floor).toBe(2600);
    const result = run(week({ [MON]: { eaten: 5900 } }), TUE, config({ maxDailyDeficit: 300 }));
    expect(result.days[TUE].target).toBeCloseTo(2600);
  });
});

describe("weekly budget: slider and limits", () => {
  it("a −500 slider is limited by the floor of 2,525", () => {
    const p = weekParams(config({ goalKcal: -500 }), 500);
    expect(p.goal).toBe(-375);
    expect(p.standard).toBe(2525);
    expect(p.goalRange.min).toBe(-375);
    const result = run(week(), MON, config({ goalKcal: -500 }));
    expect(result.weeks[MON].plan).toBeCloseTo(7 * 2525);
  });

  it("a surplus is capped at +750", () => {
    expect(weekParams(config({ goalKcal: 2000 }), 500).standard).toBe(3650);
  });

  it("a large deficit still keeps rest days at their minimum, the rest comes from the other days", () => {
    const result = run(week({ [MON]: { restDay: true } }), MON, config({ goalKcal: -375 }));
    expect(result.days[MON].target).toBeGreaterThanOrEqual(2775 - 1e-6);
  });

  it("without active calories the plan is the base", () => {
    const result = run(week({ [WED]: { active: 1100 } }), WED, config({ activeEnabled: false }));
    expect(result.weeks[MON].params.average).toBe(0);
    expect(result.days[WED].target).toBeCloseTo(2400);
  });
});

describe("weekly budget: vacation days", () => {
  it("are left out of the weighted average", () => {
    const inputs = history(300);
    // Previous week: 1,000 on Mon–Sat, Sunday is a vacation day with a lot of activity.
    for (let i = 2; i <= 7; i++) inputs[addDays(MON, -i)] = { eaten: 0, active: 1000 };
    inputs[addDays(MON, -1)] = { eaten: 0, active: 5000, untracked: true };
    // (21 × 300 + 2 × 6 × 1000) / (21 + 12)
    expect(activeAverage(inputs, MON, config())).toBeCloseTo((21 * 300 + 12 * 1000) / 33);
  });

  it("are skipped and don't affect the average", () => {
    const inputs = week({ [WED]: { untracked: true, active: 3000, eaten: 5000 } });
    inputs[addDays(MON, -3)] = { eaten: 0, active: 9000, untracked: true };
    const result = run(inputs, FRI);
    expect(result.weeks[MON].params.average).toBeCloseTo(500);
    expect(result.weeks[MON].plan).toBe(6 * 2900);
    expect(result.days[WED]).toBeUndefined();
    expect(result.days[THU].target).toBeCloseTo(2900);
  });

  it("extra activity before a vacation day skips it", () => {
    const result = run(week({ [THU]: { active: 800 }, [SAT]: { untracked: true } }), THU);
    // Thu, Fri, Sun share 300.
    expect(result.days[THU].target).toBeCloseTo(3000);
    expect(result.days[SUN].target).toBeCloseTo(3000);
  });
});
