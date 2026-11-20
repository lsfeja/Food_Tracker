import Foundation

/// Matches imported activities to planned sessions of the same day (pure logic).
///
/// Rules:
/// - A session keeps its link while the activity still exists on that day.
///   Links to activities that disappeared are removed.
/// - Unlinked sessions (not skipped, auto-link not suppressed) are matched in their
///   day order to the earliest unused activity of the same `SportType.MatchGroup`.
/// - Each activity links to at most one session.
enum ActivityMatcher {
    struct Session: Equatable {
        var id: UUID
        var sport: SportType
        var order: Int
        var linkedKey: String?
        var autoLinkSuppressed = false
        var isSkipped = false
    }

    struct Activity: Equatable {
        var key: String
        var sport: SportType?
        var start: Date
    }

    struct Result: Equatable {
        /// New links: session → activity key.
        var links: [UUID: String] = [:]
        /// Sessions whose link must be removed.
        var unlinks: Set<UUID> = []

        var isEmpty: Bool { links.isEmpty && unlinks.isEmpty }
    }

    /// - Parameters: sessions and activities of **one** day.
    static func match(sessions: [Session], activities: [Activity]) -> Result {
        var result = Result()
        let available = Set(activities.map(\.key))
        var taken = Set<String>()
        var open: [Session] = []

        for session in sessions.sorted(by: { $0.order < $1.order }) {
            if let key = session.linkedKey {
                if available.contains(key), !taken.contains(key) {
                    taken.insert(key)
                    continue
                }
                result.unlinks.insert(session.id)
            }
            if !session.autoLinkSuppressed, !session.isSkipped {
                open.append(session)
            }
        }

        let candidates = activities.sorted { $0.start < $1.start }
        for session in open {
            guard let group = session.sport.matchGroup else { continue }
            guard let activity = candidates.first(where: { !taken.contains($0.key) && $0.sport?.matchGroup == group }) else {
                continue
            }
            result.links[session.id] = activity.key
            result.unlinks.remove(session.id)
            taken.insert(activity.key)
        }
        return result
    }

    /// Activities not linked to any session ("unplanned").
    static func unplanned(_ activities: [Activity], linkedKeys: Set<String>) -> [Activity] {
        activities
            .filter { !linkedKeys.contains($0.key) }
            .sorted { $0.start < $1.start }
    }
}
