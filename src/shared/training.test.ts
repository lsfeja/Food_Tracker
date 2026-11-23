import { describe, expect, it } from "vitest";
import { lastPerformance, knownNames, setsSummary, type ExerciseRecord } from "./exerciseHistory";
import { matchActivities, unplannedActivities } from "./matcher";
import { instantiateTemplate, reorder, templateFromWeek, type TemplateSession } from "./weekPlanner";
import {
  changeSport,
  detailsSummary,
  type ExerciseEntry,
  type ExerciseSet,
  newBlock,
  newContent,
  newStep,
  parseContent,
  parseDetails,
  resettingProgress,
  sportFromActivityType,
  structureSummary,
  type WorkoutDetails,
} from "./workout";

const set = (plannedReps: number | null, plannedWeight: number | null = null, o: Partial<ExerciseSet> = {}): ExerciseSet => ({
  id: crypto.randomUUID(),
  plannedReps,
  plannedWeight,
  actualReps: null,
  actualWeight: null,
  isDone: false,
  ...o,
});
const exercise = (name: string, sets: ExerciseSet[]): ExerciseEntry => ({ id: crypto.randomUUID(), name, sets, restSeconds: 90, notes: "" });

const pushDay: WorkoutDetails = {
  kind: "strength",
  notes: "",
  exercises: [
    exercise("Bench Press", [set(8, 80, { actualReps: 8, actualWeight: 80, isDone: true }), set(8, 80)]),
    exercise("Dips", [set(12)]),
  ],
};

