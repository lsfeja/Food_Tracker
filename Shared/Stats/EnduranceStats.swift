import Foundation

/// Sport filter of the endurance stats (and the stats widget). "Cycling" combines
/// outdoor and indoor rides, e.g. for a yearly cycling goal.
enum StatsSportFilter: String, CaseIterable, Codable, Identifiable, Sendable {
    case all
    case cycling
    case ride
    case indoorRide
    case run
    case swim
    case other

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: "All"
        case .cycling: "Cycling"
        case .ride: "Ride"
        case .indoorRide: "Indoor"
        case .run: "Run"
        case .swim: "Swim"
        case .other: "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "figure.mixed.cardio"
        case .cycling: "bicycle"
        case .ride: StatsSport.ride.systemImage
        case .indoorRide: StatsSport.indoorRide.systemImage
        case .run: StatsSport.run.systemImage
        case .swim: StatsSport.swim.systemImage
        case .other: StatsSport.other.systemImage
        }
    }

    func matches(_ sport: StatsSport) -> Bool {
        switch self {
        case .all: true
        case .cycling: sport == .ride || sport == .indoorRide
        case .ride: sport == .ride
        case .indoorRide: sport == .indoorRide
        case .run: sport == .run
        case .swim: sport == .swim
        case .other: sport == .other
        }
    }

    /// Indoor/outdoor split is meaningful for these filters.
    var includesCycling: Bool {
        self == .all || self == .cycling || self == .ride || self == .indoorRide
    }
}

/// Totals of a set of activities.
struct EnduranceTotals: Equatable, Sendable {
    var distanceMeters: Double = 0
    var movingSeconds: Double = 0
    var elevationMeters: Double = 0
    var count = 0

    var distanceKm: Double { distanceMeters / 1000 }
    var hours: Double { movingSeconds / 3600 }

    mutating func add(_ activity: ActivitySnapshot) {
        distanceMeters += activity.distanceMeters
        movingSeconds += activity.movingSeconds
        elevationMeters += activity.elevationMeters
        count += 1
    }
}

/// Volume of one chart bucket (day, week, month or year).
struct VolumeBucket: Identifiable, Equatable, Sendable {
    var start: Date
    var totals = EnduranceTotals()
    var id: Date { start }
}

/// One point of a cumulative year-over-year line. `date` is mapped onto the
/// selected year so both years share the x axis.
struct CumulativePoint: Identifiable, Equatable, Sendable {
    var year: Int
    var date: Date
    var distanceKm: Double
    var id: String { "\(year)-\(date.timeIntervalSince1970)" }
}

struct ActivityHighlight: Equatable, Sendable {
    var name: String
    var date: Date
    var distanceKm: Double
    var hours: Double
    var elevationMeters: Double
}

struct BucketHighlight: Equatable, Sendable {
    var start: Date
    var totals: EnduranceTotals
}

struct IndoorShare: Equatable, Sendable {
    var indoorSeconds: Double
    var outdoorSeconds: Double
    var indoorCount: Int
    var outdoorCount: Int

    var indoorFraction: Double {
        let total = indoorSeconds + outdoorSeconds
        return total > 0 ? indoorSeconds / total : 0
    }
}

/// Progress toward a yearly goal, judged against the elapsed part of the year.
struct GoalProgress: Equatable, Sendable {
    enum Status: Equatable, Sendable {
        case reached
        case onTrack
        case behind
    }

    var target: Double
    var actual: Double
    /// Where you'd be today with an even pace.
    var expected: Double
    /// Year-end value at the current pace.
    var projected: Double

    var fraction: Double { target > 0 ? min(actual / target, 1) : 0 }
    var delta: Double { actual - expected }

    var status: Status {
        if actual >= target { return .reached }
        return actual >= expected ? .onTrack : .behind
    }
}

struct EnduranceReport: Equatable, Sendable {
    var totals = EnduranceTotals()
    var primary: [VolumeBucket] = []
    var primaryBucket: StatsBucket = .week
    var secondary: [VolumeBucket] = []
    var secondaryBucket: StatsBucket?
    var yearOverYear: [CumulativePoint] = []
    var longest: ActivityHighlight?
    var mostElevation: ActivityHighlight?
    var bestWeek: BucketHighlight?
    var bestMonth: BucketHighlight?
    var indoorShare: IndoorShare?
}

