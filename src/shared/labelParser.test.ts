import { describe, expect, it } from "vitest";
import { foundAny, numbers, parseLabel, parseLabelRows, rowsFromFragments, type TextFragment } from "./labelParser";

describe("nutrition label parser", () => {
  it("parses a German label", () => {
    const r = parseLabelRows([
      "Durchschnittliche Nährwerte pro 100 g",
      "Brennwert 1046 kJ / 250 kcal",
      "Fett 9,8 g",
      "davon gesättigte Fettsäuren 3,1 g",
      "Kohlenhydrate 30 g",
      "davon Zucker 2,0 g",
      "Eiweiß 8,5 g",
      "Salz 1,2 g",
    ]);
    expect(r).toEqual({ kcal: 250, fat: 9.8, carbs: 30, protein: 8.5, kcalFromKilojoules: false });
  });

  it("corrects Tesseract reading a trailing g as 9", () => {
    // Rows as read by Tesseract.js from a German label photo (web OCR).
    const r = parseLabelRows([
      "Nährwerte pro 100 g Portion",
      "Brennwert 1558 kJ / 372 KA kJ / 149 k«",
      "Fett 7,09 2,89",
      "davon gesättigte Fettsäuren 1,2 g 0,5g",
      "Kohlenhydrate 58,749 23,59g",
      "davon Zucker 0,79 03g",
      "Eiweiß 13,59 5,49",
      "Salz 0,02 g 0,01g",
    ]);
    expect(r).toEqual({ kcal: 372, fat: 7, carbs: 58.7, protein: 13.5, kcalFromKilojoules: true });
  });

  it("parses an English label", () => {
    const r = parseLabelRows([
      "Nutrition per 100g",
      "Energy 1569kJ/375kcal",
      "Fat 12g",
      "of which saturates 5.1g",
      "Carbohydrate 55g",
      "of which sugars 20g",
      "Fibre 3.2g",
      "Protein 7.5g",
      "Salt 0.8g",
    ]);
    expect(r).toMatchObject({ kcal: 375, fat: 12, carbs: 55, protein: 7.5 });
  });

  it("uses the per-100 g column when the portion comes first", () => {
    const r = parseLabelRows([
      "Nährwerte pro Portion (30 g) pro 100 g",
      "Energie 471 kJ / 113 kcal 1569 kJ / 375 kcal",
      "Fett 3,6 g 12 g",
      "Kohlenhydrate 16,5 g 55 g",
      "Eiweiß 2,3 g 7,5 g",
    ]);
    expect(r).toMatchObject({ kcal: 375, fat: 12, carbs: 55, protein: 7.5 });
  });

  it("handles %RI, kJ-only, combined headers, wrapped kcal, '<0,5' and OCR errors", () => {
    expect(parseLabelRows(["pro 100 g %RI*", "Energie 1046 kJ 250 kcal 13 %", "Fett 9,8 g 14 %"])).toMatchObject({ kcal: 250, fat: 9.8 });
    expect(parseLabelRows(["Brennwert 1046 kJ", "Fett 1 g"])).toMatchObject({ kcal: 250, kcalFromKilojoules: true });
    expect(parseLabelRows(["Energie (kJ/kcal) 1046/250", "Eiweiß 8 g"])).toMatchObject({ kcal: 250, protein: 8 });
    expect(parseLabelRows(["Brennwert 1.046 kJ", "250 kcal", "Fett <0,5 g"])).toMatchObject({ kcal: 250, fat: 0.5 });
    expect(parseLabelRows(["EiweiB 11 g"]).protein).toBe(11);
  });

  it("rejects implausible values and unrelated text", () => {
    expect(parseLabelRows(["Fett 980 g", "Kohlenhydrate 12 g"])).toMatchObject({ fat: null, carbs: 12 });
    expect(foundAny(parseLabelRows(["Zutaten: Weizenmehl, Wasser, Salz", "Mindestens haltbar bis 12.2025"]))).toBe(false);
  });

  it("groups OCR fragments into rows", () => {
    const f = (text: string, x: number, y: number): TextFragment => ({ text, x, y, width: 300, height: 30 });
    const fragments = [
      f("8,5 g", 600, 400),
      f("Nährwerte pro 100 g", 100, 100),
      f("Brennwert", 100, 200),
      f("1046 kJ / 250 kcal", 600, 195),
      f("Fett", 100, 250),
      f("9,8 g", 600, 248),
      f("davon gesättigte Fettsäuren", 100, 300),
      f("3,1 g", 600, 300),
      f("Kohlenhydrate", 100, 350),
      f("30 g", 600, 352),
      f("Eiweiß", 100, 400),
    ];
    const rows = rowsFromFragments(fragments);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toBe("Brennwert 1046 kJ / 250 kcal");
    expect(rows[5]).toBe("Eiweiß 8,5 g");
    expect(parseLabel(fragments)).toEqual({ kcal: 250, protein: 8.5, carbs: 30, fat: 9.8, kcalFromKilojoules: false });
  });

  it("tokenizes numbers with units", () => {
    expect(numbers("1046 kj / 250 kcal 13 % <0,5 g")).toEqual([
      { value: 1046, unit: "kj", raw: "1046" },
      { value: 250, unit: "kcal", raw: "250" },
      { value: 0.5, unit: "g", raw: "0,5" },
    ]);
  });
});
