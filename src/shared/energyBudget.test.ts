import { describe, expect, it } from "vitest";
import { addDays, type Day } from "./days";
import {
  type ActivityInput,
  type BudgetDayInput,
  type BudgetParams,
  cleanActivity,
  DEFAULT_SPORT_FACTORS,
  simulateBudget,
  sportFactorKey,
  sportFactors,
} from "./energyBudget";

const params = (overrides: Partial<BudgetParams> = {}): BudgetParams => ({
  baselineKcal: 2400,
  deficitKcal: 200,
  alpha: 0.2,
  activeEnabled: true,
  carryEnabled: true,
  carryCapKcal: 300,
  sportFactors: DEFAULT_SPORT_FACTORS,
  ...overrides,
});

/** An activity whose cleaned value is exactly `kcal` (no moving time, factor 1). */
const clean = (kcal: number): ActivityInput[] => (kcal > 0 ? [{ kcal, movingS: 0, sport: "VirtualRide", hasPower: true }] : []);

/** Days before `until` with the same cleaned activity → A_smooth = that value. */
function steady(activeKcal: number, until: Day, days = 200): Record<Day, BudgetDayInput> {
  const inputs: Record<Day, BudgetDayInput> = {};
  for (let i = 1; i <= days; i++) inputs[addDays(until, -i)] = { eaten: 0, activities: clean(activeKcal) };
  return inputs;
}

const minutes = (m: number, s = 0) => m * 60 + s;

describe("9.1 cleaned active calories (baseline 2,400)", () => {
  const f = DEFAULT_SPORT_FACTORS;
  it("subtracts the resting burn during the workout and applies the sport factor", () => {
    expect(cleanActivity({ kcal: 677, movingS: minutes(60, 4), sport: "VirtualRide", hasPower: true }, 2400, f)).toBeCloseTo(577, 0);
    expect(cleanActivity({ kcal: 1099, movingS: minutes(74, 49), sport: "Run", hasPower: false }, 2400, f)).toBeCloseTo(877, 0);
    expect(Math.abs(cleanActivity({ kcal: 368, movingS: minutes(86, 12), sport: "WeightTraining", hasPower: false }, 2400, f) - 134)).toBeLessThan(1);
  });

  it("is never negative", () => {
    expect(cleanActivity({ kcal: 50, movingS: minutes(60), sport: "Run", hasPower: false }, 2400, f)).toBe(0);
  });

  it("picks the sport factor (rides by power meter) and takes overrides", () => {
    expect(sportFactorKey("Ride", true)).toBe("ridePower");
    expect(sportFactorKey("Ride", false)).toBe("ride");
    expect(sportFactorKey("GravelRide", true)).toBe("ridePower");
    expect(sportFactorKey("TrailRun", false)).toBe("trailRun");
    expect(sportFactorKey("Swim", false)).toBe("other");
    const custom = sportFactors({ weightTraining: 0.5, run: 7, bogus: 1 });
    expect(custom.weightTraining).toBe(0.5);
    expect(custom.run).toBe(0.9); // out of range → default
    expect(cleanActivity({ kcal: 1000, movingS: 0, sport: "Ride", hasPower: false }, 2400, f)).toBe(800);
  });
});

