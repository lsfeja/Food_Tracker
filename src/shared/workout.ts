import { distance as fmtDistance, duration as fmtDuration, shortDistance, shortMinutes } from "./format";

export type SportCategory = "strength" | "endurance" | "other";
export type SportType = "strength" | "run" | "ride" | "indoorRide" | "swim" | "race" | "mobility" | "yoga" | "rest" | "custom";
export type MatchGroup = "running" | "cycling" | "swimming" | "strength" | "yoga" | "mobility";
export type SessionStatus = "planned" | "done" | "skipped";

export const SPORTS: SportType[] = ["strength", "run", "ride", "indoorRide", "swim", "race", "mobility", "yoga", "rest", "custom"];

export const sportInfo: Record<SportType, { name: string; category: SportCategory; matchGroup: MatchGroup | null; emoji: string }> = {
  strength: { name: "Strength", category: "strength", matchGroup: "strength", emoji: "🏋️" },
  run: { name: "Run", category: "endurance", matchGroup: "running", emoji: "🏃" },
  ride: { name: "Ride", category: "endurance", matchGroup: "cycling", emoji: "🚴" },
  indoorRide: { name: "Indoor Ride", category: "endurance", matchGroup: "cycling", emoji: "🚲" },
  swim: { name: "Swim", category: "endurance", matchGroup: "swimming", emoji: "🏊" },
  // Race (Wettkampf): only plannable for now (duration, notes). Race-specific details
  // (discipline, distance, target time, effect on the budget) can become their own
  // WorkoutDetails kind later; stored sessions keep working thanks to the lenient parser.
  race: { name: "Race", category: "other", matchGroup: null, emoji: "🏁" },
  mobility: { name: "Mobility", category: "other", matchGroup: "mobility", emoji: "🤸" },
  yoga: { name: "Yoga", category: "other", matchGroup: "yoga", emoji: "🧘" },
  rest: { name: "Rest Day", category: "other", matchGroup: null, emoji: "😴" },
  custom: { name: "Custom", category: "other", matchGroup: null, emoji: "⭐" },
};

export const isSport = (value: unknown): value is SportType => typeof value === "string" && value in sportInfo;

/** Maps a Strava `sport_type` (or legacy `type`) to a sport. */
export function sportFromActivityType(type: string): SportType | null {
  switch (type) {
    case "Run":
    case "TrailRun":
    case "VirtualRun":
      return "run";
    case "VirtualRide":
      return "indoorRide";
    case "Ride":
    case "MountainBikeRide":
    case "GravelRide":
    case "EBikeRide":
    case "EMountainBikeRide":
    case "Velomobile":
    case "Handcycle":
      return "ride";
    case "Swim":
      return "swim";
    case "WeightTraining":
    case "Crossfit":
      return "strength";
    case "Yoga":
      return "yoga";
    case "Pilates":
      return "mobility";
    default:
      return null;
  }
}

// MARK: Payload

export type Intensity = { kind: "zone"; value: number } | { kind: "rpe"; value: number };

export const intensityLabel = (intensity: Intensity) =>
  intensity.kind === "zone" ? `Z${intensity.value}` : `RPE ${intensity.value}`;

export interface ExerciseSet {
  id: string;
  plannedReps: number | null;
  /** kg; null = bodyweight */
  plannedWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  isDone: boolean;
}

export interface ExerciseEntry {
  id: string;
  name: string;
  sets: ExerciseSet[];
  restSeconds: number | null;
  notes: string;
}

export interface IntervalStep {
  id: string;
  label: string;
  durationMinutes: number | null;
  distanceKm: number | null;
  intensity: Intensity | null;
}

export interface IntervalBlock {
  id: string;
  repeats: number;
  steps: IntervalStep[];
}

export type WorkoutDetails =
  | { kind: "strength"; exercises: ExerciseEntry[]; notes: string }
  | {
      kind: "endurance";
      durationMinutes: number | null;
      distanceKm: number | null;
      intensity: Intensity | null;
      blocks: IntervalBlock[];
      notes: string;
    }
  | { kind: "general"; durationMinutes: number | null; notes: string };

export type StrengthDetails = Extract<WorkoutDetails, { kind: "strength" }>;
export type EnduranceDetails = Extract<WorkoutDetails, { kind: "endurance" }>;
export type GeneralDetails = Extract<WorkoutDetails, { kind: "general" }>;