/// Endurance statistics from activity snapshots (pure logic).
enum EnduranceStats {
    static func report(
        activities: [ActivitySnapshot],
        filter: StatsSportFilter,
        period: StatsPeriod,
        now: Date,
        calendar: Calendar,
        earliest: Date? = nil
    ) -> EnduranceReport {
        let matching = activities.filter { filter.matches($0.sport) }
        let interval = period.interval(now: now, calendar: calendar, earliest: earliest)
        let inPeriod = matching.filter { interval.contains($0.start) && $0.start < interval.end }

        var report = EnduranceReport()
        for activity in inPeriod { report.totals.add(activity) }

        let buckets = period.buckets
        report.primaryBucket = buckets.primary
        report.primary = volume(inPeriod, bucket: buckets.primary, interval: interval, calendar: calendar)
        if let secondary = buckets.secondary {
            report.secondaryBucket = secondary
            report.secondary = volume(inPeriod, bucket: secondary, interval: interval, calendar: calendar)
        }

        if period.kind == .year {
            report.yearOverYear = yearOverYear(matching, year: period.year, now: now, calendar: calendar)
        }

        report.longest = inPeriod
            .max { ($0.distanceMeters, $0.movingSeconds) < ($1.distanceMeters, $1.movingSeconds) }
            .map(highlight)
        report.mostElevation = inPeriod
            .filter { $0.elevationMeters > 0 }
            .max { $0.elevationMeters < $1.elevationMeters }
            .map(highlight)

        if period.kind == .year || period.kind == .all {
            report.bestWeek = best(volume(inPeriod, bucket: .week, interval: interval, calendar: calendar))
            report.bestMonth = best(volume(inPeriod, bucket: .month, interval: interval, calendar: calendar))
        }

        if filter.includesCycling {
            let cycling = inPeriod.filter { $0.sport == .ride || $0.sport == .indoorRide }
            if !cycling.isEmpty {
                let indoor = cycling.filter { $0.sport == .indoorRide }
                let outdoor = cycling.filter { $0.sport == .ride }
                report.indoorShare = IndoorShare(
                    indoorSeconds: indoor.reduce(0) { $0 + $1.movingSeconds },
                    outdoorSeconds: outdoor.reduce(0) { $0 + $1.movingSeconds },
                    indoorCount: indoor.count,
                    outdoorCount: outdoor.count
                )
            }
        }
        return report
    }

    /// Totals for each bucket of `interval` (empty buckets included).
    static func volume(
        _ activities: [ActivitySnapshot],
        bucket: StatsBucket,
        interval: DateInterval,
        calendar: Calendar
    ) -> [VolumeBucket] {
        var byStart: [Date: EnduranceTotals] = [:]
        for activity in activities {
            byStart[StatsBuckets.start(of: bucket, containing: activity.start, calendar: calendar), default: EnduranceTotals()].add(activity)
        }
        return StatsBuckets.starts(of: bucket, in: interval, calendar: calendar).map {
            VolumeBucket(start: $0, totals: byStart[$0] ?? EnduranceTotals())
        }
    }

    /// Cumulative distance per day for `year` and `year - 1`, both mapped onto `year`'s
    /// dates. The current year stops today.
    static func yearOverYear(_ activities: [ActivitySnapshot], year: Int, now: Date, calendar: Calendar) -> [CumulativePoint] {
        guard let thisYearStart = calendar.date(from: DateComponents(year: year, month: 1, day: 1)) else { return [] }
        var points: [CumulativePoint] = []
        for seriesYear in [year - 1, year] {
            guard let start = calendar.date(from: DateComponents(year: seriesYear, month: 1, day: 1)),
                  let end = calendar.date(byAdding: .year, value: 1, to: start)
            else { continue }
            let days = calendar.dateComponents([.day], from: start, to: end).day ?? 365
            var perDay = [Double](repeating: 0, count: days)
            for activity in activities where activity.start >= start && activity.start < end {
                let index = calendar.dateComponents([.day], from: start, to: calendar.startOfDay(for: activity.start)).day ?? 0
                if perDay.indices.contains(index) { perDay[index] += activity.distanceMeters / 1000 }
            }
            let lastIndex: Int
            if now < start {
                continue
            } else if now < end {
                lastIndex = min(calendar.dateComponents([.day], from: start, to: calendar.startOfDay(for: now)).day ?? 0, days - 1)
            } else {
                lastIndex = days - 1
            }
            var cumulative = 0.0
            for index in 0...lastIndex {
                cumulative += perDay[index]
                // Map day N of the series year onto day N of the selected year.
                guard let date = calendar.date(byAdding: .day, value: index, to: thisYearStart) else { continue }
                points.append(CumulativePoint(year: seriesYear, date: date, distanceKm: cumulative))
            }
        }
        return points
    }

    /// Goal progress for `year` judged at `now`.
    static func goalProgress(target: Double, actual: Double, year: Int, now: Date, calendar: Calendar) -> GoalProgress {
        let fraction = elapsedFraction(ofYear: year, now: now, calendar: calendar)
        let expected = target * fraction
        let projected = fraction > 0 ? actual / fraction : 0
        return GoalProgress(target: target, actual: actual, expected: expected, projected: projected)
    }

    /// 0…1: how much of `year` has passed at `now`.
    static func elapsedFraction(ofYear year: Int, now: Date, calendar: Calendar) -> Double {
        guard let start = calendar.date(from: DateComponents(year: year, month: 1, day: 1)),
              let end = calendar.date(byAdding: .year, value: 1, to: start)
        else { return 0 }
        if now <= start { return 0 }
        if now >= end { return 1 }
        return now.timeIntervalSince(start) / end.timeIntervalSince(start)
    }

    // MARK: - Helpers

    private static func highlight(_ activity: ActivitySnapshot) -> ActivityHighlight {
        ActivityHighlight(
            name: activity.name,
            date: activity.start,
            distanceKm: activity.distanceMeters / 1000,
            hours: activity.movingSeconds / 3600,
            elevationMeters: activity.elevationMeters
        )
    }

    private static func best(_ buckets: [VolumeBucket]) -> BucketHighlight? {
        guard let top = buckets.max(by: { ($0.totals.distanceMeters, $0.totals.movingSeconds) < ($1.totals.distanceMeters, $1.totals.movingSeconds) }),
              top.totals.count > 0
        else { return nil }
        return BucketHighlight(start: top.start, totals: top.totals)
    }
}
