import Foundation

/// Sport buckets for endurance stats.
enum StatsSport: String, CaseIterable, Codable, Identifiable, Sendable {
    case ride
    case run
    case swim
    case indoorRide
    case other

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .ride: "Ride"
        case .run: "Run"
        case .swim: "Swim"
        case .indoorRide: "Indoor Ride"
        case .other: "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .ride: "figure.outdoor.cycle"
        case .run: "figure.run"
        case .swim: "figure.pool.swim"
        case .indoorRide: "figure.indoor.cycle"
        case .other: "figure.mixed.cardio"
        }
    }

    /// Rides on a trainer and virtual rides count as indoor rides.
    static func classify(activityType: String, isIndoor: Bool) -> StatsSport {
        switch SportType.fromActivityType(activityType) {
        case .indoorRide: .indoorRide
        case .ride: isIndoor ? .indoorRide : .ride
        case .run: .run
        case .swim: .swim
        default: .other
        }
    }
}

/// Plain, Sendable copy of an `ActivityRecord` for off-main-thread stats math.
struct ActivitySnapshot: Equatable, Sendable {
    var id: String
    var name: String
    var start: Date
    var sport: StatsSport
    var distanceMeters: Double
    var movingSeconds: Double
    var elevationMeters: Double
    var isIndoor: Bool

    init(
        id: String,
        name: String = "",
        start: Date,
        sport: StatsSport,
        distanceMeters: Double = 0,
        movingSeconds: Double = 0,
        elevationMeters: Double = 0,
        isIndoor: Bool = false
    ) {
        self.id = id
        self.name = name
        self.start = start
        self.sport = sport
        self.distanceMeters = distanceMeters
        self.movingSeconds = movingSeconds
        self.elevationMeters = elevationMeters
        self.isIndoor = isIndoor
    }

    init(record: ActivityRecord) {
        self.init(
            id: record.linkKey,
            name: record.name,
            start: record.startDate,
            sport: record.statsSport,
            distanceMeters: record.distanceMeters,
            movingSeconds: record.durationSeconds,
            elevationMeters: record.elevationMeters,
            isIndoor: record.isIndoor || record.statsSport == .indoorRide
        )
    }
}
