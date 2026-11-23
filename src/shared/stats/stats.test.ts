import { describe, expect, it } from "vitest";
import type { DayTotals } from "../budget";
import type { UserSettings } from "../settings";
import type { ExerciseEntry } from "../workout";
import { type ActivitySnapshot, classifyActivity, elapsedFraction, enduranceReport, goalProgress, yearOverYear } from "./endurance";
import { nutritionReport } from "./nutrition";
import { bucketStarts, periodInterval, periodTitle } from "./period";
import { planReport } from "./plan";
import { exerciseSummaries, newRecords, oneRepMax, performedSets, personalRecords, strengthReport, type StrengthSessionSnapshot } from "./strength";

const today = "2025-11-19"; // Wednesday

describe("periods", () => {
  it("computes week, month, year and all-time intervals", () => {
    expect(periodInterval({ kind: "week", year: 2025 }, today)).toEqual({ start: "2025-11-17", end: "2025-11-24" });
    expect(periodInterval({ kind: "month", year: 2025 }, today)).toEqual({ start: "2025-11-01", end: "2025-12-01" });
    expect(periodInterval({ kind: "year", year: 2025 }, today)).toEqual({ start: "2025-01-01", end: "2026-01-01" });
    expect(periodInterval({ kind: "month", year: 2023 }, today).start).toBe("2023-12-01");
    expect(periodInterval({ kind: "week", year: 2023 }, today).start).toBe("2023-12-25");
    expect(periodInterval({ kind: "all", year: 2025 }, today, "2019-03-04")).toEqual({ start: "2019-03-04", end: "2025-11-20" });
  });

  it("generates buckets and titles", () => {
    const year = periodInterval({ kind: "year", year: 2025 }, today);
    expect(bucketStarts("month", year)).toHaveLength(12);
    const weeks = bucketStarts("week", year);
    expect(weeks[0]).toBe("2024-12-30");
    expect(weeks).toHaveLength(53);
    expect(periodTitle({ kind: "year", year: 2025 }, today)).toBe("2025 to date");
    expect(periodTitle({ kind: "month", year: 2025 }, today)).toBe("November 2025");
  });
});

describe("endurance", () => {
  const a = (key: string, day: string, sport: ActivitySnapshot["sport"], km: number, hours = 1, elevation = 0): ActivitySnapshot => ({
    key,
    name: key,
    startAt: Date.parse(`${day}T08:00:00Z`),
    day,
    sport,
    type: "",
    distanceM: km * 1000,
    movingS: hours * 3600,
    elevationM: elevation,
  });
  const sample = [
    a("r1", "2025-03-10", "ride", 80, 3, 900),
    a("r2", "2025-03-12", "ride", 40, 1.5, 300),
    a("z1", "2025-01-15", "indoorRide", 30, 1),
    a("run", "2025-06-01", "run", 10, 1),
    a("old", "2024-05-01", "ride", 100, 4),
  ];
  const year = { kind: "year" as const, year: 2025 };

  it("totals per filter", () => {
    const all = enduranceReport(sample, "all", year, today);
    expect(all.totals.count).toBe(4);
    expect(all.totals.distanceM).toBe(160_000);
    expect(all.totals.elevationM).toBe(1200);
    expect(enduranceReport(sample, "cycling", year, today).totals.distanceM).toBe(150_000);
    expect(enduranceReport(sample, "ride", year, today).totals.distanceM).toBe(120_000);
  });

  it("buckets, records and indoor share", () => {
    const r = enduranceReport(sample, "cycling", year, today);
    expect(r.primaryBucket).toBe("week");
    expect(r.secondary).toHaveLength(12);
    expect(r.secondary[2].totals.distanceM).toBe(120_000);
    expect(r.longest?.name).toBe("r1");
    expect(r.mostElevation?.elevationM).toBe(900);
    expect(r.bestWeek?.start).toBe("2025-03-10");
    expect(r.bestMonth?.start).toBe("2025-03-01");
    const share = enduranceReport(sample, "all", year, today).indoorShare!;
    expect(share.indoorCount).toBe(1);
    expect(share.outdoorCount).toBe(2);
    expect(share.indoorFraction).toBe(1 / 5.5);
    expect(enduranceReport(sample, "run", year, today).indoorShare).toBeNull();
    expect(enduranceReport(sample, "all", { kind: "week", year: 2025 }, today).primary).toHaveLength(7);
  });

  it("year over year is cumulative and aligned", () => {
    const points = yearOverYear(sample.filter((s) => s.sport === "ride"), 2025, today);
    const previous = points.filter((p) => p.year === 2024);
    const current = points.filter((p) => p.year === 2025);
    expect(previous).toHaveLength(366);
    expect(previous[previous.length - 1].km).toBe(100);
    expect(previous[0].day).toBe("2025-01-01");
    expect(current[current.length - 1].day).toBe(today);
    expect(current[current.length - 1].km).toBe(120);
    expect(current.find((p) => p.day === "2025-03-10")?.km).toBe(80);
  });

  it("goal progress against the elapsed year", () => {
    const p = goalProgress(8000, 2000, 2025, "2025-03-15");
    expect(p.expected).toBeCloseTo(1600);
    expect(p.projected).toBeCloseTo(10_000);
    expect(p.status).toBe("onTrack");
    expect(p.fraction).toBe(0.25);
    expect(goalProgress(8000, 1000, 2025, "2025-03-15").status).toBe("behind");
    expect(goalProgress(100, 120, 2025, "2025-03-15").status).toBe("reached");
    expect(elapsedFraction(2024, "2025-03-15")).toBe(1);
  });

  it("classifies activities", () => {
    expect(classifyActivity("VirtualRide", true)).toBe("indoorRide");
    expect(classifyActivity("Ride", true)).toBe("indoorRide");
    expect(classifyActivity("GravelRide", false)).toBe("ride");
    expect(classifyActivity("Hike", false)).toBe("other");
  });
});