/** Sport + title + details: copied by value from templates into sessions ("copy on use"). */
export interface WorkoutContent {
  sport: SportType;
  title: string;
  details: WorkoutDetails;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export const performedReps = (set: ExerciseSet) => set.actualReps ?? set.plannedReps;
export const performedWeight = (set: ExerciseSet) => set.actualWeight ?? set.plannedWeight;

export function newSet(plannedReps: number | null = 8, plannedWeight: number | null = null): ExerciseSet {
  return { id: newId(), plannedReps, plannedWeight, actualReps: null, actualWeight: null, isDone: false };
}

export function newExercise(name = ""): ExerciseEntry {
  return { id: newId(), name, sets: [newSet(), newSet(), newSet()], restSeconds: 90, notes: "" };
}

export function newStep(label = "", durationMinutes: number | null = 3, intensity: Intensity | null = { kind: "zone", value: 1 }): IntervalStep {
  return { id: newId(), label, durationMinutes, distanceKm: null, intensity };
}

export function newBlock(repeats: number, steps: IntervalStep[]): IntervalBlock {
  return { id: newId(), repeats, steps };
}

export function emptyDetails(category: SportCategory): WorkoutDetails {
  switch (category) {
    case "strength":
      return { kind: "strength", exercises: [], notes: "" };
    case "endurance":
      return { kind: "endurance", durationMinutes: null, distanceKm: null, intensity: null, blocks: [], notes: "" };
    case "other":
      return { kind: "general", durationMinutes: null, notes: "" };
  }
}

export const detailsCategory = (details: WorkoutDetails): SportCategory =>
  details.kind === "general" ? "other" : details.kind;

export function newContent(sport: SportType, title = ""): WorkoutContent {
  return { sport, title, details: emptyDetails(sportInfo[sport].category) };
}

export function displayTitle(content: Pick<WorkoutContent, "sport" | "title">): string {
  return content.title.trim() || sportInfo[content.sport].name;
}

export function blockMinutes(block: IntervalBlock): number {
  return Math.max(block.repeats, 1) * block.steps.reduce((sum, step) => sum + (step.durationMinutes ?? 0), 0);
}

export function stepSummary(step: IntervalStep): string {
  const parts: string[] = [];
  if (step.durationMinutes !== null) parts.push(shortMinutes(step.durationMinutes));
  if (step.distanceKm !== null) parts.push(shortDistance(step.distanceKm));
  if (step.intensity) parts.push(intensityLabel(step.intensity));
  return parts.length ? parts.join(" ") : step.label || "Step";
}

export function blockSummary(block: IntervalBlock): string {
  const inner = block.steps.map(stepSummary).join(" / ");
  if (block.repeats <= 1) return inner;
  return block.steps.length > 1 ? `${block.repeats}×(${inner})` : `${block.repeats}×${inner}`;
}

/** Planned duration (endurance: explicit or sum of intervals). */
export function plannedMinutes(details: WorkoutDetails): number | null {
  switch (details.kind) {
    case "strength":
      return null;
    case "endurance": {
      if (details.durationMinutes !== null) return details.durationMinutes;
      const total = details.blocks.reduce((sum, block) => sum + blockMinutes(block), 0);
      return total > 0 ? total : null;
    }
    case "general":
      return details.durationMinutes;
  }
}

export function structureSummary(details: EnduranceDetails): string | null {
  return details.blocks.length ? details.blocks.map(blockSummary).join(" · ") : null;
}

const firstLine = (text: string) => text.split("\n")[0] ?? "";

export const setCount = (details: StrengthDetails) => details.exercises.reduce((sum, e) => sum + e.sets.length, 0);
export const doneSetCount = (details: StrengthDetails) =>
  details.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.isDone).length, 0);

/** "4 exercises · 16 sets", "1 h · Z2 · 5×(4′ Z4 / 3′ Z1)" */
export function detailsSummary(details: WorkoutDetails): string {
  switch (details.kind) {
    case "strength": {
      if (!details.exercises.length) return firstLine(details.notes);
      const exercises = details.exercises.length === 1 ? "1 exercise" : `${details.exercises.length} exercises`;
      const done = doneSetCount(details);
      const total = setCount(details);
      return `${exercises} · ${done > 0 ? `${done}/${total}` : total} sets`;
    }
    case "endurance": {
      const parts: string[] = [];
      const minutes = plannedMinutes(details);
      if (minutes !== null) parts.push(fmtDuration(minutes));
      if (details.distanceKm !== null) parts.push(fmtDistance(details.distanceKm));
      if (details.intensity) parts.push(intensityLabel(details.intensity));
      const main = details.blocks.find((block) => block.repeats > 1);
      if (main) parts.push(blockSummary(main));
      return parts.length ? parts.join(" · ") : firstLine(details.notes);
    }
    case "general":
      return details.durationMinutes !== null ? fmtDuration(details.durationMinutes) : firstLine(details.notes);
  }
}

