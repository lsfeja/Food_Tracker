import { addDays, type Day, dayToUTC, utcToDay } from "../../shared/days";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions, utc = true): Intl.DateTimeFormat {
  const key = JSON.stringify([options, utc]);
  let value = formatters.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat(undefined, utc ? { ...options, timeZone: "UTC" } : options);
    formatters.set(key, value);
  }
  return value;
}

/** Formats a calendar day (no time zone shifts). */
export function formatDay(day: Day, options: Intl.DateTimeFormatOptions): string {
  return formatter(options).format(new Date(dayToUTC(day)));
}

/** "Today", "Yesterday", "Tomorrow" or "Monday, 10 March". */
export function dayTitle(day: Day, today: Day): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatDay(day, { weekday: "long", day: "numeric", month: "long" });
}

export const shortDay = (day: Day) => formatDay(day, { weekday: "short", day: "numeric", month: "short" });
export const dayMonth = (day: Day) => formatDay(day, { day: "numeric", month: "short" });
export const weekdayShort = (day: Day) => formatDay(day, { weekday: "short" });
export const weekdayNarrow = (day: Day) => formatDay(day, { weekday: "narrow" });
export const monthShort = (day: Day) => formatDay(day, { month: "short" });
export const monthLong = (day: Day) => formatDay(day, { month: "long", year: "numeric" });

/** Local clock time of a timestamp. */
export function formatTime(epochMs: number): string {
  return formatter({ hour: "numeric", minute: "2-digit" }, false).format(new Date(epochMs));
}

export function formatDateTime(epochMs: number): string {
  return formatter({ day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }, false).format(new Date(epochMs));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Value for <input type="datetime-local">. */
export function toDateTimeLocal(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses <input type="datetime-local">; returns the local day too. */
export function fromDateTimeLocal(value: string): { epochMs: number; day: Day } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const date = new Date(y, m - 1, d, h, min);
  return { epochMs: date.getTime(), day: `${match[1]}-${match[2]}-${match[3]}` };
}

/** A timestamp on `day` at the current local clock time (logging into past days). */
export function timestampOn(day: Day, now = new Date()): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).getTime();
}

export { utcToDay };