describe("strength", () => {
  const ex = (name: string, sets: [number, number | null, boolean][]): ExerciseEntry => ({
    id: crypto.randomUUID(),
    name,
    restSeconds: 90,
    notes: "",
    sets: sets.map(([reps, weight, isDone]) => ({ id: crypto.randomUUID(), plannedReps: reps, plannedWeight: weight, actualReps: null, actualWeight: null, isDone })),
  });
  const session = (day: string, exercises: ExerciseEntry[], isDone = true, id: string = crypto.randomUUID()): StrengthSessionSnapshot => ({
    id,
    day,
    isDone,
    workout: { kind: "strength", exercises, notes: "" },
  });

  it("uses Epley and only done sets", () => {
    expect(oneRepMax(100, 1)).toBe(100);
    expect(oneRepMax(90, 6)).toBe(108);
    expect(oneRepMax(60, 30)).toBe(120);
    const sets = performedSets({
      id: "x",
      name: "Squat",
      restSeconds: null,
      notes: "",
      sets: [
        { id: "1", plannedReps: 5, plannedWeight: 100, actualReps: 4, actualWeight: 102.5, isDone: true },
        { id: "2", plannedReps: 5, plannedWeight: 100, actualReps: null, actualWeight: null, isDone: false },
        { id: "3", plannedReps: 10, plannedWeight: null, actualReps: null, actualWeight: null, isDone: true },
      ],
    });
    expect(sets).toEqual([{ reps: 4, weight: 102.5 }, { reps: 10, weight: null }]);
  });

  it("summarizes exercises and records", () => {
    const summaries = exerciseSummaries([
      session("2025-11-03", [ex("Bench Press", [[8, 80, true], [8, 80, true]])]),
      session("2025-11-10", [ex("Bench Press", [[5, 90, true], [8, 82.5, true]])]),
      session("2025-11-17", [ex("bench press", [[3, 90, true]])]),
    ]);
    expect(summaries).toHaveLength(1);
    const bench = summaries[0];
    expect(bench.name).toBe("bench press");
    expect(bench.history).toHaveLength(3);
    expect(bench.maxWeight).toEqual({ value: 90, day: "2025-11-10" });
    expect(bench.bestOneRepMax?.value).toBe(105);
    expect(bench.totalVolume).toBe(1280 + 450 + 660 + 270);
    expect(personalRecords(summaries).map((r) => r.kind)).toEqual(["maxWeight", "oneRepMax"]);
  });

  it("reports period totals and buckets", () => {
    const sessions = [
      session("2025-11-03", [ex("Bench Press", [[10, 50, true]])]),
      session("2025-11-05", [ex("Bench Press", [[10, 50, true], [10, 50, false]])]),
      session("2025-11-12", [ex("Bench Press", [[10, 60, false]])], false),
      session("2024-11-05", [ex("Bench Press", [[10, 40, true]])]),
    ];
    const month = strengthReport(sessions, { kind: "month", year: 2025 }, today);
    expect(month.sessionCount).toBe(2);
    expect(month.setCount).toBe(2);
    expect(month.volume).toBe(1000);
    expect(month.bucket).toBe("day");
    expect(month.buckets).toHaveLength(30);
    expect(month.exercises).toHaveLength(1);
    const year = strengthReport(sessions, { kind: "year", year: 2025 }, today);
    expect(year.bucket).toBe("week");
    expect(year.buckets.find((b) => b.start === "2025-11-03")?.sessions).toBe(2);
  });

  it("detects new records against history only", () => {
    const earlier = session("2025-11-03", [ex("Bench Press", [[8, 80, true]])]);
    const current = session("2025-11-10", [ex("Bench Press", [[3, 85, true]]), ex("Leg Press", [[10, 200, true]])]);
    const records = newRecords(current, [earlier, current]);
    expect(records.map((r) => r.kind)).toEqual(["maxWeight"]);
    expect(records[0].value).toBe(85);
  });
});

