import { describe, expect, it } from "vitest";
import type { WeightDTO } from "../../src/shared/api";
import { api } from "./helpers";

describe("body weight", () => {
  it("saves one value per day, replaces it and deletes it", async () => {
    const call = api("weight@example.com");
    expect((await call<WeightDTO[]>("GET", "/weights")).data).toEqual([]);
    const saved = await call<WeightDTO>("PUT", "/weights/2026-03-02", { weightKg: 72.456, bodyFatPct: 18.44 });
    expect(saved.status).toBe(200);
    expect(saved.data).toEqual({ day: "2026-03-02", weightKg: 72.46, bodyFatPct: 18.4, excluded: false });
    await call("PUT", "/weights/2026-03-01", { weightKg: "73.1" });
    // Saving the same day again replaces the value (and clears body fat when it's left out).
    await call("PUT", "/weights/2026-03-02", { weightKg: 72.2 });
    expect((await call<WeightDTO[]>("GET", "/weights")).data).toEqual([
      { day: "2026-03-01", weightKg: 73.1, bodyFatPct: null, excluded: false },
      { day: "2026-03-02", weightKg: 72.2, bodyFatPct: null, excluded: false },
    ]);
    expect((await call("DELETE", "/weights/2026-03-01")).status).toBe(204);
    expect((await call<WeightDTO[]>("GET", "/weights")).data.map((w) => w.day)).toEqual(["2026-03-02"]);
  });

  it("excludes a weigh-in and keeps the flag when the value changes", async () => {
    const call = api("weight-exclude@example.com");
    await call("PUT", "/weights/2026-03-02", { weightKg: 75 });
    const patched = await call<WeightDTO>("PATCH", "/weights/2026-03-02", { excluded: true });
    expect(patched.data).toMatchObject({ day: "2026-03-02", excluded: true });
    const replaced = await call<WeightDTO>("PUT", "/weights/2026-03-02", { weightKg: 74.5 });
    expect(replaced.data).toEqual({ day: "2026-03-02", weightKg: 74.5, bodyFatPct: null, excluded: true });
    expect((await call("PATCH", "/weights/2026-03-09", { excluded: true })).status).toBe(404);
    expect((await call("PATCH", "/weights/2026-03-02", { excluded: "yes" })).status).toBe(400);
    // Other users can't change it.
    expect((await api("weight-exclude-other@example.com")("PATCH", "/weights/2026-03-02", { excluded: false })).status).toBe(404);
  });

  it("rejects implausible values and bad days", async () => {
    const call = api("weight-invalid@example.com");
    expect((await call("PUT", "/weights/2026-03-02", { weightKg: 5 })).status).toBe(400);
    expect((await call("PUT", "/weights/2026-03-02", {})).status).toBe(400);
    expect((await call("PUT", "/weights/2026-03-02", { weightKg: 72, bodyFatPct: 95 })).status).toBe(400);
    expect((await call("PUT", "/weights/02.03.2026", { weightKg: 72 })).status).toBe(400);
    expect((await call<WeightDTO[]>("GET", "/weights")).data).toEqual([]);
  });

  it("keeps users apart", async () => {
    await api("weight-a@example.com")("PUT", "/weights/2026-03-02", { weightKg: 72 });
    const other = api("weight-b@example.com");
    expect((await other<WeightDTO[]>("GET", "/weights")).data).toEqual([]);
    await other("DELETE", "/weights/2026-03-02");
    expect((await api("weight-a@example.com")<WeightDTO[]>("GET", "/weights")).data).toHaveLength(1);
  });
});