describe("9.2 smoothed active calories (alpha 0.2, start 560, deficit 200)", () => {
  // Thu 2026-11-19 … Wed 2026-11-25; Monday 23 is the rest day after the hard Sunday.
  const THU = "2026-11-19";
  const week = [818, 517, 507, 1393, 0, 663, 577];
  const inputs = steady(560, THU);
  week.forEach((kcal, i) => (inputs[addDays(THU, i)] = { eaten: 0, activities: clean(kcal) }));
  const today = addDays(THU, 7);
  const result = simulateBudget(inputs, () => params(), today, THU, today);

  it("today's activity counts from tomorrow", () => {
    const expected = [2812, 2793, 2776, 2939, 2791, 2806, 2800]; // Fri … Thu
    expected.forEach((target, i) => expect(Math.round(result.days[addDays(THU, i + 1)].targetBase)).toBe(target));
    expect(result.days[THU].smoothedActive).toBeCloseTo(560);
  });

  it("the rest day after the hard Sunday gets the highest target of its week", () => {
    const monday = result.days["2026-11-23"];
    const others = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"].map((d) => result.days[d].target);
    for (const target of others) expect(monday.target).toBeGreaterThan(target);
  });

  it("days after today are estimates at the smoothed level", () => {
    const r = simulateBudget(inputs, () => params(), "2026-11-24", "2026-11-23", "2026-11-23");
    const wed = r.days["2026-11-25"];
    expect(wed.projected).toBe(true);
    // Wednesday includes Tuesday's 663 (today so far); after that the level stays.
    expect(wed.smoothedActive).toBeCloseTo(0.2 * 663 + 0.8 * r.days["2026-11-24"].smoothedActive);
    expect(r.days["2026-11-27"].smoothedActive).toBeCloseTo(wed.smoothedActive);
  });
});

describe("9.3 weekly balance (target_base 2,800)", () => {
  const MON = "2026-11-23";
  const [TUE, WED, THU] = [1, 2, 3].map((i) => addDays(MON, i));
  const NEXT_MON = addDays(MON, 7);

  function weekWith(eaten: Record<Day, number>, extra: Record<Day, Partial<BudgetDayInput>> = {}) {
    const inputs = steady(600, MON);
    for (let i = 0; i < 14; i++) {
      const day = addDays(MON, i);
      inputs[day] = { eaten: eaten[day] ?? 0, activities: clean(600), ...extra[day] };
    }
    return inputs;
  }
  const run = (inputs: Record<Day, BudgetDayInput>, today: Day, p = params()) => simulateBudget(inputs, () => p, today, MON, NEXT_MON);

  it("Mon–Wed 300 under each → Thursday +225", () => {
    const r = run(weekWith({ [MON]: 2500, [TUE]: 2500, [WED]: 2500 }), THU);
    expect(r.days[MON].targetBase).toBeCloseTo(2800);
    expect(r.days[THU].carry).toBeCloseTo(225);
    expect(r.days[THU].target).toBeCloseTo(3025);
    expect(r.days[THU].capped).toBe(false);
  });

  it("2,400 under → 600 per day, capped at +300", () => {
    const r = run(weekWith({ [MON]: 2000, [TUE]: 2000, [WED]: 2000 }), THU);
    expect(r.days[THU].carryRaw).toBeCloseTo(600);
    expect(r.days[THU].carry).toBe(300);
    expect(r.days[THU].capped).toBe(true);
  });

  it("eating more lowers the following days, also capped", () => {
    const r = run(weekWith({ [MON]: 3200, [TUE]: 3200, [WED]: 3200 }), THU);
    expect(r.days[THU].carry).toBe(-300);
    const small = run(weekWith({ [MON]: 3000 }), TUE);
    expect(small.days[TUE].carry).toBeCloseTo(-200 / 6);
  });

  it("Monday starts at 0, whatever happened the week before", () => {
    const inputs = weekWith({});
    for (let i = 1; i <= 7; i++) inputs[addDays(MON, -i)] = { eaten: 1000, activities: clean(600) };
    const r = run(inputs, MON);
    expect(r.days[MON].carry).toBe(0);
  });

  it("a day without entries doesn't change the balance", () => {
    const skipped = run(weekWith({ [MON]: 2500, [WED]: 2500 }), THU);
    const onTarget = run(weekWith({ [MON]: 2500, [TUE]: 2800, [WED]: 2500 }), THU);
    expect(skipped.days[THU].carry).toBeCloseTo(150);
    expect(onTarget.days[THU].carry).toBeCloseTo(150);
  });
});

