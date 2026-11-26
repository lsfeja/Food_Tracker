import { describe, expect, it } from "vitest";
import { calibrationCheck, calibrationDue, DEFAULT_CALIBRATION, describeCalibration, type WeighIn } from "./calibration";
import { addDays, type Day } from "./days";
import { type BudgetDayInput, type BudgetParams, DEFAULT_SPORT_FACTORS } from "./energyBudget";

const params = (): BudgetParams => ({
  baselineKcal: 2400,
  deficitKcal: 200,
  alpha: 0.2,
  activeEnabled: true,
  carryEnabled: true,
  carryCapKcal: 300,
  sportFactors: DEFAULT_SPORT_FACTORS,
});
const TODAY = "2026-12-07";
const FROM = addDays(TODAY, -14);

/** 14 days eating 200 below baseline (no activity) → balance −2,800. */
function logged(days = 14): Record<Day, BudgetDayInput> {
  const inputs: Record<Day, BudgetDayInput> = {};
  for (let i = 0; i < days; i++) inputs[addDays(FROM, i)] = { eaten: 2200 };
  return inputs;
}
const weighIns = (count: number, kg: (i: number) => number = () => 75): WeighIn[] =>
  Array.from({ length: count }, (_, i) => ({ day: addDays(TODAY, -i), weightKg: kg(i) }));

describe("9.4 calibration", () => {
  it("−2,800 kcal predicted −0.36 kg, measured 0 → baseline 2,400 → 2,300", () => {
    const c = calibrationCheck(logged(), weighIns(12), TODAY, params, DEFAULT_CALIBRATION);
    expect(c.reasons).toEqual([]);
    expect(c.energyBalance).toBeCloseTo(-2800);
    expect(c.expectedKg).toBeCloseTo(-0.364, 3);
    expect(c.measuredKg).toBeCloseTo(0);
    expect(c.errorPerDay).toBeCloseTo(200);
    expect(c.adjustment).toBe(-100);
    expect(c.newBaseline).toBe(2300);
    expect(describeCalibration(c)).toBe("Weight trend ±0.00 kg in 14 days, expected −0.36 kg from food and training: your real need seems lower than your base.");
  });

  it("losing faster than predicted raises the baseline, damped and capped", () => {
    // −1 kg in 14 days vs. −0.36 expected → error −350 kcal/day → +175, capped at +100.
    const c = calibrationCheck(logged(), weighIns(14, (i) => 75 + i / 14), TODAY, params, DEFAULT_CALIBRATION);
    expect(c.measuredKg).toBeCloseTo(-1);
    expect(c.errorPerDay).toBeCloseTo(-350, 0);
    expect(c.adjustment).toBe(100);
    // 0.2 kg more lost than expected → −110 kcal/day → half of it: +55.
    const lost = 2800 / 7700 + 0.2;
    const small = calibrationCheck(logged(), weighIns(14, (i) => 75 + lost * (i / 14)), TODAY, params, DEFAULT_CALIBRATION);
    expect(small.errorPerDay).toBeCloseTo(-110);
    expect(small.adjustment).toBe(55);
  });

  it("needs 10 weigh-ins and 12 logged days", () => {
    const few = calibrationCheck(logged(), weighIns(9), TODAY, params, DEFAULT_CALIBRATION);
    expect(few.reasons).toEqual(["Only 9 weigh-ins in the last 14 days (needs 10)."]);
    expect(few.adjustment).toBe(0);
    const gaps = calibrationCheck(logged(11), weighIns(12), TODAY, params, DEFAULT_CALIBRATION);
    expect(gaps.reasons).toEqual(["Only 11 of 14 days logged (needs 12)."]);
  });

  it("ignores excluded weigh-ins and vacation days", () => {
    const weights = [...weighIns(12), { day: addDays(TODAY, -3), weightKg: 80, excluded: true }];
    const inputs = logged();
    inputs[addDays(FROM, 2)] = { eaten: 6000, untracked: true };
    const c = calibrationCheck(inputs, weights, TODAY, params, DEFAULT_CALIBRATION);
    expect(c.weighIns).toBe(12);
    expect(c.trackedDays).toBe(13);
    expect(c.measuredKg).toBeCloseTo(0);
  });

  it("is due 14 days after the last decision", () => {
    expect(calibrationDue(null, TODAY, 14)).toBe(true);
    expect(calibrationDue(addDays(TODAY, -13), TODAY, 14)).toBe(false);
    expect(calibrationDue(addDays(TODAY, -14), TODAY, 14)).toBe(true);
  });
});
