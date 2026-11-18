import Foundation

/// An activity as delivered by a provider, before it is stored as `ActivityRecord`.
struct ImportedActivity: Equatable, Sendable {
    var externalID: String
    var name: String
    var type: String
    var startDate: Date
    var durationSeconds: Double
    /// Raw active calories reported (or estimated) by the provider.
    var activeCalories: Double
    var caloriesEstimated: Bool
    /// `false` if detail data (calories) still has to be fetched in a later sync.
    var detailsComplete: Bool
}

struct ActivityFetchResult: Sendable {
    var activities: [ImportedActivity]
    /// `true` if `activities` contains *every* activity since the requested date, so
    /// locally stored activities that are missing were deleted at the provider.
    var isComplete: Bool
}

/// A provider of workouts with active calories.
///
/// Strava is implemented by `StravaService`. Garmin can be added later by implementing
/// this protocol (`kind = .garmin`) and registering it in `AppServices`. Sync,
/// storage and budget math don't need to change.
@MainActor
protocol ActivitySource: AnyObject {
    var kind: ActivitySourceKind { get }
    var isConnected: Bool { get }

    /// All activities that started at or after `since`.
    /// - Parameter cached: Previously imported activities keyed by `externalID`, so the
    ///   source can skip expensive detail requests for activities it already knows.
    func fetchActivities(since: Date, cached: [String: ImportedActivity]) async throws -> ActivityFetchResult
}
