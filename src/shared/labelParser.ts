/**
 * Extracts per-100 g energy and macros from OCR text of German or English nutrition
 * tables ("Brennwert", "Fett", "Kohlenhydrate", "Eiweiß" / "Energy", "Fat",
 * "Carbohydrate", "Protein").
 *
 * - Fragments are grouped into rows by vertical position, joined left to right.
 * - The first number after a nutrient keyword is used, unless the header shows the
 *   per-portion column before the per-100 g column.
 * - Sub-rows ("davon gesättigte Fettsäuren", "of which sugars") and %RI are ignored.
 * - Values that can't be per 100 g (macros > 100 g, energy > 950 kcal) are dropped.
 */

/** Recognized text with its box (y grows downwards, like browser/Tesseract coordinates). */
export interface TextFragment {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedNutrition {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  kcalFromKilojoules: boolean;
}

export const foundAny = (parsed: ParsedNutrition) =>
  parsed.kcal !== null || parsed.protein !== null || parsed.carbs !== null || parsed.fat !== null;

/** Groups fragments into rows (top to bottom, left to right). */
export function rowsFromFragments(fragments: TextFragment[]): string[] {
  const sorted = [...fragments].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const rows: TextFragment[][] = [];
  for (const fragment of sorted) {
    const mid = fragment.y + fragment.height / 2;
    const row = rows[rows.length - 1];
    if (row) {
      const rowMid = row.reduce((sum, f) => sum + f.y + f.height / 2, 0) / row.length;
      const rowHeight = Math.max(...row.map((f) => f.height));
      if (Math.abs(mid - rowMid) < Math.max(rowHeight, fragment.height) * 0.5) {
        row.push(fragment);
        continue;
      }
    }
    rows.push([fragment]);
  }
  return rows.map((row) => [...row].sort((a, b) => a.x - b.x).map((f) => f.text).join(" "));
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

const energyPattern = "brennwert|energie|energy|kalorien|calories";
const proteinPattern = "eiwei\\w*|\\bprotein\\w*";
const carbsPattern = "kohlenhydrat\\w*|carbohydrate\\w*|\\bcarbs?\\b";
const fatPattern = "\\bfett\\b|\\bfat\\b";
const subRowMarkers = ["davon", "of which", "gesattigt", "saturate", "trans", "zucker", "sugar", "ungesattigt"];
const anyKeyword = new RegExp(
  [energyPattern, proteinPattern, carbsPattern, fatPattern, "\\bsalz\\b|\\bsalt\\b|zucker|sugar|ballaststoff|fibre|fiber"].join("|"),
);

interface NumberToken {
  value: number;
  unit: string | null;
  raw: string;
}

const numberRegex = /(?<![\d.,])(<\s*)?(\d{1,5}(?:[.,]\d{1,3})?)\s*(kcal|kj|mg|µg|mcg|g|%)?/g;

/** Numbers with optional units, in reading order. %RI values are skipped. */
export function numbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(numberRegex)) {
    const unit = match[3] ?? null;
    if (unit === "%") continue;
    const value = parseNumber(match[2], unit);
    if (value !== null) tokens.push({ value, unit, raw: match[2] });
  }
  return tokens;
}

