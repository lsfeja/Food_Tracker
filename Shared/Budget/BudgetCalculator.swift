import Foundation

/// Raw totals for one calendar day.
struct DayTotals: Equatable, Sendable {
    var eaten: Nutrients = .zero
    /// Active calories as reported by activity sources (before the counted percentage).
    var activeCalories: Double = 0
}

/// Calorie budget for one day.
struct CalorieBudget: Equatable, Sendable {
    /// Daily target, or in weekly mode the allowance derived from the weekly limit.
    var baseTarget: Double
    /// Active calories counted toward the budget (after percentage).
    var activeBonus: Double
    var eaten: Double

    var total: Double { baseTarget + activeBonus }
    var remaining: Double { total - eaten }
    var isOver: Bool { remaining < 0 }

    /// Eaten share of the total budget, 0…∞ (values above 1 mean over budget).
    var progress: Double {
        guard total > 0 else { return eaten > 0 ? 1 : 0 }
        return eaten / total
    }
}

/// Rolling weekly balance (weekly budget mode).
struct WeeklyBalance: Equatable, Sendable {
    var interval: DateInterval
    var limit: Double
    /// Counted active calories of the week up to and including the reference day.
    var activeBonus: Double
    /// Calories eaten in the week up to and including the reference day.
    var eaten: Double
    /// Days left in the week, including the reference day.
    var daysRemaining: Int

    var total: Double { limit + activeBonus }
    var remaining: Double { total - eaten }
}

/// Everything the dashboard and widgets need for one day.
struct DayBudget: Equatable, Sendable {
    var day: Date
    var calories: CalorieBudget
    var eaten: Nutrients
    var targets: NutritionTargets
    var weekly: WeeklyBalance?

    var remainingKcal: Double { calories.remaining }
}

/// Pure budget math. See CLAUDE.md › "Budget rules".
enum BudgetCalculator {
    /// Gregorian calendar with weeks starting on Monday, in the current time zone.
    static var weekCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = .current
        calendar.timeZone = .current
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4
        return calendar
    }

    /// Share of raw active calories that is added to the budget.
    static func countedActiveCalories(_ raw: Double, settings: BudgetSettings) -> Double {
        guard settings.activeCaloriesEnabled, raw > 0 else { return 0 }
        let percent = min(max(settings.activeCaloriesPercent, 50), 100)
        return (raw * percent / 100).rounded()
    }

    /// The Monday-based week containing `date`.
    static func week(containing date: Date, calendar: Calendar = BudgetCalculator.weekCalendar) -> DateInterval {
        if let interval = calendar.dateInterval(of: .weekOfYear, for: date) {
            return interval
        }
        let start = calendar.startOfDay(for: date)
        return DateInterval(start: start, duration: 7 * 24 * 60 * 60)
    }

    /// Computes the budget for the day containing `date`.
    ///
    /// - Parameter totalsByDay: Totals keyed by start of day (in `calendar`). In weekly
    ///   mode it must cover the week of `date` up to that day. Missing days count as 0.
    static func budget(
        for date: Date,
        settings: UserSettings,
        totalsByDay: [Date: DayTotals],
        calendar: Calendar = BudgetCalculator.weekCalendar
    ) -> DayBudget {
        let day = calendar.startOfDay(for: date)
        let totals = totalsByDay[day] ?? DayTotals()
        let activeToday = countedActiveCalories(totals.activeCalories, settings: settings.budget)
        let targets = settings.targets

        guard settings.budget.weeklyModeEnabled else {
            return DayBudget(
                day: day,
                calories: CalorieBudget(baseTarget: targets.kcal, activeBonus: activeToday, eaten: totals.eaten.kcal),
                eaten: totals.eaten,
                targets: targets,
                weekly: nil
            )
        }

        let weekInterval = Self.week(containing: day, calendar: calendar)
        var previousEaten = 0.0
        var previousActive = 0.0
        var elapsedDays = 0
        var cursor = calendar.startOfDay(for: weekInterval.start)
        while cursor < day, elapsedDays < 7 {
            let previous = totalsByDay[cursor] ?? DayTotals()
            previousEaten += previous.eaten.kcal
            previousActive += countedActiveCalories(previous.activeCalories, settings: settings.budget)
            elapsedDays += 1
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }

        let daysRemaining = max(7 - elapsedDays, 1)
        let limit = settings.budget.effectiveWeeklyLimit(dailyTarget: targets.kcal)
        let allowance = max((limit + previousActive - previousEaten) / Double(daysRemaining), 0).rounded()

        return DayBudget(
            day: day,
            calories: CalorieBudget(baseTarget: allowance, activeBonus: activeToday, eaten: totals.eaten.kcal),
            eaten: totals.eaten,
            targets: targets,
            weekly: WeeklyBalance(
                interval: weekInterval,
                limit: limit,
                activeBonus: previousActive + activeToday,
                eaten: previousEaten + totals.eaten.kcal,
                daysRemaining: daysRemaining
            )
        )
    }

    /// Groups entries and activities into per-day totals keyed by start of day.
    static func totalsByDay(
        entries: [FoodEntry],
        activities: [ActivityRecord],
        calendar: Calendar = BudgetCalculator.weekCalendar
    ) -> [Date: DayTotals] {
        var result: [Date: DayTotals] = [:]
        for entry in entries {
            result[calendar.startOfDay(for: entry.timestamp), default: DayTotals()].eaten += entry.nutrients
        }
        for activity in activities {
            result[calendar.startOfDay(for: activity.startDate), default: DayTotals()].activeCalories += activity.activeCalories
        }
        return result
    }
}
