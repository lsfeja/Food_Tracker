import type { Day } from "../days";
import { normalizedName } from "../exerciseHistory";
import { seconds as fmtSeconds, weight as fmtWeight } from "../format";
import { type ExerciseEntry, type ExerciseKind, performedReps, performedSeconds, performedWeight, type StrengthDetails } from "../workout";
import { bucketStart, bucketStarts, type Bucket, inInterval, type Period, periodBuckets, periodInterval } from "./period";

export interface StrengthSessionSnapshot {
  id: string;
  day: Day;
  isDone: boolean;
  workout: StrengthDetails;
}

/** Counts when done or at least one set was ticked off. */
export const sessionCounts = (s: StrengthSessionSnapshot) => s.isDone || s.workout.exercises.some((e) => e.sets.some((set) => set.isDone));

export interface PerformedSet {
  /** 0 for time sets. */
  reps: number;
  /** kg; null = bodyweight */
  weight: number | null;
  /** Time exercises only (no 1RM, no volume). */
  seconds?: number;
}

/** Epley: 1RM = w × (1 + reps / 30); a single rep is the weight itself. */
export function oneRepMax(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export const setVolume = (set: PerformedSet) => (set.seconds !== undefined ? 0 : set.reps * (set.weight ?? 0));
export const setOneRepMax = (set: PerformedSet) => (set.weight === null || set.seconds !== undefined ? null : oneRepMax(set.weight, set.reps));
export function setLabel(set: PerformedSet): string {
  if (set.seconds !== undefined) return set.weight !== null ? `${fmtSeconds(set.seconds)} @ ${fmtWeight(set.weight)} kg` : fmtSeconds(set.seconds);
  return set.weight !== null ? `${set.reps} × ${fmtWeight(set.weight)} kg` : `${set.reps} reps`;
}

export function performedSets(exercise: ExerciseEntry): PerformedSet[] {
  const result: PerformedSet[] = [];
  if (exercise.kind === "time") {
    for (const set of exercise.sets) {
      const seconds = performedSeconds(set);
      if (!set.isDone || seconds === null || seconds <= 0) continue;
      const weight = performedWeight(set);
      result.push({ reps: 0, weight: weight !== null && weight > 0 ? weight : null, seconds });
    }
    return result;
  }
  for (const set of exercise.sets) {
    const reps = performedReps(set);
    if (!set.isDone || reps === null || reps <= 0) continue;
    const weight = performedWeight(set);
    result.push({ reps, weight: weight !== null && weight > 0 ? weight : null });
  }
  return result;
}

export interface ExerciseSessionStat {
  sessionId: string;
  day: Day;
  sets: PerformedSet[];
  maxWeight: number | null;
  bestOneRepMax: number | null;
  volume: number;
  bestSet: PerformedSet | null;
  /** Longest set (time exercises). */
  longest: number | null;
}

const setScore = (set: PerformedSet) => set.seconds ?? setOneRepMax(set) ?? set.reps;

function sessionStat(sessionId: string, day: Day, sets: PerformedSet[]): ExerciseSessionStat {
  const weights = sets.map((s) => s.weight).filter((w): w is number => w !== null);
  const oneRMs = sets.map(setOneRepMax).filter((v): v is number => v !== null);
  let bestSet: PerformedSet | null = null;
  for (const s of sets) if (!bestSet || setScore(s) > setScore(bestSet)) bestSet = s;
  const durations = sets.map((s) => s.seconds).filter((v): v is number => v !== undefined);
  return {
    sessionId,
    day,
    sets,
    maxWeight: weights.length ? Math.max(...weights) : null,
    bestOneRepMax: oneRMs.length ? Math.max(...oneRMs) : null,
    volume: sets.reduce((sum, s) => sum + setVolume(s), 0),
    bestSet,
    longest: durations.length ? Math.max(...durations) : null,
  };
}

export interface DatedValue {
  value: number;
  day: Day;
}

export interface ExerciseSummary {
  key: string;
  name: string;
  /** Kind of the most recent session's exercise. */
  kind: ExerciseKind;
  /** Oldest first. */
  history: ExerciseSessionStat[];
  lastDay: Day | null;
  setCount: number;
  totalVolume: number;
  /** Ties: earliest day. */
  maxWeight: DatedValue | null;
  bestOneRepMax: DatedValue | null;
  bestSet: { set: PerformedSet; day: Day } | null;
  /** Longest set in seconds (time exercises). */
  longest: DatedValue | null;
}

function bestDated(values: DatedValue[]): DatedValue | null {
  let top: DatedValue | null = null;
  for (const v of values) if (!top || v.value > top.value || (v.value === top.value && v.day < top.day)) top = v;
  return top;
}

function summarize(key: string, name: string, kind: ExerciseKind, history: ExerciseSessionStat[]): ExerciseSummary {
  let bestSet: { set: PerformedSet; day: Day } | null = null;
  for (const stat of history) {
    if (stat.bestSet && (!bestSet || setScore(stat.bestSet) > setScore(bestSet.set))) {
      bestSet = { set: stat.bestSet, day: stat.day };
    }
  }
  return {
    key,
    name,
    kind,
    history,
    lastDay: history.length ? history[history.length - 1].day : null,
    setCount: history.reduce((sum, h) => sum + h.sets.length, 0),
    totalVolume: history.reduce((sum, h) => sum + h.volume, 0),
    maxWeight: bestDated(history.flatMap((h) => (h.maxWeight !== null ? [{ value: h.maxWeight, day: h.day }] : []))),
    bestOneRepMax: bestDated(history.flatMap((h) => (h.bestOneRepMax !== null ? [{ value: h.bestOneRepMax, day: h.day }] : []))),
    bestSet,
    longest: bestDated(history.flatMap((h) => (h.longest !== null ? [{ value: h.longest, day: h.day }] : []))),
  };
}

/** Per-exercise history across sessions, keyed by normalized name; most recent first. */
export function exerciseSummaries(sessions: StrengthSessionSnapshot[]): ExerciseSummary[] {
  const history = new Map<string, ExerciseSessionStat[]>();
  const names = new Map<string, { name: string; day: Day; kind: ExerciseKind }>();
  for (const session of [...sessions].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (!sessionCounts(session)) continue;
    for (const exercise of session.workout.exercises) {
      const key = normalizedName(exercise.name);
      const sets = performedSets(exercise);
      if (!key || !sets.length) continue;
      const list = history.get(key) ?? [];
      list.push(sessionStat(session.id, session.day, sets));
      history.set(key, list);
      const known = names.get(key);
      if (!known || session.day >= known.day) names.set(key, { name: exercise.name.trim(), day: session.day, kind: exercise.kind });
    }
  }
  return [...history.entries()]
    .map(([key, stats]) => summarize(key, names.get(key)?.name ?? key, names.get(key)?.kind ?? "reps", stats))
    .sort((a, b) => ((a.lastDay ?? "") < (b.lastDay ?? "") ? 1 : -1));
}

export type RecordKind = "maxWeight" | "oneRepMax" | "longest";

export interface PersonalRecord {
  exercise: string;
  key: string;
  kind: RecordKind;
  value: number;
  day: Day;
}

export const recordTitle = (kind: RecordKind) => (kind === "maxWeight" ? "Max weight" : kind === "oneRepMax" ? "Est. 1RM" : "Longest");

/** "97.5 kg", "~114 kg" (1RM, rounded to 0.5), "1:30 min" */
export function recordValue(record: Pick<PersonalRecord, "kind" | "value">): string {
  if (record.kind === "longest") return fmtSeconds(record.value);
  if (record.kind === "oneRepMax") return `~${fmtWeight(Math.round(record.value * 2) / 2)} kg`;
  return `${fmtWeight(record.value)} kg`;
}

/** All-time records, newest first (deterministic for ties). */
export function personalRecords(summaries: ExerciseSummary[]): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const s of summaries) {
    if (s.maxWeight) records.push({ exercise: s.name, key: s.key, kind: "maxWeight", value: s.maxWeight.value, day: s.maxWeight.day });
    if (s.bestOneRepMax) records.push({ exercise: s.name, key: s.key, kind: "oneRepMax", value: s.bestOneRepMax.value, day: s.bestOneRepMax.day });
    if (s.longest) records.push({ exercise: s.name, key: s.key, kind: "longest", value: s.longest.value, day: s.longest.day });
  }
  return records.sort((a, b) => (a.day !== b.day ? (a.day < b.day ? 1 : -1) : a.exercise !== b.exercise ? (a.exercise < b.exercise ? -1 : 1) : a.kind < b.kind ? -1 : 1));
}

