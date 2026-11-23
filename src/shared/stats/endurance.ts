import { addDays, type Day, diffDays, makeDay, yearOf } from "../days";
import { sportFromActivityType } from "../workout";
import { bucketStart, bucketStarts, type Bucket, inInterval, type Period, periodBuckets, periodInterval } from "./period";

export type StatsSport = "ride" | "run" | "swim" | "indoorRide" | "other";
export type StatsSportFilter = "all" | "cycling" | "ride" | "indoorRide" | "run" | "swim" | "other";

export const STATS_FILTERS: StatsSportFilter[] = ["all", "cycling", "ride", "indoorRide", "run", "swim", "other"];

export const filterInfo: Record<StatsSportFilter, { name: string; emoji: string }> = {
  all: { name: "All", emoji: "🏅" },
  cycling: { name: "Cycling", emoji: "🚴" },
  ride: { name: "Ride", emoji: "🚵" },
  indoorRide: { name: "Indoor", emoji: "🚲" },
  run: { name: "Run", emoji: "🏃" },
  swim: { name: "Swim", emoji: "🏊" },
  other: { name: "Other", emoji: "⭐" },
};

/** Rides on a trainer and virtual rides count as indoor rides. */
export function classifyActivity(type: string, isIndoor: boolean): StatsSport {
  switch (sportFromActivityType(type)) {
    case "indoorRide":
      return "indoorRide";
    case "ride":
      return isIndoor ? "indoorRide" : "ride";
    case "run":
      return "run";
    case "swim":
      return "swim";
    default:
      return "other";
  }
}

export function filterMatches(filter: StatsSportFilter, sport: StatsSport): boolean {
  switch (filter) {
    case "all":
      return true;
    case "cycling":
      return sport === "ride" || sport === "indoorRide";
    default:
      return filter === sport;
  }
}

const includesCycling = (filter: StatsSportFilter) => ["all", "cycling", "ride", "indoorRide"].includes(filter);

export interface ActivitySnapshot {
  key: string;
  name: string;
  startAt: number;
  day: Day;
  sport: StatsSport;
  type: string;
  distanceM: number;
  movingS: number;
  elevationM: number;
}

export interface EnduranceTotals {
  distanceM: number;
  movingS: number;
  elevationM: number;
  count: number;
}

export const emptyEnduranceTotals = (): EnduranceTotals => ({ distanceM: 0, movingS: 0, elevationM: 0, count: 0 });

function addActivity(totals: EnduranceTotals, a: ActivitySnapshot): void {
  totals.distanceM += a.distanceM;
  totals.movingS += a.movingS;
  totals.elevationM += a.elevationM;
  totals.count += 1;
}

export interface VolumeBucket {
  start: Day;
  totals: EnduranceTotals;
}

export interface CumulativePoint {
  year: number;
  /** Mapped onto the selected year so both series share the x axis. */
  day: Day;
  index: number;
  km: number;
}

export interface ActivityHighlight {
  name: string;
  day: Day;
  km: number;
  hours: number;
  elevationM: number;
}

export interface IndoorShare {
  indoorS: number;
  outdoorS: number;
  indoorCount: number;
  outdoorCount: number;
  indoorFraction: number;
}

export type GoalStatus = "reached" | "onTrack" | "behind";

export interface GoalProgress {
  target: number;
  actual: number;
  /** Where an even pace would be today. */
  expected: number;
  /** Year-end value at the current pace. */
  projected: number;
  fraction: number;
  delta: number;
  status: GoalStatus;
}

export interface EnduranceReport {
  totals: EnduranceTotals;
  primary: VolumeBucket[];
  primaryBucket: Bucket;
  secondary: VolumeBucket[];
  secondaryBucket: Bucket | null;
  yearOverYear: CumulativePoint[];
  longest: ActivityHighlight | null;
  mostElevation: ActivityHighlight | null;
  bestWeek: VolumeBucket | null;
  bestMonth: VolumeBucket | null;
  indoorShare: IndoorShare | null;
}

export function volume(activities: ActivitySnapshot[], bucket: Bucket, interval: { start: Day; end: Day }): VolumeBucket[] {
  const byStart = new Map<Day, EnduranceTotals>();
  for (const a of activities) {
    const start = bucketStart(bucket, a.day);
    let totals = byStart.get(start);
    if (!totals) byStart.set(start, (totals = emptyEnduranceTotals()));
    addActivity(totals, a);
  }
  return bucketStarts(bucket, interval).map((start) => ({ start, totals: byStart.get(start) ?? emptyEnduranceTotals() }));
}

const highlight = (a: ActivitySnapshot): ActivityHighlight => ({
  name: a.name,
  day: a.day,
  km: a.distanceM / 1000,
  hours: a.movingS / 3600,
  elevationM: a.elevationM,
});

function best(buckets: VolumeBucket[]): VolumeBucket | null {
  let top: VolumeBucket | null = null;
  for (const b of buckets) {
    if (!top || b.totals.distanceM > top.totals.distanceM || (b.totals.distanceM === top.totals.distanceM && b.totals.movingS > top.totals.movingS)) {
      top = b;
    }
  }
  return top && top.totals.count > 0 ? top : null;
}

