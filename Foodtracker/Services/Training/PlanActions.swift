import Foundation
import OSLog
import SwiftData

/// All writes to the training calendar go through here: keeps day orders consistent,
/// saves, and refreshes widgets.
@MainActor
enum PlanActions {
    private static let logger = Logger(subsystem: "Foodtracker", category: "Plan")

    static var calendar: Calendar { BudgetCalculator.weekCalendar }

    /// Sessions of one day, ordered.
    static func sessions(on day: Date, in context: ModelContext) -> [PlannedSession] {
        (try? TrainingStore(context: context, calendar: calendar).sessions(on: day)) ?? []
    }

    static func nextOrder(on day: Date, in context: ModelContext) -> Int {
        (sessions(on: day, in: context).map(\.order).max() ?? -1) + 1
    }

    @discardableResult
    static func addSession(
        _ content: WorkoutContent,
        on day: Date,
        templateID: UUID? = nil,
        in context: ModelContext
    ) -> PlannedSession {
        let start = calendar.startOfDay(for: day)
        let session = PlannedSession(
            date: start,
            order: nextOrder(on: start, in: context),
            content: content,
            templateID: templateID
        )
        context.insert(session)
        commit(context, touching: [start])
        return session
    }

    /// Copy on the same day, right after the original, without progress.
    @discardableResult
    static func duplicate(_ session: PlannedSession, in context: ModelContext) -> PlannedSession {
        let day = calendar.startOfDay(for: session.date)
        for other in sessions(on: day, in: context) where other.order > session.order {
            other.order += 1
        }
        let copy = PlannedSession(
            date: day,
            order: session.order + 1,
            content: session.content.resettingProgress(),
            templateID: session.templateID
        )
        context.insert(copy)
        commit(context, touching: [day])
        return copy
    }

    static func delete(_ session: PlannedSession, in context: ModelContext) {
        let day = calendar.startOfDay(for: session.date)
        context.delete(session)
        renumber(day, in: context, excluding: session.id)
        commit(context, touching: [day])
    }

    /// Moves a session to `day`, in front of `target` (or to the end of the day).
    static func move(_ session: PlannedSession, to day: Date, before target: PlannedSession? = nil, in context: ModelContext) {
        let oldDay = calendar.startOfDay(for: session.date)
        let newDay = calendar.startOfDay(for: day)
        if target?.id == session.id { return }

        if oldDay != newDay {
            // Moving changes which activities it can match.
            if !session.isLinkManual { unlinkSilently(session) }
            session.date = newDay
        }
        // The fetch may or may not include the pending date change, so handle both.
        let others = sessions(on: newDay, in: context).filter { $0.id != session.id }
        let ids = others.map(\.id) + [session.id]
        let ordered = WeekPlanner.reorder(ids, moving: session.id, before: target?.id)
        let byID = Dictionary((others + [session]).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for (index, id) in ordered.enumerated() {
            byID[id]?.order = index
        }
        if oldDay != newDay {
            renumber(oldDay, in: context, excluding: session.id)
        }
        commit(context, touching: [oldDay, newDay])
    }

    static func toggleDone(_ session: PlannedSession, in context: ModelContext) {
        session.setDone(!session.isDone)
        commit(context, touching: [])
    }

    static func setSkipped(_ session: PlannedSession, _ skipped: Bool, in context: ModelContext) {
        session.status = skipped ? .skipped : .planned
        session.completedAt = nil
        session.completedByLink = false
        commit(context, touching: [])
    }

    /// Saves and reloads widgets. `days` are days whose sessions changed (used to
    /// re-run activity matching).
    static func commit(_ context: ModelContext, touching days: [Date]) {
        if !days.isEmpty {
            TrainingLinker.autoLink(days: days, in: context)
        }
        do {
            try context.save()
        } catch {
            logger.error("Saving plan failed: \(error.localizedDescription, privacy: .public)")
        }
        WidgetRefresher.reload()
    }

    // MARK: - Helpers

    private static func renumber(_ day: Date, in context: ModelContext, excluding id: UUID) {
        let remaining = sessions(on: day, in: context).filter { $0.id != id }
        for (index, session) in remaining.enumerated() {
            session.order = index
        }
    }

    private static func unlinkSilently(_ session: PlannedSession) {
        guard session.linkedActivityKey != nil else { return }
        session.linkedActivityKey = nil
        if session.completedByLink {
            session.status = .planned
            session.completedAt = nil
            session.completedByLink = false
        }
    }
}
