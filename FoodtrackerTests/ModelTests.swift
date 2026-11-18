import Foundation
import SwiftData
import Testing
@testable import Foodtracker

struct NutrientsTests {
    @Test func scalesPer100gToAmount() {
        let per100 = Nutrients(kcal: 200, protein: 10, carbs: 20, fat: 5)
        let portion = per100.forAmount(grams: 150)
        #expect(portion == Nutrients(kcal: 300, protein: 15, carbs: 30, fat: 7.5))
    }

    @Test func sumsSequences() {
        let total = [Nutrients(kcal: 100, protein: 1), Nutrients(kcal: 50, fat: 2)].sum
        #expect(total == Nutrients(kcal: 150, protein: 1, carbs: 0, fat: 2))
    }

    @Test func kcalFromMacrosUsesAtwaterFactors() {
        #expect(Nutrients(protein: 10, carbs: 20, fat: 10).kcalFromMacros == 210)
    }
}

@MainActor
struct FoodEntryTests {
    @Test func updatingGramsScalesNutrients() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = ModelContext(container)
        let entry = FoodEntry(name: "Rice", grams: 100, nutrients: Nutrients(kcal: 130, protein: 2.5, carbs: 28, fat: 0.3), source: .manual)
        context.insert(entry)
        entry.updateGrams(250)
        #expect(entry.grams == 250)
        #expect(abs(entry.kcal - 325) < 0.0001)
        #expect(abs(entry.carbs - 70) < 0.0001)
    }

    @Test func updatingGramsWithoutPreviousAmountUsesFood() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = ModelContext(container)
        let food = Food(name: "Skyr", per100g: Nutrients(kcal: 63, protein: 11, carbs: 4, fat: 0.2))
        context.insert(food)
        let entry = FoodEntry(name: "Skyr", grams: nil, nutrients: .zero, source: .manual)
        context.insert(entry)
        entry.food = food
        entry.updateGrams(200)
        #expect(entry.kcal == 126)
        #expect(entry.protein == 22)
    }

    @Test func markUsedUpdatesStatistics() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = ModelContext(container)
        let food = Food(name: "Banana", per100g: Nutrients(kcal: 89), servingGrams: 120)
        food.isHidden = true
        context.insert(food)
        food.markUsed(grams: 120)
        #expect(food.useCount == 1)
        #expect(food.lastAmountGrams == 120)
        #expect(food.lastUsedAt != nil)
        #expect(food.isHidden == false)
    }
}

struct DecimalParserTests {
    @Test(arguments: [
        ("12", 12.0),
        ("9,8", 9.8),
        ("9.8", 9.8),
        (" 0,5 ", 0.5),
        ("1.234,5", 1234.5),
        ("1,234.5", 1234.5),
    ])
    func parsesNumbers(input: String, expected: Double) {
        #expect(DecimalParser.parse(input) == expected)
    }

    @Test(arguments: ["", "abc", "1.2.3", "inf"])
    func rejectsInvalidInput(input: String) {
        #expect(DecimalParser.parse(input) == nil)
    }
}
