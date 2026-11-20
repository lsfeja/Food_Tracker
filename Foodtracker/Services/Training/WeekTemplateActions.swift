import Foundation
import SwiftData

/// Creating, applying and managing week templates.
@MainActor
enum WeekTemplateActions {
    enum ApplyMode: String, CaseIterable, Identifiable {
        case add
        case replace

        var id: String { rawValue }

        var title: String {
            switch self {
            case .add: "Add to Week"
            case .replace: "Replace Week"
            }
        }
    }

    static var calendar: Calendar { BudgetCalculator.weekCalendar }

    @discardableResult
    static func create(name: String, sessions: [TemplateSession] = [], in context: ModelContext) -> WeekTemplate {
        let template = WeekTemplate(name: name, sessions: sessions)
        context.insert(template)
        try? context.save()
        return template
    }

    /// Saves the sessions of a week as a new template (progress removed).
    @discardableResult
    static func saveWeek(startingAt weekStart: Date, name: String, in context: ModelContext) -> WeekTemplate {
        let sessions = weekSessions(weekStart, in: context)
        let items = sessions.map { WeekPlanner.Item(date: $0.date, order: $0.order, content: $0.content) }
        return create(name: name, sessions: WeekPlanner.templateSessions(from: items, calendar: calendar), in: context)
    }

    static func duplicate(_ template: WeekTemplate, in context: ModelContext) {
        let sessions = template.sessions.map { session -> TemplateSession in
            var copy = session
            copy.id = UUID()
            return copy
        }
        create(name: "\(template.name) Copy", sessions: sessions, in: context)
    }

    static func delete(_ template: WeekTemplate, in context: ModelContext) {
        context.delete(template)
        try? context.save()
    }

    /// Plans the template's sessions in the target week.
    ///
    /// - `.add`: appended after sessions already planned on each day.
    /// - `.replace`: sessions not yet done are removed first; completed sessions stay.
    static func apply(_ template: WeekTemplate, toWeekStarting weekStart: Date, mode: ApplyMode, in context: ModelContext) {
        let existing = weekSessions(weekStart, in: context)
        var remaining = existing
        if mode == .replace {
            for session in existing where !session.isDone {
                context.delete(session)
            }
            remaining = existing.filter(\.isDone)
        }

        var nextOrder: [Date: Int] = [:]
        for session in remaining {
            let day = calendar.startOfDay(for: session.date)
            nextOrder[day] = max(nextOrder[day] ?? 0, session.order + 1)
        }

        let items = WeekPlanner.instantiate(template.sessions, weekStart: weekStart, nextOrder: nextOrder, calendar: calendar)
        for item in items {
            context.insert(PlannedSession(date: item.date, order: item.order, content: item.content))
        }
        PlanActions.commit(context, touching: WeekPlanner.days(ofWeekStarting: weekStart, calendar: calendar))
    }

    static func weekSessions(_ weekStart: Date, in context: ModelContext) -> [PlannedSession] {
        let start = calendar.startOfDay(for: weekStart)
        let end = calendar.date(byAdding: .day, value: 7, to: start) ?? start.addingTimeInterval(7 * 86_400)
        return (try? TrainingStore(context: context, calendar: calendar).sessions(in: DateInterval(start: start, end: end))) ?? []
    }
}
