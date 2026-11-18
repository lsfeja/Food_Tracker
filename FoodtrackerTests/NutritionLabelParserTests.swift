import Foundation
import Testing
@testable import Foodtracker

struct NutritionLabelParserTests {
    @Test func parsesGermanLabel() {
        let rows = [
            "Durchschnittliche Nährwerte pro 100 g",
            "Brennwert 1046 kJ / 250 kcal",
            "Fett 9,8 g",
            "davon gesättigte Fettsäuren 3,1 g",
            "Kohlenhydrate 30 g",
            "davon Zucker 2,0 g",
            "Eiweiß 8,5 g",
            "Salz 1,2 g",
        ]
        let result = NutritionLabelParser.parse(rows: rows)
        #expect(result.kcal == 250)
        #expect(result.fat == 9.8)
        #expect(result.carbs == 30)
        #expect(result.protein == 8.5)
        #expect(result.kcalFromKilojoules == false)
    }

    @Test func parsesEnglishLabel() {
        let rows = [
            "Nutrition per 100g",
            "Energy 1569kJ/375kcal",
            "Fat 12g",
            "of which saturates 5.1g",
            "Carbohydrate 55g",
            "of which sugars 20g",
            "Fibre 3.2g",
            "Protein 7.5g",
            "Salt 0.8g",
        ]
        let result = NutritionLabelParser.parse(rows: rows)
        #expect(result.kcal == 375)
        #expect(result.fat == 12)
        #expect(result.carbs == 55)
        #expect(result.protein == 7.5)
    }

    @Test func usesPer100gColumnWhenPortionComesFirst() {
        let rows = [
            "Nährwerte pro Portion (30 g) pro 100 g",
            "Energie 471 kJ / 113 kcal 1569 kJ / 375 kcal",
            "Fett 3,6 g 12 g",
            "Kohlenhydrate 16,5 g 55 g",
            "Eiweiß 2,3 g 7,5 g",
        ]
        let result = NutritionLabelParser.parse(rows: rows)
        #expect(result.kcal == 375)
        #expect(result.fat == 12)
        #expect(result.carbs == 55)
        #expect(result.protein == 7.5)
    }

    @Test func ignoresReferenceIntakePercentages() {
        let rows = [
            "pro 100 g %RI*",
            "Energie 1046 kJ 250 kcal 13 %",
            "Fett 9,8 g 14 %",
        ]
        let result = NutritionLabelParser.parse(rows: rows)
        #expect(result.kcal == 250)
        #expect(result.fat == 9.8)
    }

    @Test func convertsKilojoulesWhenKcalMissing() {
        let result = NutritionLabelParser.parse(rows: ["Brennwert 1046 kJ", "Fett 1 g"])
        #expect(result.kcal == 250)
        #expect(result.kcalFromKilojoules)
    }

    @Test func handlesCombinedKjKcalHeader() {
        let result = NutritionLabelParser.parse(rows: ["Energie (kJ/kcal) 1046/250", "Eiweiß 8 g"])
        #expect(result.kcal == 250)
        #expect(result.protein == 8)
    }

    @Test func handlesKcalOnFollowingRow() {
        let result = NutritionLabelParser.parse(rows: ["Brennwert 1.046 kJ", "250 kcal", "Fett <0,5 g"])
        #expect(result.kcal == 250)
        #expect(result.fat == 0.5)
    }

    @Test func toleratesCommonOCRErrorsInEiweiss() {
        let result = NutritionLabelParser.parse(rows: ["EiweiB 11 g"])
        #expect(result.protein == 11)
    }

    @Test func rejectsImplausibleValues() {
        let result = NutritionLabelParser.parse(rows: ["Fett 980 g", "Kohlenhydrate 12 g"])
        #expect(result.fat == nil)
        #expect(result.carbs == 12)
    }

    @Test func returnsNothingForUnrelatedText() {
        let result = NutritionLabelParser.parse(rows: ["Zutaten: Weizenmehl, Wasser, Salz", "Mindestens haltbar bis 12.2025"])
        #expect(result.foundAny == false)
    }

    @Test func groupsFragmentsIntoRows() {
        func fragment(_ text: String, x: Double, y: Double) -> TextFragment {
            TextFragment(text: text, minX: x, minY: y, width: 0.3, height: 0.03)
        }
        let fragments = [
            fragment("8,5 g", x: 0.6, y: 0.600),
            fragment("Nährwerte pro 100 g", x: 0.1, y: 0.900),
            fragment("Brennwert", x: 0.1, y: 0.800),
            fragment("1046 kJ / 250 kcal", x: 0.6, y: 0.805),
            fragment("Fett", x: 0.1, y: 0.750),
            fragment("9,8 g", x: 0.6, y: 0.752),
            fragment("davon gesättigte Fettsäuren", x: 0.1, y: 0.700),
            fragment("3,1 g", x: 0.6, y: 0.700),
            fragment("Kohlenhydrate", x: 0.1, y: 0.650),
            fragment("30 g", x: 0.6, y: 0.648),
            fragment("Eiweiß", x: 0.1, y: 0.600),
        ]
        let rows = NutritionLabelParser.rows(from: fragments)
        #expect(rows.count == 6)
        #expect(rows[1] == "Brennwert 1046 kJ / 250 kcal")
        #expect(rows[5] == "Eiweiß 8,5 g")

        let result = NutritionLabelParser.parse(fragments: fragments)
        #expect(result == ParsedNutrition(kcal: 250, protein: 8.5, carbs: 30, fat: 9.8))
    }

    @Test func parsesNumbersWithUnits() {
        let tokens = NutritionLabelParser.numbers(in: "1046 kj / 250 kcal 13 % <0,5 g")
        #expect(tokens == [
            .init(value: 1046, unit: "kj"),
            .init(value: 250, unit: "kcal"),
            .init(value: 0.5, unit: "g"),
        ])
    }
}