export function enduranceReport(
  activities: ActivitySnapshot[],
  filter: StatsSportFilter,
  period: Period,
  today: Day,
  earliest: Day | null = null,
): EnduranceReport {
  const matching = activities.filter((a) => filterMatches(filter, a.sport));
  const interval = periodInterval(period, today, earliest);
  const inPeriod = matching.filter((a) => inInterval(a.day, interval));
  const totals = emptyEnduranceTotals();
  inPeriod.forEach((a) => addActivity(totals, a));
  const buckets = periodBuckets(period.kind);

  let longest: ActivitySnapshot | null = null;
  let climb: ActivitySnapshot | null = null;
  for (const a of inPeriod) {
    if (!longest || a.distanceM > longest.distanceM || (a.distanceM === longest.distanceM && a.movingS > longest.movingS)) longest = a;
    if (a.elevationM > 0 && (!climb || a.elevationM > climb.elevationM)) climb = a;
  }

  let indoorShare: IndoorShare | null = null;
  if (includesCycling(filter)) {
    const cycling = inPeriod.filter((a) => a.sport === "ride" || a.sport === "indoorRide");
    if (cycling.length) {
      const indoor = cycling.filter((a) => a.sport === "indoorRide");
      const outdoor = cycling.filter((a) => a.sport === "ride");
      const indoorS = indoor.reduce((s, a) => s + a.movingS, 0);
      const outdoorS = outdoor.reduce((s, a) => s + a.movingS, 0);
      indoorShare = {
        indoorS,
        outdoorS,
        indoorCount: indoor.length,
        outdoorCount: outdoor.length,
        indoorFraction: indoorS + outdoorS > 0 ? indoorS / (indoorS + outdoorS) : 0,
      };
    }
  }

  const withBests = period.kind === "year" || period.kind === "all";
  return {
    totals,
    primary: volume(inPeriod, buckets.primary, interval),
    primaryBucket: buckets.primary,
    secondary: buckets.secondary ? volume(inPeriod, buckets.secondary, interval) : [],
    secondaryBucket: buckets.secondary,
    yearOverYear: period.kind === "year" ? yearOverYear(matching, period.year, today) : [],
    longest: longest ? highlight(longest) : null,
    mostElevation: climb ? highlight(climb) : null,
    bestWeek: withBests ? best(volume(inPeriod, "week", interval)) : null,
    bestMonth: withBests ? best(volume(inPeriod, "month", interval)) : null,
    indoorShare,
  };
}

/** Cumulative km per day for `year` and `year - 1`, mapped onto `year`. The current year stops today. */
export function yearOverYear(activities: ActivitySnapshot[], year: number, today: Day): CumulativePoint[] {
  const selectedStart = makeDay(year, 1, 1);
  const points: CumulativePoint[] = [];
  for (const seriesYear of [year - 1, year]) {
    const start = makeDay(seriesYear, 1, 1);
    const end = makeDay(seriesYear + 1, 1, 1);
    if (today < start) continue;
    const days = diffDays(start, end);
    const perDay = new Array<number>(days).fill(0);
    for (const a of activities) {
      if (a.day >= start && a.day < end) perDay[diffDays(start, a.day)] += a.distanceM / 1000;
    }
    const lastIndex = today < end ? Math.min(diffDays(start, today), days - 1) : days - 1;
    let cumulative = 0;
    for (let index = 0; index <= lastIndex; index++) {
      cumulative += perDay[index];
      points.push({ year: seriesYear, day: addDays(selectedStart, index), index, km: cumulative });
    }
  }
  return points;
}

/** 0…1 of `year` elapsed at `today` (+ `dayFraction` of today). */
export function elapsedFraction(year: number, today: Day, dayFraction = 0): number {
  const start = makeDay(year, 1, 1);
  const days = diffDays(start, makeDay(year + 1, 1, 1));
  const elapsed = diffDays(start, today) + dayFraction;
  if (elapsed <= 0) return 0;
  if (elapsed >= days) return 1;
  return elapsed / days;
}

export function goalProgress(target: number, actual: number, year: number, today: Day, dayFraction = 0): GoalProgress {
  const fraction = elapsedFraction(year, today, dayFraction);
  const expected = target * fraction;
  const projected = fraction > 0 ? actual / fraction : 0;
  const status: GoalStatus = actual >= target ? "reached" : actual >= expected ? "onTrack" : "behind";
  return {
    target,
    actual,
    expected,
    projected,
    fraction: target > 0 ? Math.min(actual / target, 1) : 0,
    delta: actual - expected,
    status,
  };
}

/** Year-to-date totals for a filter (e.g. for goals in the "all time" view). */
export function yearTotals(activities: ActivitySnapshot[], filter: StatsSportFilter, year: number): EnduranceTotals {
  const totals = emptyEnduranceTotals();
  for (const a of activities) if (yearOf(a.day) === year && filterMatches(filter, a.sport)) addActivity(totals, a);
  return totals;
}