export function parseNumber(raw: string, unit: string | null): number | null {
  let s = raw;
  // "1.046 kJ" / "1,046 kJ" are thousands, not decimals.
  if ((unit === "kj" || unit === "kcal") && /^\d{1,2}[.,]\d{3}$/.test(s)) {
    s = s.replace(/[.,]/g, "");
  }
  const value = Number(s.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function pick(values: number[], column: number): number | null {
  if (values.length === 0) return null;
  return values.length > column ? values[column] : values[0];
}

/** 0 if the per-100 g column comes first (default), 1 if a per-portion column precedes it. */
export function per100gColumn(rows: string[]): number {
  for (const row of rows) {
    const match = /(?<!\d)100\s*(g|ml)\b/.exec(row);
    if (!match) continue;
    const before = row.slice(0, match.index);
    return /portion|serving|stuck|riegel|scheibe|glas|\(\s*\d+\s*(g|ml)\s*\)/.test(before) ? 1 : 0;
  }
  return 0;
}

const plausibleKcal = (value: number) => value >= 0 && value <= 950;

export function energyKcal(rows: string[], column: number): { kcal: number | null; fromKilojoules: boolean } {
  const indices: number[] = [];
  const energy = new RegExp(energyPattern);
  rows.forEach((row, index) => {
    if (!energy.test(row)) return;
    for (let candidate = index; candidate < Math.min(index + 3, rows.length); candidate++) {
      if (!indices.includes(candidate)) indices.push(candidate);
    }
  });
  const candidates = indices.length ? indices.sort((a, b) => a - b).map((i) => rows[i]) : rows;

  // 1. "250 kcal"
  const kcalValues = candidates.flatMap(numbers).filter((t) => t.unit === "kcal").map((t) => t.value);
  const fromKcal = pick(kcalValues, column);
  if (fromKcal !== null && plausibleKcal(fromKcal)) return { kcal: fromKcal, fromKilojoules: false };

  // 2. "Energie (kJ/kcal) 1046/250": pairs with a kJ/kcal ratio of ~4.184.
  for (const row of candidates) {
    if (!row.includes("kcal") || !row.includes("kj")) continue;
    const values = numbers(row).filter((t) => t.unit === null).map((t) => t.value);
    const pairs: number[] = [];
    let index = 0;
    while (index + 1 < values.length) {
      const kj = values[index];
      const kcal = values[index + 1];
      if (kcal > 0 && kj / kcal >= 3.9 && kj / kcal <= 4.5) {
        pairs.push(kcal);
        index += 2;
      } else {
        index += 1;
      }
    }
    const value = pick(pairs, column);
    if (value !== null && plausibleKcal(value)) return { kcal: value, fromKilojoules: false };
  }

  // 3. "kcal 250" (unit before the number).
  for (const row of candidates) {
    if (row.includes("kj")) continue;
    const at = row.indexOf("kcal");
    if (at < 0) continue;
    const values = numbers(row.slice(at + 4)).filter((t) => t.unit === null).map((t) => t.value);
    const value = pick(values, column);
    if (value !== null && plausibleKcal(value)) return { kcal: value, fromKilojoules: false };
  }

  // 4. Only kJ available.
  const kjValues = candidates.flatMap(numbers).filter((t) => t.unit === "kj").map((t) => t.value);
  const kj = pick(kjValues, column);
  if (kj !== null) {
    const kcal = Math.round(kj / 4.184);
    if (plausibleKcal(kcal)) return { kcal, fromKilojoules: true };
  }
  return { kcal: null, fromKilojoules: false };
}

/** First keyword match not preceded by a sub-row marker; returns the end index. */
function mainRowMatchEnd(pattern: string, row: string): number | null {
  const regex = new RegExp(pattern, "g");
  for (const match of row.matchAll(regex)) {
    const prefix = row.slice(0, match.index);
    if (!subRowMarkers.some((marker) => prefix.includes(marker))) return (match.index ?? 0) + match[0].length;
  }
  return null;
}

/**
 * Tesseract often reads "7,0 g" as "7,09" or "7,049" (the "g" becomes "9"/"49" and the
 * space is lost). Labels print macros with at most one decimal, so a unitless
 * "x,y9" / "x,y49" is "x,y g".
 */
function macroValue(token: NumberToken): number {
  const misread = token.unit === null ? /^(\d+[.,]\d)4?9$/.exec(token.raw) : null;
  return misread ? Number(misread[1].replace(",", ".")) : token.value;
}

export function macro(pattern: string, rows: string[], column: number): number | null {
  for (let index = 0; index < rows.length; index++) {
    const end = mainRowMatchEnd(pattern, rows[index]);
    if (end === null) continue;
    let tokens = numbers(rows[index].slice(end)).filter((t) => t.unit === null || t.unit === "g");
    if (tokens.length === 0 && index + 1 < rows.length && !anyKeyword.test(rows[index + 1])) {
      tokens = numbers(rows[index + 1]).filter((t) => t.unit === null || t.unit === "g");
    }
    const value = pick(tokens.map(macroValue), column);
    if (value !== null && value <= 100) return value;
  }
  return null;
}

export function parseLabelRows(rawRows: string[]): ParsedNutrition {
  const rows = rawRows.map(normalize).filter(Boolean);
  const column = per100gColumn(rows);
  const energy = energyKcal(rows, column);
  return {
    kcal: energy.kcal,
    protein: macro(proteinPattern, rows, column),
    carbs: macro(carbsPattern, rows, column),
    fat: macro(fatPattern, rows, column),
    kcalFromKilojoules: energy.fromKilojoules,
  };
}

export function parseLabel(fragments: TextFragment[]): ParsedNutrition {
  return parseLabelRows(rowsFromFragments(fragments));
}
