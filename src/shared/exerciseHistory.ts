import type { Day } from "./days";
import { seconds as fmtSeconds, weight as fmtWeight } from "./format";
import { type ExerciseKind, type ExerciseSet, performedReps, performedSeconds, performedWeight, type StrengthDetails } from "./workout";

export interface ExerciseRecord {
  sessionId: string;
  day: Day;
  workout: StrengthDetails;
}

export interface ExercisePerformance {
  day: Day;
  sets: ExerciseSet[];
  summary: string;
}

/** Case-, accent- and whitespace-insensitive name for matching. */
export function normalizedName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Most recent ticked-off sets of `name` on or before `day`, ignoring `excludedSessionId`. */
export function lastPerformance(name: string, day: Day, excludedSessionId: string | null, records: ExerciseRecord[]): ExercisePerformance | null {
  const key = normalizedName(name);
  if (!key) return null;
  const candidates = records.filter((r) => r.sessionId !== excludedSessionId && r.day <= day).sort((a, b) => (a.day < b.day ? 1 : -1));
  for (const record of candidates) {
    for (const exercise of record.workout.exercises) {
      if (normalizedName(exercise.name) !== key) continue;
      const done = exercise.sets.filter((set) => set.isDone);
      if (done.length) return { day: record.day, sets: done, summary: setsSummary(done, exercise.kind) };
    }
  }
  return null;
}

/** Distinct exercise names (most recent spelling first), for suggestions. */
export function knownNames(records: ExerciseRecord[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const record of [...records].sort((a, b) => (a.day < b.day ? 1 : -1))) {
    for (const exercise of record.workout.exercises) {
      const trimmed = exercise.name.trim();
      const key = normalizedName(trimmed);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(trimmed);
    }
  }
  return names;
}

/** "3 × 8 @ 80 kg", "8 @ 80 · 6 @ 82.5 kg", "3 × 12"; time: "3 × 45 s", "45 s · 1:00 min @ 10 kg" */
export function setsSummary(sets: ExerciseSet[], kind: ExerciseKind = "reps"): string {
  if (!sets.length) return "";
  if (kind === "time") return timeSummary(sets);
  const reps = sets.map(performedReps);
  const weights = sets.map(performedWeight);
  const repsText = (value: number | null) => (value === null ? "–" : String(value));
  const sameReps = new Set(reps.map((r) => r ?? -1)).size === 1;
  const sameWeight = new Set(weights.map((w) => w ?? -1)).size === 1;
  if (sameReps && sameWeight) {
    const base = `${sets.length} × ${repsText(reps[0])}`;
    return weights[0] !== null ? `${base} @ ${fmtWeight(weights[0])} kg` : base;
  }
  const parts = sets.map((set) => {
    const w = performedWeight(set);
    return w !== null ? `${repsText(performedReps(set))} @ ${fmtWeight(w)}` : repsText(performedReps(set));
  });
  return parts.join(" · ") + (weights.some((w) => w !== null) ? " kg" : "");
}

function timeSummary(sets: ExerciseSet[]): string {
  const durations = sets.map(performedSeconds);
  const weights = sets.map(performedWeight);
  const text = (value: number | null) => (value === null ? "–" : fmtSeconds(value));
  const sameDuration = new Set(durations.map((d) => d ?? -1)).size === 1;
  const sameWeight = new Set(weights.map((w) => w ?? -1)).size === 1;
  if (sameDuration && sameWeight) {
    const base = `${sets.length} × ${text(durations[0])}`;
    return weights[0] !== null ? `${base} @ ${fmtWeight(weights[0])} kg` : base;
  }
  const parts = sets.map((set) => {
    const w = performedWeight(set);
    return w !== null ? `${text(performedSeconds(set))} @ ${fmtWeight(w)} kg` : text(performedSeconds(set));
  });
  return parts.join(" · ");
}