describe("uneaten calories move into the rest of the week", () => {
  const MON = "2026-11-23";
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(MON, i));
  const [, TUE, WED, THU, FRI, SAT, SUN] = days;
  const base = () => {
    const inputs = steady(600, MON);
    for (let i = 0; i < 14; i++) inputs[addDays(MON, i)] = { eaten: 0, activities: clean(600) };
    return inputs;
  };
  const run = (inputs: Record<Day, BudgetDayInput>, today: Day, p = params()) => simulateBudget(inputs, () => p, today, MON, addDays(MON, 7));

  it("Mon 483, Tue 306, Wed 34 under → Thu–Sun +206 each (eating the shown target)", () => {
    const inputs = base();
    inputs[MON].eaten = 2800 - 483;
    inputs[TUE].eaten = 2800 - 306;
    inputs[WED].eaten = 2800 - 34;
    for (const day of [THU, FRI, SAT, SUN]) {
      const r = run(inputs, day);
      expect(r.days[day].carry).toBeCloseTo(823 / 4);
      inputs[day].eaten = r.days[day].target;
    }
    expect(run(inputs, addDays(MON, 7)).weeks[MON].balance).toBeCloseTo(0);
  });

  it("300 left on Sunday → nothing on Monday", () => {
    const inputs = base();
    days.forEach((d) => (inputs[d].eaten = 2800));
    inputs[SUN].eaten = 2500;
    const r = run(inputs, addDays(MON, 8));
    expect(r.days[addDays(MON, 7)].carry).toBe(0);
  });

  it("a day with 0 kcal eaten moves nothing", () => {
    const r = run(base(), TUE);
    expect(r.days[TUE].carry).toBe(0);
  });

  it("vacation days are skipped: no target, no share, their food doesn't count", () => {
    const inputs = base();
    inputs[MON].eaten = 2400; // 400 under
    inputs[WED] = { ...inputs[WED], untracked: true, eaten: 5000 };
    const tue = run(inputs, TUE);
    expect(tue.days[TUE].carry).toBeCloseTo(400 / 5); // Tue, Thu, Fri, Sat, Sun
    inputs[TUE].eaten = tue.days[TUE].target;
    const thu = run(inputs, THU);
    expect(thu.days[WED]).toMatchObject({ untracked: true, target: 0, carry: 0 });
    expect(thu.days[THU].carry).toBeCloseTo(80);
    expect(thu.weeks[MON].trackedDays).toBe(6);
  });

  it("can be switched off", () => {
    const inputs = base();
    inputs[MON].eaten = 2000;
    const r = run(inputs, TUE, params({ carryEnabled: false }));
    expect(r.days[TUE].carry).toBe(0);
    expect(r.days[TUE].target).toBeCloseTo(2800);
  });
});

describe("settings per day", () => {
  it("a new baseline from Wednesday leaves Mon/Tue as they were", () => {
    const MON = "2026-11-23";
    const inputs = steady(600, MON);
    inputs[MON] = { eaten: 2800, activities: clean(600) };
    inputs["2026-11-24"] = { eaten: 2800, activities: clean(600) };
    const paramsFor = (day: Day) => params({ baselineKcal: day >= "2026-11-25" ? 2300 : 2400 });
    const r = simulateBudget(inputs, paramsFor, "2026-11-25", MON, MON);
    expect(r.days[MON].targetBase).toBeCloseTo(2800);
    expect(r.days["2026-11-25"].targetBase).toBeCloseTo(2700);
    expect(r.days["2026-11-25"].carry).toBeCloseTo(0);
  });

  it("without active calories the target is baseline − deficit", () => {
    const r = simulateBudget(steady(600, "2026-11-23"), () => params({ activeEnabled: false }), "2026-11-23", "2026-11-23", "2026-11-23");
    expect(r.days["2026-11-23"].target).toBe(2200);
  });
});
