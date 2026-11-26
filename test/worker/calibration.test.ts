import { describe, expect, it } from "vitest";
import type { CalibrationDTO } from "../../src/shared/api";
import type { UserSettings } from "../../src/shared/settings";
import { api } from "./helpers";

type Result = { calibration: CalibrationDTO; settings: UserSettings };

describe("calibration", () => {
  it("applies an accepted adjustment from that day and logs it", async () => {
    const call = api("calib@example.com");
    await call("PUT", "/settings", { targets: { kcal: 2400 }, day: "2026-11-01" });
    const accepted = await call<Result>("POST", "/calibrations", {
      day: "2026-12-07",
      decision: "accepted",
      adjustment: -100,
      reason: "Need lower than assumed.",
      details: { trackedDays: 14, weighIns: 12 },
    });
    expect(accepted.status).toBe(200);
    expect(accepted.data.calibration).toMatchObject({ decision: "accepted", oldBaseline: 2400, newBaseline: 2300, adjustment: -100 });
    expect(accepted.data.settings.targets.kcal).toBe(2300);
    // Past days keep 2,400; from the decision day on 2,300.
    expect(accepted.data.settings.budgetHistory.map((e) => [e.day, e.baselineKcal])).toEqual([
      ["1970-01-01", 2200],
      ["2026-11-01", 2400],
      ["2026-12-07", 2300],
    ]);

    const declined = await call<Result>("POST", "/calibrations", { day: "2026-12-21", decision: "declined", adjustment: 50, reason: "x" });
    expect(declined.data.settings.targets.kcal).toBe(2300);
    const log = await call<CalibrationDTO[]>("GET", "/calibrations");
    expect(log.data.map((c) => [c.day, c.decision, c.newBaseline])).toEqual([
      ["2026-12-21", "declined", 2350],
      ["2026-12-07", "accepted", 2300],
    ]);
    expect(log.data[1].details).toEqual({ trackedDays: 14, weighIns: 12 });
  });

  it("rejects steps above the limit and bad input; users are separate", async () => {
    const call = api("calib-invalid@example.com");
    expect((await call("POST", "/calibrations", { day: "2026-12-07", decision: "accepted", adjustment: -150 })).status).toBe(400);
    expect((await call("POST", "/calibrations", { day: "2026-12-07", decision: "maybe", adjustment: 0 })).status).toBe(400);
    expect((await call("POST", "/calibrations", { day: "7.12.", decision: "accepted", adjustment: 0 })).status).toBe(400);
    expect((await call<CalibrationDTO[]>("GET", "/calibrations")).data).toEqual([]);
    await api("calib-a@example.com")("POST", "/calibrations", { day: "2026-12-07", decision: "declined", adjustment: 0 });
    expect((await api("calib-b@example.com")<CalibrationDTO[]>("GET", "/calibrations")).data).toEqual([]);
  });
});
