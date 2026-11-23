import { parseDecimal } from "./format";

export type FoodSource = "custom" | "openFoodFacts" | "label";
export type EntrySource = "manual" | "barcode" | "label" | "ai";

/** Unsaved food data (manual, Open Food Facts or label photo); per 100 g, null = unknown. */
export interface FoodDraft {
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  servingGrams: number | null;
  source: FoodSource;
}

export const emptyDraft = (overrides: Partial<FoodDraft> = {}): FoodDraft => ({
  name: "",
  brand: null,
  barcode: null,
  kcal: null,
  protein: null,
  carbs: null,
  fat: null,
  servingGrams: null,
  source: "custom",
  ...overrides,
});

export function isDraftComplete(draft: FoodDraft): boolean {
  return draft.name.trim().length > 0 && draft.kcal !== null;
}

/** Equivalent spellings of a barcode (UPC-A ↔ EAN-13 with leading zero). */
export function barcodeVariants(code: string): string[] {
  const digits = code.replace(/\D/g, "");
  if (!digits) return [];
  const variants = new Set([digits]);
  if (digits.length === 12) variants.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith("0")) variants.add(digits.slice(1));
  return [...variants];
}

// MARK: Open Food Facts (lenient: numbers may be strings)

function lossyNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return parseDecimal(value);
  return null;
}

function nonNegative(value: unknown): number | null {
  const n = lossyNumber(value);
  return n !== null && n >= 0 ? n : null;
}

export interface OFFProduct {
  code?: unknown;
  product_name?: unknown;
  product_name_de?: unknown;
  product_name_en?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  nutriments?: Record<string, unknown>;
  serving_quantity?: unknown;
}

/** Converts an Open Food Facts product to a draft; null if it has neither name nor energy. */
export function draftFromOFF(product: OFFProduct, fallbackBarcode: string | null = null): FoodDraft | null {
  const names = [product.product_name, product.product_name_de, product.product_name_en, product.generic_name]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const nutriments = product.nutriments && typeof product.nutriments === "object" ? product.nutriments : {};
  let kcal = nonNegative(nutriments["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = nonNegative(nutriments["energy-kj_100g"]) ?? nonNegative(nutriments["energy_100g"]);
    if (kj !== null) kcal = Math.round(kj / 4.184);
  }
  const name = names[0] ?? null;
  if (name === null && kcal === null) return null;
  const brand = typeof product.brands === "string" ? product.brands.split(",")[0]?.trim() || null : null;
  const code =
    typeof product.code === "string" ? product.code : typeof product.code === "number" ? String(product.code) : null;
  const serving = nonNegative(product.serving_quantity);
  return {
    name: name ?? "",
    brand,
    barcode: code ?? fallbackBarcode,
    kcal,
    protein: nonNegative(nutriments["proteins_100g"]),
    carbs: nonNegative(nutriments["carbohydrates_100g"]),
    fat: nonNegative(nutriments["fat_100g"]),
    servingGrams: serving && serving > 0 ? serving : null,
    source: "openFoodFacts",
  };
}
