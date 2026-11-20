import Foundation
import SwiftData

/// An activity imported from an `ActivitySource` (Strava now, Garmin later).
///
/// Identified by `(sourceRaw, externalID)`. `activeCalories` is the raw value from
/// the provider. The share counted toward the budget is applied by `BudgetCalculator`.
@Model
final class ActivityRecord {
    var sourceRaw: String = ActivitySourceKind.strava.rawValue
    var externalID: String = ""
    var name: String = ""
    var activityType: String = ""
    var startDate: Date = Date.now
    var durationSeconds: Double = 0
    var distanceMeters: Double = 0
    var elevationMeters: Double = 0
    /// Trainer / virtual activity (e.g. Zwift).
    var isIndoor: Bool = false
    var activeCalories: Double = 0
    /// `true` if calories were estimated (e.g. derived from kilojoules) rather than
    /// reported by the provider.
    var caloriesEstimated: Bool = false
    /// `false` while the provider's detail data (with calories) hasn't been fetched yet.
    var detailsComplete: Bool = true
    var updatedAt: Date = Date.now

    init(
        source: ActivitySourceKind,
        externalID: String,
        name: String,
        activityType: String,
        startDate: Date,
        durationSeconds: Double,
        distanceMeters: Double = 0,
        elevationMeters: Double = 0,
        isIndoor: Bool = false,
        activeCalories: Double,
        caloriesEstimated: Bool,
        detailsComplete: Bool
    ) {
        self.sourceRaw = source.rawValue
        self.externalID = externalID
        self.name = name
        self.activityType = activityType
        self.startDate = startDate
        self.durationSeconds = durationSeconds
        self.distanceMeters = distanceMeters
        self.elevationMeters = elevationMeters
        self.isIndoor = isIndoor
        self.activeCalories = activeCalories
        self.caloriesEstimated = caloriesEstimated
        self.detailsComplete = detailsComplete
    }

    var source: ActivitySourceKind {
        get { ActivitySourceKind(rawValue: sourceRaw) ?? .strava }
        set { sourceRaw = newValue.rawValue }
    }

    /// Stable identifier used to link planned sessions ("strava:123456").
    var linkKey: String { "\(sourceRaw):\(externalID)" }

    /// Sport of the activity, if it maps to a planned-session sport.
    var sportType: SportType? { SportType.fromActivityType(activityType) }

    /// Sport bucket used by the Stats tab.
    var statsSport: StatsSport { StatsSport.classify(activityType: activityType, isIndoor: isIndoor) }

    /// "58 min · 10.2 km"
    var summary: String {
        var parts = [Format.duration(minutes: durationSeconds / 60)]
        if distanceMeters > 0 { parts.append(Format.distance(km: distanceMeters / 1000)) }
        return parts.joined(separator: " · ")
    }
}
