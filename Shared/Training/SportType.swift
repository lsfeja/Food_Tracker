import Foundation

/// Determines which detail payload and editor a session uses.
enum SportCategory: String, Codable, Sendable {
    case strength
    case endurance
    case other
}

/// Sport of a planned session or template.
///
/// To add a sport: add a case, give it a name/symbol/category below, and (optionally)
/// a Strava mapping and match group. Existing data is unaffected because sessions
/// store the raw value.
enum SportType: String, Codable, CaseIterable, Identifiable, Sendable {
    case strength
    case run
    case ride
    case indoorRide
    case swim
    case mobility
    case yoga
    case rest
    case custom

    /// Activities of the same group can be matched to each other (e.g. a planned
    /// indoor ride matches a Strava "Ride" or "VirtualRide").
    enum MatchGroup: Sendable {
        case running
        case cycling
        case swimming
        case strength
        case yoga
        case mobility
    }

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .strength: "Strength"
        case .run: "Run"
        case .ride: "Ride"
        case .indoorRide: "Indoor Ride"
        case .swim: "Swim"
        case .mobility: "Mobility"
        case .yoga: "Yoga"
        case .rest: "Rest Day"
        case .custom: "Custom"
        }
    }

    var systemImage: String {
        switch self {
        case .strength: "dumbbell.fill"
        case .run: "figure.run"
        case .ride: "figure.outdoor.cycle"
        case .indoorRide: "figure.indoor.cycle"
        case .swim: "figure.pool.swim"
        case .mobility: "figure.flexibility"
        case .yoga: "figure.yoga"
        case .rest: "bed.double.fill"
        case .custom: "figure.mixed.cardio"
        }
    }

    var category: SportCategory {
        switch self {
        case .strength: .strength
        case .run, .ride, .indoorRide, .swim: .endurance
        case .mobility, .yoga, .rest, .custom: .other
        }
    }

    /// `nil`: never matched automatically to imported activities.
    var matchGroup: MatchGroup? {
        switch self {
        case .strength: .strength
        case .run: .running
        case .ride, .indoorRide: .cycling
        case .swim: .swimming
        case .yoga: .yoga
        case .mobility: .mobility
        case .rest, .custom: nil
        }
    }

    /// Maps a Strava `sport_type` (or legacy `type`) to a sport.
    static func fromActivityType(_ type: String) -> SportType? {
        switch type {
        case "Run", "TrailRun", "VirtualRun": .run
        case "VirtualRide": .indoorRide
        case "Ride", "MountainBikeRide", "GravelRide", "EBikeRide", "EMountainBikeRide", "Velomobile", "Handcycle": .ride
        case "Swim": .swim
        case "WeightTraining", "Crossfit": .strength
        case "Yoga": .yoga
        case "Pilates": .mobility
        default: nil
        }
    }
}
