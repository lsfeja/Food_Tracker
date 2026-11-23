import { describe, expect, it } from "vitest";
import type { GoalDTO, StatsSessionDTO } from "../../src/shared/api";
import { api } from "./helpers";

describe("stats data", () => {
  it("returns session snapshots with planned minutes and the data range", async () => {
    const call = api("stats@example.com");
    await call("POST", "/sessions", {
      day: "2025-12-30",
      content: { sport: "run", title: "", details: { kind: "endurance", durationMinutes: 45, distanceKm: null, intensity: null, blocks: [], notes: "" } },
    });
    await call("POST", "/entries", { day: "2025-11-02", kcal: 500 });
    const sessions = await call<StatsSessionDTO[]>("GET", "/stats/sessions");
    expect(sessions.data).toEqual([{ day: "2025-12-30", sport: "run", status: "planned", plannedMinutes: 45, linkedActivityKey: null }]);
    expect((await call<{ earliest: string }>("GET", "/stats/range")).data.earliest).toBe("2025-11-02");
  });

  it("saves, replaces and deletes yearly goals", async () => {
    const call = api("goals@example.com");
    expect((await call("PUT", "/goals", { year: 2026, sport: "cycling", distanceKm: null, hours: null })).status).toBe(400);
    await call("PUT", "/goals", { year: 2026, sport: "cycling", distanceKm: 8000 });
    await call("PUT", "/goals", { year: 2026, sport: "cycling", distanceKm: 9000, hours: 300 });
    let goals = await call<GoalDTO[]>("GET", "/goals");
    expect(goals.data).toEqual([{ year: 2026, sport: "cycling", distanceKm: 9000, hours: 300 }]);
    await call("DELETE", "/goals/2026/cycling");
    goals = await call<GoalDTO[]>("GET", "/goals");
    expect(goals.data).toEqual([]);
  });
});
