import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayInTimeZone, diffDays, weekdayIndex, weekStart } from "./days";
import * as Format from "./format";
import { forAmount, kcalFromMacros, sumNutrients } from "./nutrients";

describe("decimal parsing", () => {
  it.each([
    ["12", 12],
    ["9,8", 9.8],
    ["9.8", 9.8],
    [" 0,5 ", 0.5],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
  ])("parses %s", (input, expected) => {
    expect(Format.parseDecimal(input)).toBe(expected);
  });

  it.each(["", "abc", "1.2.3", "inf"])("rejects %s", (input) => {
    expect(Format.parseDecimal(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats durations, distances and volumes", () => {
    expect(Format.duration(45)).toBe("45 min");
    expect(Format.duration(90)).toBe("1 h 30 min");
    expect(Format.duration(60)).toBe("1 h");
    expect(Format.shortMinutes(4)).toBe("4′");
    expect(Format.shortMinutes(0.5)).toBe("30″");
    expect(Format.distance(10)).toBe("10 km");
    expect(Format.shortDistance(0.4)).toBe("400 m");
    expect(Format.kcal(1240.4)).toBe("1,240");
    expect(Format.signedKcal(-120)).toBe("−120");
    expect(Format.volume(12_400)).toBe("12.4");
    expect(Format.volumeUnit(9_999)).toBe("kg");
    expect(Format.oneDecimal(72)).toBe("72.0");
    expect(Format.signedOneDecimal(-0.34)).toBe("−0.3");
    expect(Format.signedOneDecimal(0.25)).toBe("+0.3");
    expect(Format.signedOneDecimal(-0.04)).toBe("0.0");
  });
});

describe("nutrients", () => {
  it("scales per-100 g values", () => {
    expect(forAmount({ kcal: 200, protein: 10, carbs: 20, fat: 5 }, 150)).toEqual({ kcal: 300, protein: 15, carbs: 30, fat: 7.5 });
    expect(sumNutrients([{ kcal: 100, protein: 1, carbs: 0, fat: 0 }, { kcal: 50, protein: 0, carbs: 0, fat: 2 }])).toEqual({ kcal: 150, protein: 1, carbs: 0, fat: 2 });
    expect(kcalFromMacros({ protein: 10, carbs: 20, fat: 10 })).toBe(210);
  });
});

describe("days", () => {
  it("does calendar math on local days", () => {
    expect(weekdayIndex("2025-11-17")).toBe(0);
    expect(weekdayIndex("2025-11-23")).toBe(6);
    expect(weekStart("2025-11-19")).toBe("2025-11-17");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(diffDays("2025-01-01", "2025-03-15")).toBe(73);
    expect(addMonths("2025-12-15", 1)).toBe("2026-01-01");
  });

  it("derives the local day in a time zone", () => {
    // 23:30 UTC on 1 Jan is already 2 Jan in Berlin.
    expect(dayInTimeZone(Date.UTC(2025, 0, 1, 23, 30), "Europe/Berlin")).toBe("2025-01-02");
    expect(dayInTimeZone(Date.UTC(2025, 0, 1, 23, 30), "UTC")).toBe("2025-01-01");
  });
});
