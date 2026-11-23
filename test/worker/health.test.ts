import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("auth", () => {
  it("answers the health check", async () => {
    const response = await SELF.fetch("https://app.test/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("creates the user from the Access email header", async () => {
    const response = await SELF.fetch("https://app.test/api/me", {
      headers: { "Cf-Access-Authenticated-User-Email": "Lucas@Example.com" },
    });
    expect(await response.json()).toEqual({ email: "lucas@example.com" });
  });

  it("falls back to DEV_USER_EMAIL locally", async () => {
    const response = await SELF.fetch("https://app.test/api/me");
    expect(await response.json()).toEqual({ email: "test@example.com" });
  });
});
