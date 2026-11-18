import Foundation
import SwiftData
import Testing
@testable import Foodtracker

struct BudgetCalculatorTests {
    // 2025-11-17 is a Monday.
    let monday = day(2025, 11, 17)
    let wednesday = day(2025, 11, 19)

    private func settings(
        kcal: Double = 2000,
        weekly: Bool = false,
        weeklyLimit: Double = 0,
        activeEnabled: Bool = true,
        percent: Double = 100
    ) -> UserSettings {
        UserSettings(
            targets: NutritionTargets(kcal: kcal, protein: 150, carbs: 200, fat: 70),
            budget: BudgetSettings(
                weeklyModeEnabled: weekly,
                weeklyLimitKcal: weeklyLimit,
                activeCaloriesEnabled: activeEnabled,
                activeCaloriesPercent: percent
            )
        )
    }

    @Test func dailyRemainingIncludesActiveCalories() {
        let totals = [monday: DayTotals(eaten: Nutrients(kcal: 500), activeCalories: 300)]
        let budget = BudgetCalculator.budget(for: monday, settings: settings(), totalsByDay: totals, calendar: testCalendar)
        #expect(budget.calories.baseTarget == 2000)
        #expect(budget.calories.activeBonus == 300)
        #expect(budget.calories.remaining == 1800)
        #expect(budget.weekly == nil)
    }

    @Test func activePercentageIsApplied() {
        let totals = [monday: DayTotals(eaten: .zero, activeCalories: 300)]
        let budget = BudgetCalculator.budget(for: monday, settings: settings(percent: 50), totalsByDay: totals, calendar: testCalendar)
        #expect(budget.calories.activeBonus == 150)
    }

    @Test func activePercentageIsClampedTo50Through100() {
        let budgetSettings = BudgetSettings(activeCaloriesEnabled: true, activeCaloriesPercent: 20)
        #expect(BudgetCalculator.countedActiveCalories(400, settings: budgetSettings) == 200)
        let high = BudgetSettings(activeCaloriesEnabled: true, activeCaloriesPercent: 150)
        #expect(BudgetCalculator.countedActiveCalories(400, settings: high) == 400)
    }

    @Test func disabledActiveCaloriesCountZero() {
        let totals = [monday: DayTotals(eaten: .zero, activeCalories: 300)]
        let budget = BudgetCalculator.budget(for: monday, settings: settings(activeEnabled: false), totalsByDay: totals, calendar: testCalendar)
        #expect(budget.calories.activeBonus == 0)
        #expect(budget.calories.remaining == 2000)
    }

    @Test func weekStartsOnMonday() {
        let week = BudgetCalculator.week(containing: wednesday, calendar: testCalendar)
        #expect(week.start == monday)
        #expect(week.duration == 7 * 24 * 60 * 60)
    }

    @Test func weeklyModeOnMondaySplitsLimitEvenly() {
        let budget = BudgetCalculator.budget(for: monday, settings: settings(weekly: true), totalsByDay: [:], calendar: testCalendar)
        #expect(budget.calories.baseTarget == 2000) // 14,000 / 7
        #expect(budget.weekly?.limit == 14000)
        #expect(budget.weekly?.daysRemaining == 7)
    }

    @Test func weeklyModeCarriesOverPreviousDays() {
        let tuesday = day(2025, 11, 18)
        let totals: [Date: DayTotals] = [
            monday: DayTotals(eaten: Nutrients(kcal: 2500)),
            tuesday: DayTotals(eaten: Nutrients(kcal: 1500)),
            wednesday: DayTotals(eaten: Nutrients(kcal: 600)),
        ]
        let budget = BudgetCalculator.budget(for: wednesday, settings: settings(weekly: true), totalsByDay: totals, calendar: testCalendar)
        // (14,000 − 4,000) / 5 days left = 2,000
        #expect(budget.calories.baseTarget == 2000)
        #expect(budget.calories.remaining == 1400)
        #expect(budget.weekly?.daysRemaining == 5)
        #expect(budget.weekly?.eaten == 4600)
        #expect(budget.weekly?.remaining == 9400)
    }

    @Test func weeklyModeCountsPreviousActiveCalories() {
        let totals: [Date: DayTotals] = [
            monday: DayTotals(eaten: Nutrients(kcal: 2000), activeCalories: 600),
        ]
        let tuesday = day(2025, 11, 18)
        let budget = BudgetCalculator.budget(for: tuesday, settings: settings(weekly: true, percent: 50), totalsByDay: totals, calendar: testCalendar)
        // (14,000 + 300 − 2,000) / 6 = 2,050
        #expect(budget.calories.baseTarget == 2050)
        #expect(budget.weekly?.activeBonus == 300)
    }

    @Test func weeklyModeUsesCustomLimit() {
        let budget = BudgetCalculator.budget(for: monday, settings: settings(weekly: true, weeklyLimit: 12600), totalsByDay: [:], calendar: testCalendar)
        #expect(budget.calories.baseTarget == 1800)
    }

    @Test func weeklyAllowanceNeverNegative() {
        let totals = [monday: DayTotals(eaten: Nutrients(kcal: 20000))]
        let tuesday = day(2025, 11, 18)
        let budget = BudgetCalculator.budget(for: tuesday, settings: settings(weekly: true), totalsByDay: totals, calendar: testCalendar)
        #expect(budget.calories.baseTarget == 0)
        #expect((budget.weekly?.remaining ?? 0) < 0)
    }

    @Test func totalsAreGroupedByDay() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = ModelContext(container)
        let morning = FoodEntry(timestamp: day(2025, 11, 17, hour: 8), name: "Oats", grams: 80, nutrients: Nutrients(kcal: 300, protein: 10), source: .manual)
        let evening = FoodEntry(timestamp: day(2025, 11, 17, hour: 19), name: "Pasta", grams: 200, nutrients: Nutrients(kcal: 700, protein: 25), source: .manual)
        let nextDay = FoodEntry(timestamp: day(2025, 11, 18, hour: 9), name: "Egg", grams: 60, nutrients: Nutrients(kcal: 90), source: .manual)
        let ride = ActivityRecord(source: .strava, externalID: "1", name: "Ride", activityType: "Ride", startDate: day(2025, 11, 17, hour: 17), durationSeconds: 3600, activeCalories: 650, caloriesEstimated: false, detailsComplete: true)
        for entry in [morning, evening, nextDay] {
            context.insert(entry)
        }
        context.insert(ride)

        let totals = BudgetCalculator.totalsByDay(entries: [morning, evening, nextDay], activities: [ride], calendar: testCalendar)
        #expect(totals[monday]?.eaten.kcal == 1000)
        #expect(totals[monday]?.eaten.protein == 35)
        #expect(totals[monday]?.activeCalories == 650)
        #expect(totals[day(2025, 11, 18)]?.eaten.kcal == 90)
    }
}
