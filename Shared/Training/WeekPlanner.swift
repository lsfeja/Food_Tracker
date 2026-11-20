import Foundation

/// Week arithmetic and week-template conversion (pure logic).
enum WeekPlanner {
    /// A session to create: day, position and content.
    struct Item: Equatable {
        var date: Date
        var order: Int
        var content: WorkoutContent
    }

    /// 0 = Monday … 6 = Sunday, independent of the locale's first weekday.
    static func weekdayIndex(of date: Date, calendar: Calendar) -> Int {
        let weekday = calendar.component(.weekday, from: date) // 1 = Sunday … 7 = Saturday
        return (weekday + 5) % 7
    }

    /// Localized weekday name for index 0 (Monday) … 6 (Sunday).
    static func weekdayName(_ index: Int, calendar: Calendar, short: Bool = false) -> String {
        let symbols = short ? calendar.shortWeekdaySymbols : calendar.weekdaySymbols // Sunday first
        guard symbols.count == 7 else { return "\(index + 1)" }
        return symbols[(index + 1) % 7]
    }

    /// The seven days (start of day) of the week starting at `weekStart`.
    static func days(ofWeekStarting weekStart: Date, calendar: Calendar) -> [Date] {
        let start = calendar.startOfDay(for: weekStart)
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    /// Monday of the week `offset` weeks away from the week containing `date`.
    static func weekStart(for date: Date, offset: Int = 0, calendar: Calendar) -> Date {
        let current = BudgetCalculator.week(containing: date, calendar: calendar).start
        return calendar.date(byAdding: .day, value: 7 * offset, to: current) ?? current
    }

    /// Turns template sessions into concrete sessions for the target week.
    ///
    /// - Parameter nextOrder: The next free position per day (start of day); new
    ///   sessions are appended after existing ones. Days not in the map start at 0.
    static func instantiate(
        _ template: [TemplateSession],
        weekStart: Date,
        nextOrder: [Date: Int] = [:],
        calendar: Calendar
    ) -> [Item] {
        let weekDays = Self.days(ofWeekStarting: weekStart, calendar: calendar)
        var next = nextOrder
        var items: [Item] = []
        let sorted = template.sorted { ($0.weekday, $0.order) < ($1.weekday, $1.order) }
        for session in sorted where weekDays.indices.contains(session.weekday) {
            let day = weekDays[session.weekday]
            let order = next[day] ?? 0
            next[day] = order + 1
            items.append(Item(date: day, order: order, content: session.content.resettingProgress()))
        }
        return items
    }

    /// Turns a week's sessions into template sessions (weekday from the date,
    /// orders renumbered per day, progress removed).
    static func templateSessions(from items: [Item], calendar: Calendar) -> [TemplateSession] {
        let sorted = items.sorted {
            (calendar.startOfDay(for: $0.date), $0.order) < (calendar.startOfDay(for: $1.date), $1.order)
        }
        var counters: [Int: Int] = [:]
        return sorted.map { item in
            let weekday = weekdayIndex(of: item.date, calendar: calendar)
            let order = counters[weekday] ?? 0
            counters[weekday] = order + 1
            return TemplateSession(weekday: weekday, order: order, content: item.content.resettingProgress())
        }
    }

    /// Order of `ids` after moving `id` in front of `target` (or to the end).
    static func reorder<ID: Hashable>(_ ids: [ID], moving id: ID, before target: ID?) -> [ID] {
        var result = ids.filter { $0 != id }
        if let target, let index = result.firstIndex(of: target) {
            result.insert(id, at: index)
        } else {
            result.append(id)
        }
        return result
    }
}
