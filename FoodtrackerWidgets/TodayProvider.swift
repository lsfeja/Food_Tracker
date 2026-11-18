import Foundation
import SwiftData
import WidgetKit

struct TodayEntry: TimelineEntry {
    let date: Date
    let budget: DayBudget

    static func placeholder(date: Date = .now) -> TodayEntry {
        TodayEntry(
            date: date,
            budget: DayBudget(
                day: date,
                calories: CalorieBudget(baseTarget: 2200, activeBonus: 300, eaten: 1260),
                eaten: Nutrients(kcal: 1260, protein: 82, carbs: 140, fat: 38),
                targets: NutritionTargets(),
                weekly: nil
            )
        )
    }
}

/// Reads today's totals from the shared SwiftData store. The app reloads timelines
/// whenever entries, settings or activities change; a second entry at midnight
/// resets the widget for the new day.
struct TodayProvider: TimelineProvider {
    private static let container: ModelContainer? = try? SharedModelContainer.make()

    func placeholder(in context: Context) -> TodayEntry {
        .placeholder()
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(context.isPreview ? .placeholder() : entry(for: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let now = Date.now
        let calendar = BudgetCalculator.weekCalendar
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
            ?? now.addingTimeInterval(60 * 60)
        completion(Timeline(entries: [entry(for: now), entry(for: midnight)], policy: .atEnd))
    }

    private func entry(for date: Date) -> TodayEntry {
        let settings = UserSettings.load()
        guard let container = Self.container else {
            return TodayEntry(date: date, budget: BudgetCalculator.budget(for: date, settings: settings, totalsByDay: [:]))
        }
        let store = NutritionStore(context: ModelContext(container))
        let budget = (try? store.dayBudget(for: date, settings: settings))
            ?? BudgetCalculator.budget(for: date, settings: settings, totalsByDay: [:])
        return TodayEntry(date: date, budget: budget)
    }
}
