import Foundation
import OSLog
import SwiftData

/// Single place for writing diary entries. Saves the context and refreshes widgets.
@MainActor
enum FoodLogger {
    private static let logger = Logger(subsystem: "Foodtracker", category: "FoodLogger")

    /// Timestamp for a new entry on `day`: now for today, otherwise the current time of
    /// day on that date.
    static func timestamp(for day: Date, now: Date = .now, calendar: Calendar = .current) -> Date {
        if calendar.isDate(day, inSameDayAs: now) { return now }
        let time = calendar.dateComponents([.hour, .minute], from: now)
        return calendar.date(bySettingHour: time.hour ?? 12, minute: time.minute ?? 0, second: 0, of: day) ?? day
    }

    @discardableResult
    static func log(_ food: Food, grams: Double, source: EntrySource, day: Date, in context: ModelContext) -> FoodEntry {
        let entry = FoodEntry(
            timestamp: timestamp(for: day),
            name: food.name,
            grams: grams,
            nutrients: food.nutrients(forGrams: grams),
            source: source
        )
        context.insert(entry)
        entry.food = food
        food.markUsed(grams: grams)
        commit(context)
        return entry
    }

    /// Logs absolute values without a food (quick add).
    @discardableResult
    static func logQuick(name: String, nutrients: Nutrients, day: Date, in context: ModelContext) -> FoodEntry {
        let entry = FoodEntry(
            timestamp: timestamp(for: day),
            name: name,
            grams: nil,
            nutrients: nutrients,
            source: .manual
        )
        context.insert(entry)
        commit(context)
        return entry
    }

    static func delete(_ entry: FoodEntry, in context: ModelContext) {
        context.delete(entry)
        commit(context)
    }

    /// Saves pending changes and reloads widget timelines.
    static func commit(_ context: ModelContext) {
        do {
            try context.save()
        } catch {
            logger.error("Saving failed: \(error.localizedDescription, privacy: .public)")
        }
        WidgetRefresher.reload()
    }
}
