import { addDays, addMonths, addYears, type Day, makeDay, monthStart, weekStart, yearOf, yearStart } from "../days";

export type PeriodKind = "week" | "month" | "year" | "all";
export type Bucket = "day" | "week" | "month" | "year";

export interface Period {
  kind: PeriodKind;
  year: number;
}

/** [start, end) in local days. */
export interface Interval {
  start: Day;
  end: Day;
}

export const inInterval = (day: Day, interval: Interval) => day >= interval.start && day < interval.end;

/** Today for the current year, otherwise 31 Dec of the selected year. */
export function referenceDay(period: Period, today: Day): Day {
  return period.year < yearOf(today) ? makeDay(period.year, 12, 31) : today;
}

/** Full calendar interval of the period (future days of the current period have no data). */
export function periodInterval(period: Period, today: Day, earliest: Day | null = null): Interval {
  const reference = referenceDay(period, today);
  switch (period.kind) {
    case "week": {
      const start = weekStart(reference);
      return { start, end: addDays(start, 7) };
    }
    case "month": {
      const start = monthStart(reference);
      return { start, end: addMonths(start, 1) };
    }
    case "year": {
      const start = yearStart(reference);
      return { start, end: addYears(start, 1) };
    }
    case "all": {
      const end = addDays(today, 1);
      const start = earliest && earliest < end ? earliest : today;
      return { start, end };
    }
  }
}

/** Main and secondary chart granularity per period. */
export function periodBuckets(kind: PeriodKind): { primary: Bucket; secondary: Bucket | null } {
  switch (kind) {
    case "week":
      return { primary: "day", secondary: null };
    case "month":
      return { primary: "day", secondary: "week" };
    case "year":
      return { primary: "week", secondary: "month" };
    case "all":
      return { primary: "month", secondary: "year" };
  }
}

export function bucketStart(bucket: Bucket, day: Day): Day {
  switch (bucket) {
    case "day":
      return day;
    case "week":
      return weekStart(day);
    case "month":
      return monthStart(day);
    case "year":
      return yearStart(day);
  }
}

function nextBucket(bucket: Bucket, start: Day): Day {
  switch (bucket) {
    case "day":
      return addDays(start, 1);
    case "week":
      return addDays(start, 7);
    case "month":
      return addMonths(start, 1);
    case "year":
      return addYears(start, 1);
  }
}

/** Starts of all buckets intersecting the interval. */
export function bucketStarts(bucket: Bucket, interval: Interval): Day[] {
  const starts: Day[] = [];
  let cursor = bucketStart(bucket, interval.start);
  while (cursor < interval.end && starts.length < 5000) {
    starts.push(cursor);
    cursor = nextBucket(bucket, cursor);
  }
  return starts;
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortMonth = (day: Day) => monthNames[Number(day.slice(5, 7)) - 1].slice(0, 3);

export function periodTitle(period: Period, today: Day): string {
  const interval = periodInterval(period, today);
  switch (period.kind) {
    case "week": {
      const last = addDays(interval.end, -1);
      return `${Number(interval.start.slice(8))} ${shortMonth(interval.start)} – ${Number(last.slice(8))} ${shortMonth(last)} ${yearOf(last)}`;
    }
    case "month":
      return `${monthNames[Number(interval.start.slice(5, 7)) - 1]} ${yearOf(interval.start)}`;
    case "year":
      return period.year === yearOf(today) ? `${period.year} to date` : String(period.year);
    case "all":
      return "All Time";
  }
}
