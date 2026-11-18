import Foundation
import SwiftData

/// Read helpers on top of a `ModelContext`, used by widgets and non-reactive code.
/// Views prefer `@Query` for automatic updates.
struct NutritionStore {
    let context: ModelContext
    var calendar: Calendar = BudgetCalculator.weekCalendar

    func entries(in interval: DateInterval) throws -> [FoodEntry] {
        let start = interval.start
        let end = interval.end
        let descriptor = FetchDescriptor<FoodEntry>(
            predicate: #Predicate<FoodEntry> { $0.timestamp >= start && $0.timestamp < end },
            sortBy: [SortDescriptor(\.timestamp, order: .reverse)]
        )
        return try context.fetch(descriptor)
    }

    func activities(in interval: DateInterval) throws -> [ActivityRecord] {
        let start = interval.start
        let end = interval.end
        let descriptor = FetchDescriptor<ActivityRecord>(
            predicate: #Predicate<ActivityRecord> { $0.startDate >= start && $0.startDate < end },
            sortBy: [SortDescriptor(\.startDate)]
        )
        return try context.fetch(descriptor)
    }

    func totalsByDay(in interval: DateInterval) throws -> [Date: DayTotals] {
        BudgetCalculator.totalsByDay(
            entries: try entries(in: interval),
            activities: try activities(in: interval),
            calendar: calendar
        )
    }

    /// Budget for the day containing `date`, loading the whole week so weekly mode works.
    func dayBudget(for date: Date, settings: UserSettings) throws -> DayBudget {
        let weekInterval = BudgetCalculator.week(containing: date, calendar: calendar)
        let totals = try totalsByDay(in: weekInterval)
        return BudgetCalculator.budget(for: date, settings: settings, totalsByDay: totals, calendar: calendar)
    }
}