describe("plan stats", () => {
  it("counts adherence up to today", () => {
    const r = planReport(
      [
        { day: "2025-11-17", sport: "run", status: "done", plannedMinutes: 45, linkedActivityKey: null },
        { day: "2025-11-18", sport: "strength", status: "planned", plannedMinutes: null, linkedActivityKey: null },
        { day: "2025-11-18", sport: "yoga", status: "skipped", plannedMinutes: 30, linkedActivityKey: null },
        { day: "2025-11-19", sport: "rest", status: "planned", plannedMinutes: null, linkedActivityKey: null },
        { day: "2025-11-21", sport: "ride", status: "planned", plannedMinutes: 90, linkedActivityKey: null },
      ],
      [],
      { kind: "week", year: 2025 },
      today,
    );
    expect(r.plannedToDate).toBe(3);
    expect(r.completed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.rate).toBe(1 / 3);
    expect(r.adherence).toHaveLength(7);
    expect(r.adherence[4]).toMatchObject({ planned: 1, completed: 0 });
  });

  it("uses linked activity time, planned duration and unplanned activities", () => {
    const r = planReport(
      [
        { day: "2025-11-17", sport: "run", status: "done", plannedMinutes: 45, linkedActivityKey: "strava:1" },
        { day: "2025-11-18", sport: "yoga", status: "done", plannedMinutes: 30, linkedActivityKey: null },
        { day: "2025-11-18", sport: "strength", status: "done", plannedMinutes: null, linkedActivityKey: null },
      ],
      [
        { key: "strava:1", day: "2025-11-17", type: "Run", movingS: 50 * 60 },
        { key: "strava:2", day: "2025-11-19", type: "VirtualRide", movingS: 60 * 60 },
      ],
      { kind: "week", year: 2025 },
      today,
    );
    const bySport = Object.fromEntries(r.totals.map((t) => [t.sport, t.minutes]));
    expect(bySport).toEqual({ run: 50, yoga: 30, indoorRide: 60 });
    expect(r.totalMinutes).toBe(140);
    expect(r.totals[0].sport).toBe("indoorRide");
  });
});

describe("nutrition stats", () => {
  const settings: UserSettings = {
    targets: { kcal: 2000, protein: 150, carbs: 200, fat: 70 },
    budget: { activeCaloriesEnabled: true, activeCaloriesPercent: 100, restDayActivePct: 75, maxDailyDeficit: 700, carryOverPct: 70, goalKcal: 0 },
    timezone: "UTC",
  };
  const t = (kcal: number, protein = 0, active = 0): DayTotals => ({ eaten: { kcal, protein, carbs: 0, fat: 0 }, activeCalories: active });

  it("averages logged days, budget days and energy", () => {
    const r = nutritionReport(
      {
        "2025-11-17": t(1800, 120),
        "2025-11-18": t(2400, 160, 500),
        "2025-11-16": t(2300, 100),
        "2025-11-19": t(0, 0, 300),
        "2025-11-20": t(999),
      },
      settings,
      { kind: "week", year: 2025 },
      today,
    );
    expect(r.loggedDays).toBe(2);
    expect(r.average.kcal).toBe(2100);
    expect(r.average.protein).toBe(140);
    // Weekly budget: the 500 active kcal of Tuesday are spread over Tue–Sun, so 2,400 is over.
    expect(r.daysWithin).toBe(1);
    expect(r.daysOver).toBe(1);
    expect(r.buckets).toHaveLength(7);
    expect(r.energy[1]).toMatchObject({ activeCalories: 500 });
    expect(r.energy[1].eaten.kcal).toBe(2400);
    expect(r.energy[2].activeCalories).toBe(300);
  });

  it("uses weekly averages for a month", () => {
    const r = nutritionReport({ "2025-11-03": t(2500), "2025-11-04": t(1500) }, settings, { kind: "month", year: 2025 }, today);
    expect(r.bucket).toBe("week");
    expect(r.daysOver).toBe(1);
    expect(r.daysWithin).toBe(1);
    expect(r.buckets.find((b) => b.start === "2025-11-03")?.average.kcal).toBe(2000);
  });
});
