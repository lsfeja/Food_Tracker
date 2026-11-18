import Foundation
import Testing
@testable import Foodtracker

struct HistoryStatsTests {
    let settings = UserSettings(
        targets: NutritionTargets(kcal: 2000, protein: 150, carbs: 200, fat: 70),
        budget: BudgetSettings(weeklyModeEnabled: false, weeklyLimitKcal: 0, activeCaloriesEnabled: true, activeCaloriesPercent: 50)
    )

    @Test func daysAreOldestFirstAndIncludeBudget() {
        let totals: [Date: DayTotals] = [
            day(2025, 11, 18): DayTotals(eaten: Nutrients(kcal: 1800), activeCalories: 400),
        ]
        let stats = HistoryStats.days(endingAt: day(2025, 11, 19, hour: 15), count: 3, totals: totals, settings: settings, calendar: testCalendar)
        #expect(stats.map(\.day) == [day(2025, 11, 17), day(2025, 11, 18), day(2025, 11, 19)])
        #expect(stats[1].eaten.kcal == 1800)
        #expect(stats[1].budget == 2200) // 2,000 + 50 % of 400
        #expect(stats[0].hasData == false)
    }

    @Test func weeksSumEatenAndCountedActiveCalories() {
        let totals: [Date: DayTotals] = [
            day(2025, 11, 17): DayTotals(eaten: Nutrients(kcal: 2000), activeCalories: 600),
            day(2025, 11, 19): DayTotals(eaten: Nutrients(kcal: 1500)),
            day(2025, 11, 10): DayTotals(eaten: Nutrients(kcal: 2500)),
        ]
        let stats = HistoryStats.weeks(endingAt: day(2025, 11, 19), count: 2, totals: totals, settings: settings, calendar: testCalendar)
        #expect(stats.count == 2)
        #expect(stats[0].start == day(2025, 11, 10))
        #expect(stats[0].eatenKcal == 2500)
        #expect(stats[1].start == day(2025, 11, 17))
        #expect(stats[1].eatenKcal == 3500)
        #expect(stats[1].budget == 14300) // 14,000 + 50 % of 600
        #expect(stats[1].loggedDays == 2)
        #expect(stats[1].averagePerLoggedDay == 1750)
    }
}
