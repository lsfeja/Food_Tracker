import Foundation

/// Plain copy of a planned session for stats math.
struct PlanSessionSnapshot: Equatable, Sendable {
    var date: Date
    var sport: SportType
    var status: SessionStatus
    var plannedMinutes: Double?
    var linkedActivityKey: String?
}

struct AdherenceBucket: Identifiable, Equatable, Sendable {
    var start: Date
    var planned = 0
    var completed = 0
    var id: Date { start }
}

struct SportTime: Identifiable, Equatable, Sendable {
    var start: Date
    var sport: SportType
    var minutes: Double
    var id: String { "\(start.timeIntervalSince1970)-\(sport.rawValue)" }
}

struct SportTotal: Identifiable, Equatable, Sendable {
    var sport: SportType
    var minutes: Double
    var id: SportType { sport }
}

struct PlanReport: Equatable, Sendable {
    /// Sessions planned up to today (rest days excluded).
    var plannedToDate = 0
    var completed = 0
    var skipped = 0
    var adherence: [AdherenceBucket] = []
    var adherenceBucket: StatsBucket = .week
    var time: [SportTime] = []
    var timeBucket: StatsBucket = .week
    var totals: [SportTotal] = []

    var rate: Double? { plannedToDate > 0 ? Double(completed) / Double(plannedToDate) : nil }
    var totalMinutes: Double { totals.reduce(0) { $0 + $1.minutes } }
}

/// Plan adherence and training time (pure logic).
///
/// Training time per session: the linked activity's moving time, otherwise the planned
/// duration of a completed session. Activities without a session count too
/// ("unplanned"), so the time chart shows all training.
enum PlanStats {
    static func report(
        sessions: [PlanSessionSnapshot],
        activities: [ActivitySnapshot],
        period: StatsPeriod,
        now: Date,
        calendar: Calendar,
        earliest: Date? = nil
    ) -> PlanReport {
        let interval = period.interval(now: now, calendar: calendar, earliest: earliest)
        func inPeriod(_ date: Date) -> Bool { interval.contains(date) && date < interval.end }
        let endOfToday = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now

        var report = PlanReport()
        report.adherenceBucket = adherenceBucket(for: period.kind)
        report.timeBucket = timeBucket(for: period.kind)

        let workouts = sessions.filter { $0.sport != .rest && inPeriod($0.date) }
        var adherence: [Date: AdherenceBucket] = [:]
        for session in workouts {
            let start = StatsBuckets.start(of: report.adherenceBucket, containing: session.date, calendar: calendar)
            var bucket = adherence[start] ?? AdherenceBucket(start: start)
            bucket.planned += 1
            if session.status == .done { bucket.completed += 1 }
            adherence[start] = bucket

            if session.date < endOfToday {
                report.plannedToDate += 1
                if session.status == .done { report.completed += 1 }
                if session.status == .skipped { report.skipped += 1 }
            }
        }
        report.adherence = StatsBuckets.starts(of: report.adherenceBucket, in: interval, calendar: calendar).map {
            adherence[$0] ?? AdherenceBucket(start: $0)
        }

        // Training time.
        let activitiesByKey = Dictionary(activities.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let linkedKeys = Set(sessions.compactMap(\.linkedActivityKey))
        var minutes: [Date: [SportType: Double]] = [:]
        func add(_ value: Double, sport: SportType, date: Date) {
            guard value > 0, inPeriod(date) else { return }
            let start = StatsBuckets.start(of: report.timeBucket, containing: date, calendar: calendar)
            minutes[start, default: [:]][sport, default: 0] += value
        }
        for session in workouts where session.status == .done {
            if let key = session.linkedActivityKey, let activity = activitiesByKey[key] {
                add(activity.movingSeconds / 60, sport: session.sport, date: session.date)
            } else if let planned = session.plannedMinutes {
                add(planned, sport: session.sport, date: session.date)
            }
        }
        for activity in activities where !linkedKeys.contains(activity.id) {
            add(activity.movingSeconds / 60, sport: activity.planSport, date: activity.start)
        }

        var totals: [SportType: Double] = [:]
        for start in StatsBuckets.starts(of: report.timeBucket, in: interval, calendar: calendar) {
            for sport in SportType.allCases {
                guard let value = minutes[start]?[sport] else { continue }
                report.time.append(SportTime(start: start, sport: sport, minutes: value))
                totals[sport, default: 0] += value
            }
        }
        report.totals = SportType.allCases.compactMap { sport in
            totals[sport].map { SportTotal(sport: sport, minutes: $0) }
        }
        .sorted { $0.minutes > $1.minutes }
        return report
    }

    static func adherenceBucket(for kind: StatsPeriodKind) -> StatsBucket {
        switch kind {
        case .week: .day
        case .month: .week
        case .year, .all: .month
        }
    }

    static func timeBucket(for kind: StatsPeriodKind) -> StatsBucket {
        switch kind {
        case .week: .day
        case .month, .year: .week
        case .all: .month
        }
    }
}

extension PlanSessionSnapshot {
    init(session: PlannedSession) {
        self.init(
            date: session.date,
            sport: session.sport,
            status: session.status,
            plannedMinutes: session.details.plannedMinutes,
            linkedActivityKey: session.linkedActivityKey
        )
    }
}
