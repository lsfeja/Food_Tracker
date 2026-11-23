import { addDays, type Day } from "../days";
import { SPORTS, type SessionStatus, type SportType, sportFromActivityType } from "../workout";
import { bucketStart, bucketStarts, type Bucket, inInterval, type Period, type PeriodKind, periodInterval } from "./period";

export interface PlanSessionSnapshot {
  day: Day;
  sport: SportType;
  status: SessionStatus;
  plannedMinutes: number | null;
  linkedActivityKey: string | null;
}

export interface PlanActivitySnapshot {
  key: string;
  day: Day;
  type: string;
  movingS: number;
}

export interface AdherenceBucket {
  start: Day;
  planned: number;
  completed: number;
}

export interface SportTime {
  start: Day;
  sport: SportType;
  minutes: number;
}

export interface PlanReport {
  plannedToDate: number;
  completed: number;
  skipped: number;
  rate: number | null;
  adherence: AdherenceBucket[];
  adherenceBucket: Bucket;
  time: SportTime[];
  timeBucket: Bucket;
  totals: { sport: SportType; minutes: number }[];
  totalMinutes: number;
}

export const adherenceBucket = (kind: PeriodKind): Bucket => (kind === "week" ? "day" : kind === "month" ? "week" : "month");
export const timeBucket = (kind: PeriodKind): Bucket => (kind === "week" ? "day" : kind === "all" ? "month" : "week");

/**
 * Adherence counts workouts up to today (rest days excluded). Training time: the linked
 * activity's moving time, otherwise the planned duration of a completed session, plus
 * activities without a session ("unplanned").
 */
export function planReport(
  sessions: PlanSessionSnapshot[],
  activities: PlanActivitySnapshot[],
  period: Period,
  today: Day,
  earliest: Day | null = null,
): PlanReport {
  const interval = periodInterval(period, today, earliest);
  const endOfToday = addDays(today, 1);
  const aBucket = adherenceBucket(period.kind);
  const tBucket = timeBucket(period.kind);

  const workouts = sessions.filter((s) => s.sport !== "rest" && inInterval(s.day, interval));
  const adherence = new Map<Day, AdherenceBucket>();
  let plannedToDate = 0;
  let completed = 0;
  let skipped = 0;
  for (const s of workouts) {
    const start = bucketStart(aBucket, s.day);
    const bucket = adherence.get(start) ?? { start, planned: 0, completed: 0 };
    bucket.planned++;
    if (s.status === "done") bucket.completed++;
    adherence.set(start, bucket);
    if (s.day < endOfToday) {
      plannedToDate++;
      if (s.status === "done") completed++;
      if (s.status === "skipped") skipped++;
    }
  }

  const byKey = new Map(activities.map((a) => [a.key, a]));
  const linked = new Set(sessions.map((s) => s.linkedActivityKey).filter((k): k is string => !!k));
  const minutes = new Map<Day, Map<SportType, number>>();
  const add = (value: number, sport: SportType, day: Day) => {
    if (value <= 0 || !inInterval(day, interval)) return;
    const start = bucketStart(tBucket, day);
    const perSport = minutes.get(start) ?? new Map<SportType, number>();
    perSport.set(sport, (perSport.get(sport) ?? 0) + value);
    minutes.set(start, perSport);
  };
  for (const s of workouts) {
    if (s.status !== "done") continue;
    const activity = s.linkedActivityKey ? byKey.get(s.linkedActivityKey) : undefined;
    if (activity) add(activity.movingS / 60, s.sport, s.day);
    else if (s.plannedMinutes !== null) add(s.plannedMinutes, s.sport, s.day);
  }
  for (const a of activities) {
    if (!linked.has(a.key)) add(a.movingS / 60, sportFromActivityType(a.type) ?? "custom", a.day);
  }

  const time: SportTime[] = [];
  const totals = new Map<SportType, number>();
  for (const start of bucketStarts(tBucket, interval)) {
    for (const sport of SPORTS) {
      const value = minutes.get(start)?.get(sport);
      if (value === undefined) continue;
      time.push({ start, sport, minutes: value });
      totals.set(sport, (totals.get(sport) ?? 0) + value);
    }
  }
  const totalList = SPORTS.filter((s) => totals.has(s))
    .map((sport) => ({ sport, minutes: totals.get(sport)! }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    plannedToDate,
    completed,
    skipped,
    rate: plannedToDate > 0 ? completed / plannedToDate : null,
    adherence: bucketStarts(aBucket, interval).map((start) => adherence.get(start) ?? { start, planned: 0, completed: 0 }),
    adherenceBucket: aBucket,
    time,
    timeBucket: tBucket,
    totals: totalList,
    totalMinutes: totalList.reduce((sum, t) => sum + t.minutes, 0),
  };
}