export interface StrengthBucket {
  start: Day;
  volume: number;
  sessions: number;
}

export interface StrengthReport {
  sessionCount: number;
  setCount: number;
  volume: number;
  buckets: StrengthBucket[];
  bucket: Bucket;
  /** Trained in the period (with all-time history), most recent first. */
  exercises: ExerciseSummary[];
  records: PersonalRecord[];
}

export function strengthReport(sessions: StrengthSessionSnapshot[], period: Period, today: Day, earliest: Day | null = null): StrengthReport {
  const interval = periodInterval(period, today, earliest);
  const counted = sessions.filter(sessionCounts);
  const inPeriod = counted.filter((s) => inInterval(s.day, interval));
  const bucket: Bucket = periodBuckets(period.kind).primary === "day" ? "day" : period.kind === "all" ? "month" : "week";

  const byBucket = new Map<Day, StrengthBucket>();
  let sessionCount = 0;
  let setCount = 0;
  let total = 0;
  for (const session of inPeriod) {
    const sets = session.workout.exercises.flatMap(performedSets);
    const vol = sets.reduce((sum, s) => sum + setVolume(s), 0);
    sessionCount++;
    setCount += sets.length;
    total += vol;
    const start = bucketStart(bucket, session.day);
    const entry = byBucket.get(start) ?? { start, volume: 0, sessions: 0 };
    entry.volume += vol;
    entry.sessions += 1;
    byBucket.set(start, entry);
  }

  const summaries = exerciseSummaries(counted);
  return {
    sessionCount,
    setCount,
    volume: total,
    bucket,
    buckets: bucketStarts(bucket, interval).map((start) => byBucket.get(start) ?? { start, volume: 0, sessions: 0 }),
    exercises: summaries.filter((s) => s.history.some((h) => inInterval(h.day, interval))),
    records: personalRecords(summaries),
  };
}

