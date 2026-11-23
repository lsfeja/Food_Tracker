import { describe, expect, it } from "vitest";
import type { WeightDTO } from "./api";
import { addDays } from "./days";
import { averageAt, averageChange, bodyFatAverageAt, latestOnOrBefore, validBodyFat, validWeight, weeklyRate, weightSeries } from "./weight";

const D = "2026-03-01";
const w = (offset: number, weightKg: number, bodyFatPct: number | null = null): WeightDTO => ({ day: addDays(D, offset), weightKg, bodyFatPct });

describe("weight: averages", () => {
  it("averages the weigh-ins of the day and the 6 days before", () => {
    const list = [w(0, 74), w(3, 73), w(6, 72)];
    expect(averageAt(list, addDays(D, 6))).toBeCloseTo(73);
    // Day 0 drops out on day 7.
    expect(averageAt(list, addDays(D, 7))).toBeCloseTo(72.5);
    expect(averageAt(list, addDays(D, 20))).toBeNull();
  });

  it("builds a series with trailing averages, oldest first", () => {
    const series = weightSeries([w(2, 72), w(0, 74), w(1, 73)]);
    expect(series.map((p) => p.day)).toEqual([D, addDays(D, 1), addDays(D, 2)]);
    expect(series.map((p) => p.average)).toEqual([74, 73.5, 73]);
    expect(averageChange(series)).toBeCloseTo(-1);
    expect(averageChange(series.slice(0, 1))).toBeNull();
  });

  it("averages body fat only over days that have it", () => {
    const list = [w(0, 74, 20), w(1, 73), w(2, 73, 19)];
    expect(bodyFatAverageAt(list, addDays(D, 2))).toBeCloseTo(19.5);
    const series = weightSeries(list);
    expect(series[1].bodyFatAverage).toBeNull();
    expect(series[2].bodyFatAverage).toBeCloseTo(19.5);
  });
});

describe("weight: weekly rate", () => {
  it("is the linear trend in kg per week over the last 4 weeks", () => {
    // −0.1 kg per day, with noise that cancels out.
    const list = Array.from({ length: 28 }, (_, i) => w(i, 80 - 0.1 * i + (i % 2 ? 0.3 : -0.3)));
    expect(weeklyRate(list, addDays(D, 27))).toBeCloseTo(-0.7, 1);
  });

  it("ignores weigh-ins older than 28 days", () => {
    const list = [w(0, 90), w(30, 75), w(37, 75.5), w(44, 76)];
    expect(weeklyRate(list, addDays(D, 44))).toBeCloseTo(0.5);
  });

  it("needs at least two weigh-ins a week apart", () => {
    expect(weeklyRate([w(0, 75)], addDays(D, 3))).toBeNull();
    expect(weeklyRate([w(0, 75), w(3, 74)], addDays(D, 3))).toBeNull();
    expect(weeklyRate([w(0, 75), w(6, 74)], addDays(D, 6))).toBeCloseTo(-7 / 6);
  });
});

describe("weight: helpers", () => {
  it("finds the latest weigh-in on or before a day", () => {
    const list = [w(0, 74), w(5, 73)];
    expect(latestOnOrBefore(list, addDays(D, 4))?.weightKg).toBe(74);
    expect(latestOnOrBefore(list, addDays(D, 9))?.weightKg).toBe(73);
    expect(latestOnOrBefore(list, addDays(D, -1))).toBeNull();
  });

  it("validates plausible values", () => {
    expect(validWeight(72.4)).toBe(true);
    expect(validWeight(7)).toBe(false);
    expect(validWeight(null)).toBe(false);
    expect(validBodyFat(18)).toBe(true);
    expect(validBodyFat(90)).toBe(false);
  });
});
