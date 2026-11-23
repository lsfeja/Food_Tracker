import type { Bucket } from "../../shared/stats/period";
import { dayMonth, formatDay, monthShort, weekdayNarrow } from "../lib/dates";

/** X-axis label per bucket granularity. */
export function bucketLabel(bucket: Bucket): (day: string) => string {
  switch (bucket) {
    case "day":
      return weekdayNarrow;
    case "week":
      return dayMonth;
    case "month":
      return (day) => monthShort(day).slice(0, 3);
    case "year":
      return (day) => day.slice(0, 4);
  }
}

export function bucketTitle(bucket: Bucket): string {
  return { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[bucket];
}

export const longDate = (day: string) => formatDay(day, { day: "numeric", month: "short", year: "numeric" });

/** Fraction of today that has passed (for "on track" comparisons). */
export function dayFraction(now = new Date()): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return (now.getTime() - midnight) / 86_400_000;
}

export const axisTick = (color: string) => ({ fill: color, fontSize: 11 });