describe("workout details", () => {
  it("round-trips through JSON and parses leniently", () => {
    const content = { sport: "strength" as const, title: "Push", details: pushDay };
    expect(parseContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
    const partial = parseDetails('{"kind":"strength","exercises":[{"name":"Squat","sets":[{"plannedReps":5}]}]}');
    expect(partial.kind === "strength" && partial.exercises[0].sets[0]).toMatchObject({ plannedReps: 5, isDone: false });
    expect(parseDetails("garbage", "endurance").kind).toBe("endurance");
  });

  it("summarizes strength and resets progress", () => {
    expect(detailsSummary(pushDay)).toBe("2 exercises · 1/3 sets");
    const reset = resettingProgress(pushDay);
    expect(detailsSummary(reset)).toBe("2 exercises · 3 sets");
    expect(reset.kind === "strength" && reset.exercises[0].sets[0]).toMatchObject({ isDone: false, actualReps: null, plannedWeight: 80 });
  });

  it("summarizes intervals and endurance basics", () => {
    const workout: WorkoutDetails = {
      kind: "endurance",
      durationMinutes: null,
      distanceKm: null,
      intensity: null,
      notes: "",
      blocks: [
        newBlock(1, [newStep("Warm-up", 15, { kind: "zone", value: 1 })]),
        newBlock(5, [newStep("", 4, { kind: "zone", value: 4 }), newStep("", 3, { kind: "zone", value: 1 })]),
        newBlock(1, [newStep("Cool-down", 10, { kind: "zone", value: 1 })]),
      ],
    };
    expect(workout.kind === "endurance" && structureSummary(workout)).toBe("15′ Z1 · 5×(4′ Z4 / 3′ Z1) · 10′ Z1");
    expect(detailsSummary(workout)).toBe("1 h · 5×(4′ Z4 / 3′ Z1)");
    expect(detailsSummary({ kind: "endurance", durationMinutes: 90, distanceKm: null, intensity: { kind: "zone", value: 2 }, blocks: [], notes: "" })).toBe("1 h 30 min · Z2");
    expect(detailsSummary({ kind: "endurance", durationMinutes: null, distanceKm: 10, intensity: { kind: "rpe", value: 4 }, blocks: [], notes: "" })).toBe("10 km · RPE 4");
  });

  it("adapts details when the sport changes", () => {
    let content = { ...newContent("yoga"), details: { kind: "general" as const, durationMinutes: 45, notes: "Flow" } };
    content = changeSport(content, "run");
    expect(content.details).toMatchObject({ kind: "endurance", durationMinutes: 45, notes: "Flow" });
    expect(changeSport(content, "ride").details.kind).toBe("endurance");
  });

  it("maps Strava sport types", () => {
    expect(sportFromActivityType("VirtualRide")).toBe("indoorRide");
    expect(sportFromActivityType("GravelRide")).toBe("ride");
    expect(sportFromActivityType("TrailRun")).toBe("run");
    expect(sportFromActivityType("WeightTraining")).toBe("strength");
    expect(sportFromActivityType("Kitesurf")).toBeNull();
  });
});

describe("activity matcher", () => {
  const morning = Date.UTC(2025, 10, 18, 7);
  const evening = Date.UTC(2025, 10, 18, 18);

  it("matches by sport group in day order, each activity once", () => {
    const result = matchActivities(
      [
        { id: "run", sport: "run", order: 0, linkedKey: null },
        { id: "ride", sport: "indoorRide", order: 1, linkedKey: null },
        { id: "run2", sport: "run", order: 2, linkedKey: null },
      ],
      [
        { key: "strava:2", sport: "ride", start: evening },
        { key: "strava:1", sport: "run", start: morning },
      ],
    );
    expect(result.links).toEqual({ run: "strava:1", ride: "strava:2" });
    expect(result.unlinks).toEqual([]);
  });

  it("keeps existing links, removes stale ones, respects suppression and skips", () => {
    const result = matchActivities(
      [
        { id: "kept", sport: "run", order: 0, linkedKey: "strava:1" },
        { id: "stale", sport: "swim", order: 1, linkedKey: "strava:gone" },
        { id: "suppressed", sport: "run", order: 2, linkedKey: null, autoLinkSuppressed: true },
        { id: "rest", sport: "rest", order: 3, linkedKey: null },
      ],
      [{ key: "strava:1", sport: "run", start: morning }, { key: "strava:3", sport: "run", start: evening }],
    );
    expect(result.links).toEqual({});
    expect(result.unlinks).toEqual(["stale"]);
    expect(unplannedActivities([{ key: "strava:3", sport: "run", start: evening }, { key: "strava:1", sport: "run", start: morning }], new Set(["strava:1"])).map((a) => a.key)).toEqual(["strava:3"]);
  });
});

describe("week planner", () => {
  const monday = "2025-11-17";
  const wednesday = "2025-11-19";

  it("instantiates a template after existing sessions", () => {
    const template: TemplateSession[] = [
      { id: "a", weekday: 2, order: 1, content: newContent("run", "Tempo") },
      { id: "b", weekday: 0, order: 0, content: newContent("strength", "Push") },
      { id: "c", weekday: 2, order: 0, content: newContent("strength", "Pull") },
    ];
    const items = instantiateTemplate(template, monday, { [wednesday]: 2 });
    expect(items.map((i) => i.content.title)).toEqual(["Push", "Pull", "Tempo"]);
    expect(items.map((i) => i.day)).toEqual([monday, wednesday, wednesday]);
    expect(items.map((i) => i.order)).toEqual([0, 2, 3]);
  });

  it("converts a week to a template and reorders ids", () => {
    let n = 0;
    const sessions = templateFromWeek(
      [
        { day: wednesday, order: 5, content: newContent("run", "B") },
        { day: wednesday, order: 2, content: newContent("run", "A") },
        { day: "2025-11-23", order: 0, content: newContent("yoga", "C") },
      ],
      () => String(n++),
    );
    expect(sessions.map((s) => s.content.title)).toEqual(["A", "B", "C"]);
    expect(sessions.map((s) => s.weekday)).toEqual([2, 2, 6]);
    expect(sessions.map((s) => s.order)).toEqual([0, 1, 0]);
    expect(reorder([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(reorder([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });
});

describe("exercise history", () => {
  const record = (day: string, exercises: ExerciseEntry[], sessionId: string = crypto.randomUUID()): ExerciseRecord => ({
    sessionId,
    day,
    workout: { kind: "strength", exercises, notes: "" },
  });

  it("finds the last done performance by normalized name", () => {
    const records = [
      record("2025-11-10", [exercise("Bench Press", [set(8, 75, { isDone: true })])]),
      record("2025-11-14", [exercise("bench  press", [set(8, 80, { isDone: true }), set(8, 80, { actualReps: 6, isDone: true }), set(8, 80)])]),
      record("2025-11-18", [exercise("Bench Press", [set(8, 82.5, { isDone: true })])], "current"),
    ];
    const last = lastPerformance("Bench Press", "2025-11-18", "current", records);
    expect(last?.day).toBe("2025-11-14");
    expect(last?.sets).toHaveLength(2);
    expect(last?.summary).toBe("8 @ 80 · 6 @ 80 kg");
    expect(lastPerformance("Squat", "2025-11-18", null, [record("2025-11-10", [exercise("Squat", [set(5)])])])).toBeNull();
  });

  it("summarizes uniform sets and lists known names", () => {
    expect(setsSummary([set(8, 80, { isDone: true }), set(8, 80, { isDone: true }), set(8, 80, { isDone: true })])).toBe("3 × 8 @ 80 kg");
    expect(setsSummary([set(12), set(12)])).toBe("2 × 12");
    expect(knownNames([record("2025-11-10", [exercise("bench press", []), exercise("Dips", [])]), record("2025-11-14", [exercise("Bench Press", [])])])).toEqual(["Bench Press", "Dips"]);
  });
});
