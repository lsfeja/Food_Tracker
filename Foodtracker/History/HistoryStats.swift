import Foundation

/// One day in the history.
struct DayStat: Identifiable, Equatable {
    var day: Date
    var eaten: Nutrients
    /// Raw active calories.
    var activeCalories: Double
    /// Total calorie budget of that day (target/allowance + counted active).
    var budget: Double

    var id: Date { day }
    var hasData: Bool { eaten.kcal > 0 || activeCalories > 0 }
}

/// One Monday-based week in the history.
struct WeekStat: Identifiable, Equatable {
    var start: Date
    var eatenKcal: Double
    /// Weekly limit plus counted active calories.
    var budget: Double
    var loggedDays: Int

    var id: Date { start }
    var averagePerLoggedDay: Double { loggedDays > 0 ? eatenKcal / Double(loggedDays) : 0 }
}

/// Aggregations for the History screen.
enum HistoryStats {
    /// `count` days ending with (and including) the day of `today`, oldest first.
    static func days(
        endingAt today: Date,
        count: Int,
        totals: [Date: DayTotals],
        settings: UserSettings,
        calendar: Calendar = BudgetCalculator.weekCalendar
    ) -> [DayStat] {
        let end = calendar.startOfDay(for: today)
        return (0..<count).reversed().compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: -offset, to: end) else { return nil }
            let dayTotals = totals[day] ?? DayTotals()
            let budget = BudgetCalculator.budget(for: day, settings: settings, totalsByDay: totals, calendar: calendar)
            return DayStat(day: day, eaten: dayTotals.eaten, activeCalories: dayTotals.activeCalories, budget: budget.calories.total)
        }
    }

    /// `count` weeks ending with the week containing `today`, oldest first.
    static func weeks(
        endingAt today: Date,
        count: Int,
        totals: [Date: DayTotals],
        settings: UserSettings,
        calendar: Calendar = BudgetCalculator.weekCalendar
    ) -> [WeekStat] {
        let currentWeek = BudgetCalculator.week(containing: today, calendar: calendar)
        let limit = settings.budget.effectiveWeeklyLimit(dailyTarget: settings.targets.kcal)

        return (0..<count).reversed().compactMap { offset in
            guard let start = calendar.date(byAdding: .day, value: -7 * offset, to: currentWeek.start) else { return nil }
            var eaten = 0.0
            var active = 0.0
            var logged = 0
            for dayOffset in 0..<7 {
                guard let day = calendar.date(byAdding: .day, value: dayOffset, to: start) else { continue }
                let dayTotals = totals[calendar.startOfDay(for: day)] ?? DayTotals()
                eaten += dayTotals.eaten.kcal
                active += BudgetCalculator.countedActiveCalories(dayTotals.activeCalories, settings: settings.budget)
                if dayTotals.eaten.kcal > 0 { logged += 1 }
            }
            return WeekStat(start: start, eatenKcal: eaten, budget: limit + active, loggedDays: logged)
        }
    }
}
