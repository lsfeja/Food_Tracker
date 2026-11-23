import { budgetFor, type DayTotals } from "../budget";
import { addDays, type Day } from "../days";
import { addNutrients, type Nutrients, scaleNutrients, zeroNutrients } from "../nutrients";
import type { NutritionTargets, UserSettings } from "../settings";
import { bucketStart, bucketStarts, type Bucket, inInterval, type Period, type PeriodKind, periodInterval } from "./period";

export interface NutritionBucket {
  start: Day;
  loggedDays: number;
  eaten: Nutrients;
  activeCalories: number;
  average: Nutrients;
}

export interface NutritionReport {
  loggedDays: number;
  average: Nutrients;
  daysWithin: number;
  daysOver: number;
  buckets: NutritionBucket[];
  bucket: Bucket;
  energy: NutritionBucket[];
  energyBucket: Bucket;
  targets: NutritionTargets;
}

export const averageBucket = (kind: PeriodKind): Bucket => (kind === "week" ? "day" : kind === "month" ? "week" : "month");

const emptyBucket = (start: Day): NutritionBucket => ({ start, loggedDays: 0, eaten: zeroNutrients(), activeCalories: 0, average: zeroNutrients() });

/** Only days with food entries count as logged; days after today are ignored. */
export function nutritionReport(
  totalsByDay: Record<Day, DayTotals>,
  settings: UserSettings,
  period: Period,
  today: Day,
  earliest: Day | null = null,
): NutritionReport {
  const interval = periodInterval(period, today, earliest);
  const endOfToday = addDays(today, 1);
  const bucket = averageBucket(period.kind);
  const energyBucket: Bucket = period.kind === "week" ? "day" : period.kind === "all" ? "month" : "week";

  const averages = new Map<Day, NutritionBucket>();
  const energy = new Map<Day, NutritionBucket>();
  let total = zeroNutrients();
  let loggedDays = 0;
  let daysWithin = 0;
  let daysOver = 0;

  for (const [day, totals] of Object.entries(totalsByDay)) {
    if (!inInterval(day, interval) || day >= endOfToday) continue;
    const eStart = bucketStart(energyBucket, day);
    const e = energy.get(eStart) ?? emptyBucket(eStart);
    e.activeCalories += totals.activeCalories;
    energy.set(eStart, e);
    if (totals.eaten.kcal <= 0) continue;

    loggedDays++;
    total = addNutrients(total, totals.eaten);
    e.eaten = addNutrients(e.eaten, totals.eaten);
    const aStart = bucketStart(bucket, day);
    const a = averages.get(aStart) ?? emptyBucket(aStart);
    a.eaten = addNutrients(a.eaten, totals.eaten);
    a.loggedDays++;
    averages.set(aStart, a);

    if (budgetFor(day, settings, totalsByDay).calories.isOver) daysOver++;
    else daysWithin++;
  }

  const withAverage = (b: NutritionBucket): NutritionBucket => ({
    ...b,
    average: b.loggedDays > 0 ? scaleNutrients(b.eaten, 1 / b.loggedDays) : zeroNutrients(),
  });

  return {
    loggedDays,
    average: loggedDays > 0 ? scaleNutrients(total, 1 / loggedDays) : zeroNutrients(),
    daysWithin,
    daysOver,
    bucket,
    buckets: bucketStarts(bucket, interval).map((start) => withAverage(averages.get(start) ?? emptyBucket(start))),
    energyBucket,
    energy: bucketStarts(energyBucket, interval).map((start) => energy.get(start) ?? emptyBucket(start)),
    targets: settings.targets,
  };
}
