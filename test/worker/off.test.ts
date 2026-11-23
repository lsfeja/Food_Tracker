import { afterEach, describe, expect, it, vi } from "vitest";
import type { FoodDraft } from "../../src/shared/food";
import { api } from "./helpers";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
// Responses must be created inside the request that reads them (Workers I/O isolation).
const respond = (body: unknown, status = 200) => async () => json(body, status);

describe("Open Food Facts proxy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps a product and sends the User-Agent", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(
      respond({
        status: 1,
        product: { product_name: "Haferflocken", brands: "Kölln", nutriments: { "energy-kcal_100g": "372", proteins_100g: 13.5, carbohydrates_100g: 58.7, fat_100g: 7 } },
      }),
    );
    const call = api("off@example.com");
    const result = await call<FoodDraft>("GET", "/off/product/4000540000108");
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ name: "Haferflocken", brand: "Kölln", barcode: "4000540000108", kcal: 372, protein: 13.5, source: "openFoodFacts" });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v2/product/4000540000108");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^Foodtracker\//);
  });

  it("returns null for unknown products and 502 when unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(respond({ status: 0 }, 404));
    const call = api("off@example.com");
    expect((await call("GET", "/off/product/1111111111116")).data).toBeNull();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const failed = await call<{ error: string }>("GET", "/off/product/2222222222226");
    expect(failed.status).toBe(502);
    expect(failed.data.error).toMatch(/unreachable/);
  });

  it("filters incomplete search results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      respond({
        products: [
          { code: "1", product_name: "Skyr", nutriments: { "energy-kcal_100g": 63 } },
          { code: "2", product_name: "No energy" },
        ],
      }),
    );
    const result = await api("off@example.com")<FoodDraft[]>("GET", "/off/search?q=skyr");
    expect(result.data.map((d) => d.name)).toEqual(["Skyr"]);
  });
});