/** Converts details to another category, keeping notes and duration. */
export function adaptDetails(details: WorkoutDetails, category: SportCategory): WorkoutDetails {
  if (detailsCategory(details) === category) return details;
  const minutes = plannedMinutes(details);
  switch (category) {
    case "strength":
      return { kind: "strength", exercises: [], notes: details.notes };
    case "endurance":
      return { kind: "endurance", durationMinutes: minutes, distanceKm: null, intensity: null, blocks: [], notes: details.notes };
    case "other":
      return { kind: "general", durationMinutes: minutes, notes: details.notes };
  }
}

export function changeSport(content: WorkoutContent, sport: SportType): WorkoutContent {
  return { ...content, sport, details: adaptDetails(content.details, sportInfo[sport].category) };
}

/** Copy without progress (done flags, actual values), e.g. for templates. */
export function resettingProgress(details: WorkoutDetails): WorkoutDetails {
  if (details.kind !== "strength") return details;
  return {
    ...details,
    exercises: details.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set, isDone: false, actualReps: null, actualWeight: null })),
    })),
  };
}

export function resetContent(content: WorkoutContent): WorkoutContent {
  return { ...content, details: resettingProgress(content.details) };
}

/** Fresh ids for all nested items (duplicating). */
export function withNewIds(details: WorkoutDetails): WorkoutDetails {
  switch (details.kind) {
    case "strength":
      return {
        ...details,
        exercises: details.exercises.map((e) => ({ ...e, id: newId(), sets: e.sets.map((s) => ({ ...s, id: newId() })) })),
      };
    case "endurance":
      return {
        ...details,
        blocks: details.blocks.map((b) => ({ ...b, id: newId(), steps: b.steps.map((s) => ({ ...s, id: newId() })) })),
      };
    case "general":
      return { ...details };
  }
}

// MARK: Lenient parsing (stored JSON may be partial or from older versions)

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const optNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const id = (v: unknown): string => (typeof v === "string" && v ? v : newId());

function parseIntensity(v: unknown): Intensity | null {
  const o = obj(v);
  const value = optNum(o.value);
  if ((o.kind === "zone" || o.kind === "rpe") && value !== null) return { kind: o.kind, value };
  return null;
}

export function parseDetails(raw: unknown, fallback: SportCategory = "other"): WorkoutDetails {
  const o = obj(typeof raw === "string" ? safeJSON(raw) : raw);
  switch (o.kind) {
    case "strength":
      return {
        kind: "strength",
        notes: text(o.notes),
        exercises: list(o.exercises).map((e) => {
          const ex = obj(e);
          return {
            id: id(ex.id),
            name: text(ex.name),
            restSeconds: optNum(ex.restSeconds),
            notes: text(ex.notes),
            sets: list(ex.sets).map((s) => {
              const set = obj(s);
              return {
                id: id(set.id),
                plannedReps: optNum(set.plannedReps),
                plannedWeight: optNum(set.plannedWeight),
                actualReps: optNum(set.actualReps),
                actualWeight: optNum(set.actualWeight),
                isDone: set.isDone === true,
              };
            }),
          };
        }),
      };
    case "endurance":
      return {
        kind: "endurance",
        durationMinutes: optNum(o.durationMinutes),
        distanceKm: optNum(o.distanceKm),
        intensity: parseIntensity(o.intensity),
        notes: text(o.notes),
        blocks: list(o.blocks).map((b) => {
          const block = obj(b);
          return {
            id: id(block.id),
            repeats: Math.max(optNum(block.repeats) ?? 1, 1),
            steps: list(block.steps).map((s) => {
              const step = obj(s);
              return {
                id: id(step.id),
                label: text(step.label),
                durationMinutes: optNum(step.durationMinutes),
                distanceKm: optNum(step.distanceKm),
                intensity: parseIntensity(step.intensity),
              };
            }),
          };
        }),
      };
    case "general":
      return { kind: "general", durationMinutes: optNum(o.durationMinutes), notes: text(o.notes) };
    default:
      return emptyDetails(fallback);
  }
}

export function parseContent(raw: unknown): WorkoutContent | null {
  const o = obj(raw);
  if (!isSport(o.sport)) return null;
  return { sport: o.sport, title: text(o.title), details: parseDetails(o.details, sportInfo[o.sport].category) };
}

function safeJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
