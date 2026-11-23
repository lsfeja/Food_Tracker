/** Energy (kcal) and macronutrients (g); per 100 g or absolute. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const zeroNutrients = (): Nutrients => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  return { kcal: n.kcal * factor, protein: n.protein * factor, carbs: n.carbs * factor, fat: n.fat * factor };
}

/** Absolute values for `grams` of a food with per-100 g values `per100g`. */
export function forAmount(per100g: Nutrients, grams: number): Nutrients {
  return scaleNutrients(per100g, grams / 100);
}

/** Atwater factors: 4 / 4 / 9 kcal per gram. */
export function kcalFromMacros(n: Pick<Nutrients, "protein" | "carbs" | "fat">): number {
  return n.protein * 4 + n.carbs * 4 + n.fat * 9;
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(addNutrients, zeroNutrients());
}
