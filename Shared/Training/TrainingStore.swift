import Foundation
import SwiftData

/// Read helpers for planned sessions (used by widgets and non-reactive code).
struct TrainingStore {
    let context: ModelContext
    var calendar: Calendar = BudgetCalculator.weekCalendar

    func sessions(in interval: DateInterval) throws -> [PlannedSession] {
        let start = interval.start
        let end = interval.end
        let descriptor = FetchDescriptor<PlannedSession>(
            predicate: #Predicate<PlannedSession> { $0.date >= start && $0.date < end },
            sortBy: [SortDescriptor(\.date), SortDescriptor(\.order)]
        )
        return try context.fetch(descriptor)
    }

    func sessions(on day: Date) throws -> [PlannedSession] {
        let start = calendar.startOfDay(for: day)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        return try sessions(in: DateInterval(start: start, end: end))
    }

    func session(id: UUID) throws -> PlannedSession? {
        var descriptor = FetchDescriptor<PlannedSession>(predicate: #Predicate<PlannedSession> { $0.id == id })
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }
}
