/**
 * Body weight: one value per day, optional body fat. Daily values swing by water and
 * food, so the app shows a trailing 7-day average and a weekly rate (linear trend over
 * the last 4 weeks) next to them.
 */
import type { WeightDTO } from "./api";
import { addDays, type Day, diffDays } from "./days";

export const WEIGHT_RANGE = { min: 20, max: 400 } as const;
export const BODY_FAT_RANGE = { min: 2, max: 70 } as const;
/** Trailing average window in days (the day itself and the 6 before). */
export const AVERAGE_DAYS = 7;
/** Weekly rate: linear trend over the weigh-ins of this many days. */
export const RATE_DAYS = 28;

export interface WeightPoint {
  day: Day;
  weight: number;
  /** Trailing 7-day average of the weights. */
  average: number;
  bodyFat: number | null;
  /** Trailing 7-day average of the body fat values (null without any). */
  bodyFatAverage: number | null;
}

export const validWeight = (kg: number | null): kg is number => kg !== null && kg >= WEIGHT_RANGE.min && kg <= WEIGHT_RANGE.max;
export const validBodyFat = (pct: number | null): pct is number => pct !== null && pct >= BODY_FAT_RANGE.min && pct <= BODY_FAT_RANGE.max;

export const sortWeights = (list: WeightDTO[]) => [...list].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Weigh-ins from `day − 6` to `day`. */
const window = (list: WeightDTO[], day: Day, days = AVERAGE_DAYS) => {
  const first = addDays(day, -(days - 1));
  return list.filter((w) => w.day >= first && w.day <= day);
};

/** Trailing 7-day average weight at `day` (null without a weigh-in in that window). */
export function averageAt(list: WeightDTO[], day: Day): number | null {
  return mean(window(list, day).map((w) => w.weightKg));
}

/** Trailing 7-day average body fat at `day` (null without a value in that window). */
export function bodyFatAverageAt(list: WeightDTO[], day: Day): number | null {
  return mean(window(list, day).flatMap((w) => (w.bodyFatPct !== null ? [w.bodyFatPct] : [])));
}

/** One point per weigh-in, oldest first, with the trailing averages. */
export function weightSeries(list: WeightDTO[]): WeightPoint[] {
  const sorted = sortWeights(list);
  return sorted.map((w) => ({
    day: w.day,
    weight: w.weightKg,
    average: averageAt(sorted, w.day) ?? w.weightKg,
    bodyFat: w.bodyFatPct,
    bodyFatAverage: w.bodyFatPct !== null ? bodyFatAverageAt(sorted, w.day) : null,
  }));
}

/**
 * kg per week: least-squares slope of the weigh-ins in the 28 days up to `today`.
 * Null with fewer than 2 weigh-ins or when they span less than a week.
 */
export function weeklyRate(list: WeightDTO[], today: Day): number | null {
  const points = window(list, today, RATE_DAYS);
  if (points.length < 2) return null;
  const xs = points.map((w) => diffDays(points[0].day, w.day));
  if (Math.max(...xs) < AVERAGE_DAYS - 1) return null;
  const ys = points.map((w) => w.weightKg);
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? (num / den) * 7 : null;
}

/** Change of the 7-day average from the first to the last point in the series. */
export function averageChange(points: WeightPoint[]): number | null {
  if (points.length < 2) return null;
  return points[points.length - 1].average - points[0].average;
}

/** Last weigh-in on or before `day`. */
export function latestOnOrBefore(list: WeightDTO[], day: Day): WeightDTO | null {
  let latest: WeightDTO | null = null;
  for (const w of list) if (w.day <= day && (!latest || w.day > latest.day)) latest = w;
  return latest;
}
