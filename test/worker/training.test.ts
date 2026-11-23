import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PlanWeekDTO, SessionDTO, WeekTemplateDTO, WorkoutTemplateDTO } from "../../src/shared/api";
import { api } from "./helpers";

const ride = { sport: "ride", title: "Zone 2", details: { kind: "endurance", durationMinutes: 90, distanceKm: null, intensity: { kind: "zone", value: 2 }, blocks: [], notes: "" } };
const strength = {
  sport: "strength",
  title: "Push",
  details: { kind: "strength", notes: "", exercises: [{ id: "e1", name: "Bench Press", restSeconds: 120, notes: "", sets: [{ id: "s1", plannedReps: 5, plannedWeight: 80, actualReps: 5, actualWeight: 82.5, isDone: true }] }] },
};

async function userIdOf(email: string) {
  await api(email)("GET", "/me");
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  return row!.id;
}

async function addActivity(userId: string, externalId: string, type: string, day: string, startAt: number) {
  await env.DB.prepare(
    `INSERT INTO activities (id, user_id, source, external_id, name, type, start_at, day, duration_s, distance_m, active_kcal, updated_at)
     VALUES (?, ?, 'strava', ?, ?, ?, ?, ?, 3600, 30000, 800, 0)`,
  )
    .bind(crypto.randomUUID(), userId, externalId, `${type} activity`, type, startAt, day)
    .run();
}

describe("plan sessions", () => {
  it("adds, orders, duplicates, moves and deletes sessions", async () => {
    const call = api("plan@example.com");
    const a = await call<SessionDTO>("POST", "/sessions", { day: "2026-03-09", content: ride });
    const b = await call<SessionDTO>("POST", "/sessions", { day: "2026-03-09", content: strength });
    expect([a.data.position, b.data.position]).toEqual([0, 1]);

    const copy = await call<SessionDTO>("POST", `/sessions/${b.data.id}/duplicate`);
    expect(copy.data.position).toBe(2);
    expect(copy.data.details.kind === "strength" && copy.data.details.exercises[0].sets[0].isDone).toBe(false);

    await call("POST", `/sessions/${copy.data.id}/move`, { day: "2026-03-09", before: a.data.id });
    let week = await call<PlanWeekDTO>("GET", "/plan/week/2026-03-09");
    expect(week.data.sessions.map((s) => s.id)).toEqual([copy.data.id, a.data.id, b.data.id]);

    await call("POST", `/sessions/${a.data.id}/move`, { day: "2026-03-11", before: null });
    week = await call<PlanWeekDTO>("GET", "/plan/week/2026-03-09");
    expect(week.data.sessions.map((s) => [s.day, s.position])).toEqual([
      ["2026-03-09", 0],
      ["2026-03-09", 1],
      ["2026-03-11", 0],
    ]);

    await call("DELETE", `/sessions/${copy.data.id}`);
    week = await call<PlanWeekDTO>("GET", "/plan/week/2026-03-09");
    expect(week.data.sessions.find((s) => s.id === b.data.id)?.position).toBe(0);
  });

  it("plans race sessions", async () => {
    const call = api("race@example.com");
    const race = await call<SessionDTO>("POST", "/sessions", { day: "2026-04-26", content: { sport: "race", title: "Marathon", details: { kind: "general", durationMinutes: 240, notes: "" } } });
    expect(race.status).toBe(201);
    expect(race.data).toMatchObject({ sport: "race", title: "Marathon", details: { kind: "general", durationMinutes: 240 } });
  });

  it("ticks off and skips sessions", async () => {
    const call = api("status@example.com");
    const s = await call<SessionDTO>("POST", "/sessions", { day: "2026-03-10", content: ride });
    const done = await call<SessionDTO>("PATCH", `/sessions/${s.data.id}`, { status: "done" });
    expect(done.data.status).toBe("done");
    expect(done.data.completedAt).toBeGreaterThan(0);
    const skipped = await call<SessionDTO>("PATCH", `/sessions/${s.data.id}`, { status: "skipped" });
    expect(skipped.data.completedAt).toBeNull();
    const edited = await call<SessionDTO>("PATCH", `/sessions/${s.data.id}`, { content: { ...ride, title: "Long ride" } });
    expect(edited.data.title).toBe("Long ride");
    expect((await call("PATCH", `/sessions/${s.data.id}`, { status: "nope" })).status).toBe(400);
  });
});

