/**
 * Local calendar days as "YYYY-MM-DD" strings. All arithmetic happens on UTC
 * dates, so it is independent of time zones and DST. Weeks start on Monday.
 */
export type Day = string;

const MS_PER_DAY = 86_400_000;

export function isDay(value: unknown): value is Day {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dayToUTC(day: Day): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcToDay(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

export function makeDay(year: number, month: number, day: number): Day {
  return utcToDay(Date.UTC(year, month - 1, day));
}

export function addDays(day: Day, count: number): Day {
  return utcToDay(dayToUTC(day) + count * MS_PER_DAY);
}

/** Whole days from `a` to `b` (positive if b is later). */
export function diffDays(a: Day, b: Day): number {
  return Math.round((dayToUTC(b) - dayToUTC(a)) / MS_PER_DAY);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: Day): number {
  const weekday = new Date(dayToUTC(day)).getUTCDay(); // 0 = Sunday
  return (weekday + 6) % 7;
}

export function weekStart(day: Day): Day {
  return addDays(day, -weekdayIndex(day));
}

export function monthStart(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

export function yearStart(day: Day): Day {
  return `${day.slice(0, 4)}-01-01`;
}

export function yearOf(day: Day): number {
  return Number(day.slice(0, 4));
}

export function addMonths(day: Day, count: number): Day {
  const date = new Date(dayToUTC(monthStart(day)));
  date.setUTCMonth(date.getUTCMonth() + count);
  return utcToDay(date.getTime());
}

export function addYears(day: Day, count: number): Day {
  return makeDay(yearOf(day) + count, Number(day.slice(5, 7)), Number(day.slice(8, 10)));
}

/** The seven days of the week starting at `start`. */
export function weekDays(start: Day): Day[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Days from `start` (inclusive) to `end` (exclusive). */
export function daysBetween(start: Day, end: Day): Day[] {
  const count = Math.max(diffDays(start, end), 0);
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** Local day of an instant in a time zone (IANA name). */
export function dayInTimeZone(epochMs: number, timeZone: string): Day {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(epochMs));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return utcToDay(epochMs);
  }
}

/** Today in the browser's local time zone. */
export function localToday(now: Date = new Date()): Day {
  return makeDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
