import Foundation
import SwiftData

enum SessionStatus: String, Codable, CaseIterable, Sendable {
    case planned
    case done
    case skipped
}

/// A session on a specific day in the training calendar.
///
/// The workout content is a snapshot (`detailsData`, JSON of `WorkoutDetails`), so
/// editing the template it came from never changes it. Strength sessions also hold
/// the actual sets/reps/weights performed.
@Model
final class PlannedSession {
    var id: UUID = UUID()
    /// Start of the planned day in the local calendar.
    var date: Date = Date.now
    /// Position within the day.
    var order: Int = 0
    var sportRaw: String = SportType.custom.rawValue
    var title: String = ""
    var detailsData: Data?
    var statusRaw: String = SessionStatus.planned.rawValue
    var completedAt: Date?

    /// `ActivityRecord.linkKey` of the linked activity (e.g. "strava:123").
    var linkedActivityKey: String?
    /// Linked by the user; kept even if another activity would match better.
    var isLinkManual: Bool = false
    /// The user unlinked an activity; don't auto-link this session again.
    var autoLinkSuppressed: Bool = false
    /// Marked done by an automatic activity match (reverted when unlinked).
    var completedByLink: Bool = false

    /// Workout template it was created from, if any (for future analytics).
    var templateID: UUID?
    var createdAt: Date = Date.now

    init(date: Date, order: Int, content: WorkoutContent, templateID: UUID? = nil) {
        self.date = date
        self.order = order
        self.sportRaw = content.sport.rawValue
        self.title = content.title
        self.detailsData = WorkoutCoding.encode(content.details)
        self.templateID = templateID
    }

    var sport: SportType {
        get { SportType(rawValue: sportRaw) ?? .custom }
        set { sportRaw = newValue.rawValue }
    }

    var status: SessionStatus {
        get { SessionStatus(rawValue: statusRaw) ?? .planned }
        set { statusRaw = newValue.rawValue }
    }

    var details: WorkoutDetails {
        get { WorkoutCoding.decode(WorkoutDetails.self, from: detailsData) ?? .empty(for: sport.category) }
        set { detailsData = WorkoutCoding.encode(newValue) }
    }

    var content: WorkoutContent {
        get { WorkoutContent(sport: sport, title: title, details: details) }
        set {
            sport = newValue.sport
            title = newValue.title
            details = newValue.details
        }
    }

    var displayTitle: String { content.displayTitle }
    var isDone: Bool { status == .done }

    /// Manual check/uncheck from the UI.
    func setDone(_ done: Bool, at now: Date = .now) {
        status = done ? .done : .planned
        completedAt = done ? now : nil
        completedByLink = false
    }
}

/// A reusable workout in the library ("Push Day", "Zone 2 Ride 90 min").
@Model
final class WorkoutTemplate {
    var id: UUID = UUID()
    var name: String = ""
    var sportRaw: String = SportType.custom.rawValue
    var detailsData: Data?
    var createdAt: Date = Date.now
    var updatedAt: Date = Date.now
    var lastUsedAt: Date?
    var useCount: Int = 0

    init(content: WorkoutContent) {
        self.name = content.title
        self.sportRaw = content.sport.rawValue
        self.detailsData = WorkoutCoding.encode(content.details.resettingProgress())
    }

    var sport: SportType {
        get { SportType(rawValue: sportRaw) ?? .custom }
        set { sportRaw = newValue.rawValue }
    }

    var details: WorkoutDetails {
        get { WorkoutCoding.decode(WorkoutDetails.self, from: detailsData) ?? .empty(for: sport.category) }
        set { detailsData = WorkoutCoding.encode(newValue) }
    }

    var content: WorkoutContent {
        get { WorkoutContent(sport: sport, title: name, details: details) }
        set {
            sport = newValue.sport
            name = newValue.title
            details = newValue.details.resettingProgress()
            updatedAt = .now
        }
    }

    var displayName: String { content.displayTitle }

    func markUsed(at date: Date = .now) {
        lastUsedAt = date
        useCount += 1
    }
}

/// A session inside a week template.
struct TemplateSession: Codable, Hashable, Identifiable, Sendable {
    var id = UUID()
    /// 0 = Monday … 6 = Sunday.
    var weekday: Int
    var order: Int
    var content: WorkoutContent
}

/// A named week plan ("Base Week", "Race Week") that can be loaded into any week.
@Model
final class WeekTemplate {
    var id: UUID = UUID()
    var name: String = ""
    var sessionsData: Data?
    var createdAt: Date = Date.now
    var updatedAt: Date = Date.now

    init(name: String, sessions: [TemplateSession] = []) {
        self.name = name
        self.sessionsData = WorkoutCoding.encode(sessions)
    }

    var sessions: [TemplateSession] {
        get { WorkoutCoding.decode([TemplateSession].self, from: sessionsData) ?? [] }
        set {
            sessionsData = WorkoutCoding.encode(newValue)
            updatedAt = .now
        }
    }
}