/** Records set in `session` compared with earlier sessions (first-time exercises don't count). */
export function newRecords(session: StrengthSessionSnapshot, previous: StrengthSessionSnapshot[]): PersonalRecord[] {
  const earlier = previous.filter((s) => s.id !== session.id && s.day <= session.day && sessionCounts(s));
  const before = new Map(exerciseSummaries(earlier).map((s) => [s.key, s]));
  const records: PersonalRecord[] = [];
  for (const exercise of session.workout.exercises) {
    const key = normalizedName(exercise.name);
    const sets = performedSets(exercise);
    const prior = before.get(key);
    if (!prior || !sets.length) continue;
    const stat = sessionStat(session.id, session.day, sets);
    if (stat.maxWeight !== null && stat.maxWeight > (prior.maxWeight?.value ?? Infinity)) {
      records.push({ exercise: exercise.name, key, kind: "maxWeight", value: stat.maxWeight, day: session.day });
    }
    if (stat.bestOneRepMax !== null && stat.bestOneRepMax > (prior.bestOneRepMax?.value ?? Infinity) + 0.01) {
      records.push({ exercise: exercise.name, key, kind: "oneRepMax", value: stat.bestOneRepMax, day: session.day });
    }
    if (stat.longest !== null && stat.longest > (prior.longest?.value ?? Infinity)) {
      records.push({ exercise: exercise.name, key, kind: "longest", value: stat.longest, day: session.day });
    }
  }
  return records;
}