describe("activity matching", () => {
  it("links by match group, marks done, and respects manual unlink", async () => {
    const email = "match@example.com";
    const call = api(email);
    const userId = await userIdOf(email);
    await addActivity(userId, "100", "VirtualRide", "2026-03-12", Date.UTC(2026, 2, 12, 7));
    const indoor = await call<SessionDTO>("POST", "/sessions", { day: "2026-03-12", content: { ...ride, sport: "indoorRide" } });
    expect(indoor.data.linkedActivityKey).toBe("strava:100");
    expect(indoor.data.status).toBe("done");
    expect(indoor.data.completedByLink).toBe(true);

    const unlinked = await call<SessionDTO>("POST", `/sessions/${indoor.data.id}/unlink`);
    expect(unlinked.data.status).toBe("planned");
    expect(unlinked.data.autoLinkSuppressed).toBe(true);

    // A second session of the same group picks up the free activity…
    const outdoor = await call<SessionDTO>("POST", "/sessions", { day: "2026-03-12", content: ride });
    expect(outdoor.data.linkedActivityKey).toBe("strava:100");
    // …and a manual link moves it back.
    const relinked = await call<SessionDTO>("POST", `/sessions/${indoor.data.id}/link`, { activityKey: "strava:100" });
    expect(relinked.data.linkManual).toBe(true);
    const detail = await call<{ session: SessionDTO }>("GET", `/sessions/${outdoor.data.id}`);
    expect(detail.data.session.linkedActivityKey).toBeNull();
    expect(detail.data.session.status).toBe("planned");
  });

  it("creates a session from an unplanned activity", async () => {
    const email = "unplanned@example.com";
    const userId = await userIdOf(email);
    await addActivity(userId, "200", "Run", "2026-03-13", Date.UTC(2026, 2, 13, 18));
    const session = await api(email)<SessionDTO>("POST", "/activities/strava%3A200/session");
    expect(session.data).toMatchObject({ sport: "run", status: "done", linkedActivityKey: "strava:200", title: "Run activity" });
    expect(session.data.details).toMatchObject({ kind: "endurance", durationMinutes: 60, distanceKm: 30 });
  });
});

describe("library and week templates", () => {
  it("copies library workouts on use", async () => {
    const call = api("library@example.com");
    const item = await call<WorkoutTemplateDTO>("POST", "/library", { content: strength });
    expect(item.data.name).toBe("Push");
    // Progress is not stored in the library.
    expect(item.data.details.kind === "strength" && item.data.details.exercises[0].sets[0]).toMatchObject({ isDone: false, actualWeight: null });
    const session = await call<SessionDTO>("POST", `/library/${item.data.id}/schedule`, { day: "2026-03-16" });
    expect(session.data.templateId).toBe(item.data.id);
    await call("PUT", `/library/${item.data.id}`, { content: { ...strength, title: "Push v2" } });
    const week = await call<PlanWeekDTO>("GET", "/plan/week/2026-03-16");
    expect(week.data.sessions[0].title).toBe("Push");
    const list = await call<WorkoutTemplateDTO[]>("GET", "/library");
    expect(list.data[0]).toMatchObject({ name: "Push v2", useCount: 1 });
  });

  it("saves a week and applies it (replace keeps done sessions)", async () => {
    const call = api("weeks@example.com");
    const a = await call<SessionDTO>("POST", "/sessions", { day: "2026-03-16", content: strength });
    await call("POST", "/sessions", { day: "2026-03-18", content: ride });
    const template = await call<WeekTemplateDTO>("POST", "/week-templates/from-week", { weekStart: "2026-03-16", name: "Base week" });
    expect(template.data.sessions.map((s) => s.weekday)).toEqual([0, 2]);

    await call("PATCH", `/sessions/${a.data.id}`, { status: "done" });
    await call("POST", `/week-templates/${template.data.id}/apply`, { weekStart: "2026-03-16", mode: "replace" });
    let week = await call<PlanWeekDTO>("GET", "/plan/week/2026-03-16");
    expect(week.data.sessions.map((s) => [s.day, s.position, s.status])).toEqual([
      ["2026-03-16", 0, "done"],
      ["2026-03-16", 1, "planned"],
      ["2026-03-18", 0, "planned"],
    ]);

    await call("POST", `/week-templates/${template.data.id}/apply`, { weekStart: "2026-03-23", mode: "add" });
    week = await call<PlanWeekDTO>("GET", "/plan/week/2026-03-23");
    expect(week.data.sessions).toHaveLength(2);

    const copy = await call<WeekTemplateDTO>("POST", `/week-templates/${template.data.id}/duplicate`);
    expect(copy.data.name).toBe("Base week Copy");
    expect((await call<WeekTemplateDTO[]>("GET", "/week-templates")).data).toHaveLength(2);
  });
});
