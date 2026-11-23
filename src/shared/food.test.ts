import { describe, expect, it } from "vitest";
import { barcodeVariants, draftFromOFF, isDraftComplete } from "./food";

describe("Open Food Facts", () => {
  it("decodes a complete product (numbers as strings too)", () => {
    const draft = draftFromOFF({
      code: "4000417025005",
      product_name: "Vollmilch Schokolade",
      brands: "Ritter Sport, Alfred Ritter",
      serving_quantity: "16.7",
      nutriments: { "energy-kcal_100g": 567, "energy-kcal_unit": "kcal", proteins_100g: 8.1, carbohydrates_100g: "52", fat_100g: 36 },
    })!;
    expect(draft).toMatchObject({
      name: "Vollmilch Schokolade",
      brand: "Ritter Sport",
      barcode: "4000417025005",
      kcal: 567,
      protein: 8.1,
      carbs: 52,
      fat: 36,
      servingGrams: 16.7,
      source: "openFoodFacts",
    });
    expect(isDraftComplete(draft)).toBe(true);
  });

  it("falls back to kilojoules and the scanned barcode", () => {
    const draft = draftFromOFF({ product_name: "Brot", nutriments: { energy_100g: 1046 } }, "123")!;
    expect(draft.kcal).toBe(250);
    expect(draft.barcode).toBe("123");
    expect(draft.protein).toBeNull();
  });

  it("flags incomplete and skips unusable products", () => {
    expect(isDraftComplete(draftFromOFF({ product_name: "Mystery", nutriments: {} })!)).toBe(false);
    expect(draftFromOFF({ product_name: "", nutriments: {} })).toBeNull();
  });

  it("matches UPC-A and EAN-13 spellings", () => {
    expect(barcodeVariants("012345678905").sort()).toEqual(["0012345678905", "012345678905"]);
    expect(barcodeVariants("0012345678905").sort()).toEqual(["0012345678905", "012345678905"]);
    expect(barcodeVariants("abc")).toEqual([]);
  });
});
