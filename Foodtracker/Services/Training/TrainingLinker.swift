import Foundation
import SwiftData

/// Applies `ActivityMatcher` to stored sessions and activities, and handles manual
/// link/unlink. Linking marks a session done; unlinking reverts that.
@MainActor
enum TrainingLinker {
    static var calendar: Calendar { BudgetCalculator.weekCalendar }

    /// Re-runs automatic matching for `days` (default: the activity sync window up to
    /// today). Does not save. Returns `true` if anything changed.
    @discardableResult
    static func autoLink(days: [Date]? = nil, in context: ModelContext) -> Bool {
        let targetDays = Set((days ?? defaultDays()).map { calendar.startOfDay(for: $0) })
        guard let first = targetDays.min(), let last = targetDays.max(),
              let end = calendar.date(byAdding: .day, value: 1, to: last)
        else { return false }

        let interval = DateInterval(start: first, end: end)
        let sessions = (try? TrainingStore(context: context, calendar: calendar).sessions(in: interval)) ?? []
        guard !sessions.isEmpty else { return false }
        let activities = fetchActivities(in: interval, context: context)

        let sessionsByDay = Dictionary(grouping: sessions) { calendar.startOfDay(for: $0.date) }
        let activitiesByDay = Dictionary(grouping: activities) { calendar.startOfDay(for: $0.startDate) }

        var changed = false
        for day in targetDays {
            guard let daySessions = sessionsByDay[day] else { continue }
            let dayActivities = activitiesByDay[day] ?? []
            let result = ActivityMatcher.match(
                sessions: daySessions.map {
                    ActivityMatcher.Session(
                        id: $0.id,
                        sport: $0.sport,
                        order: $0.order,
                        linkedKey: $0.linkedActivityKey,
                        autoLinkSuppressed: $0.autoLinkSuppressed,
                        isSkipped: $0.status == .skipped
                    )
                },
                activities: dayActivities.map {
                    ActivityMatcher.Activity(key: $0.linkKey, sport: $0.sportType, start: $0.startDate)
                }
            )
            guard !result.isEmpty else { continue }
            changed = true
            for session in daySessions {
                if result.unlinks.contains(session.id) {
                    clearLink(session)
                }
                if let key = result.links[session.id] {
                    session.linkedActivityKey = key
                    session.isLinkManual = false
                    markDoneByLink(session, at: dayActivities.first { $0.linkKey == key }?.startDate)
                }
            }
        }
        return changed
    }

    /// Manual link (from the session or the unplanned activity).
    static func link(_ session: PlannedSession, to activity: ActivityRecord, in context: ModelContext) {
        let key = activity.linkKey
        let day = calendar.startOfDay(for: activity.startDate)
        // An activity belongs to one session.
        for other in PlanActions.sessions(on: day, in: context) where other.id != session.id && other.linkedActivityKey == key {
            clearLink(other)
            other.autoLinkSuppressed = true
        }
        session.linkedActivityKey = key
        session.isLinkManual = true
        session.autoLinkSuppressed = false
        markDoneByLink(session, at: activity.startDate)
        PlanActions.commit(context, touching: [])
    }

    /// Manual unlink: the session won't be matched automatically again.
    static func unlink(_ session: PlannedSession, in context: ModelContext) {
        clearLink(session)
        session.autoLinkSuppressed = true
        PlanActions.commit(context, touching: [])
    }

    /// Creates a completed session for an unplanned activity and links it.
    @discardableResult
    static func createSession(from activity: ActivityRecord, in context: ModelContext) -> PlannedSession {
        let sport = activity.sportType ?? .custom
        var content = WorkoutContent(sport: sport, title: activity.name)
        let minutes = (activity.durationSeconds / 60).rounded()
        switch sport.category {
        case .endurance:
            content.details = .endurance(EnduranceWorkout(
                durationMinutes: minutes,
                distanceKm: activity.distanceMeters > 0 ? (activity.distanceMeters / 100).rounded() / 10 : nil
            ))
        case .other:
            content.details = .general(GeneralWorkout(durationMinutes: minutes))
        case .strength:
            break
        }
        let session = PlanActions.addSession(content, on: activity.startDate, in: context)
        link(session, to: activity, in: context)
        return session
    }

    // MARK: - Helpers

    private static func defaultDays(now: Date = .now) -> [Date] {
        var days: [Date] = []
        var day = calendar.startOfDay(for: ActivitySyncService.syncStartDate(now: now))
        let today = calendar.startOfDay(for: now)
        while day <= today {
            days.append(day)
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }
        return days
    }

    private static func fetchActivities(in interval: DateInterval, context: ModelContext) -> [ActivityRecord] {
        let start = interval.start
        let end = interval.end
        let descriptor = FetchDescriptor<ActivityRecord>(
            predicate: #Predicate<ActivityRecord> { $0.startDate >= start && $0.startDate < end }
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    private static func markDoneByLink(_ session: PlannedSession, at date: Date?) {
        guard session.status == .planned else { return }
        session.status = .done
        session.completedAt = date ?? .now
        session.completedByLink = true
    }

    private static func clearLink(_ session: PlannedSession) {
        session.linkedActivityKey = nil
        session.isLinkManual = false
        if session.completedByLink {
            session.status = .planned
            session.completedAt = nil
            session.completedByLink = false
        }
    }
}
