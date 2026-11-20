import Foundation

/// Plain copy of a strength session for stats math.
struct StrengthSessionSnapshot: Equatable, Sendable {
    var id: UUID
    var date: Date
    var isDone: Bool
    var workout: StrengthWorkout

    /// Sessions count when they're done or at least one set was ticked off.
    var counts: Bool { isDone || workout.doneSetCount > 0 }
}

/// A ticked-off set with the values actually performed.
struct PerformedSet: Equatable, Sendable {
    var reps: Int
    /// kg; `nil` = bodyweight.
    var weight: Double?

    var volume: Double { Double(reps) * (weight ?? 0) }
    var estimatedOneRepMax: Double? { weight.map { StrengthStats.oneRepMax(weight: $0, reps: reps) } }

    /// "8 × 80 kg", "12 reps"
    var label: String {
        if let weight { return "\(reps) × \(Format.weight(weight)) kg" }
        return "\(reps) reps"
    }
}

struct DatedValue: Equatable, Sendable {
    var value: Double
    var date: Date
}

/// One exercise within one session.
struct ExerciseSessionStat: Identifiable, Equatable, Sendable {
    var sessionID: UUID
    var date: Date
    var sets: [PerformedSet]

    var id: UUID { sessionID }
    var maxWeight: Double? { sets.compactMap(\.weight).max() }
    var bestOneRepMax: Double? { sets.compactMap(\.estimatedOneRepMax).max() }
    var volume: Double { sets.reduce(0) { $0 + $1.volume } }
    var bestSet: PerformedSet? {
        sets.max { ($0.estimatedOneRepMax ?? Double($0.reps)) < ($1.estimatedOneRepMax ?? Double($1.reps)) }
    }
}

/// All-time summary of one exercise (matched by normalized name).
struct ExerciseSummary: Identifiable, Equatable, Sendable {
    var key: String
    var name: String
    /// Oldest first.
    var history: [ExerciseSessionStat]

    var id: String { key }
    var lastDate: Date? { history.last?.date }
    var setCount: Int { history.reduce(0) { $0 + $1.sets.count } }
    var totalVolume: Double { history.reduce(0) { $0 + $1.volume } }

    var maxWeight: DatedValue? {
        history.compactMap { stat in stat.maxWeight.map { DatedValue(value: $0, date: stat.date) } }
            .max { ($0.value, $1.date) < ($1.value, $0.date) } // ties: earliest date
    }

    var bestOneRepMax: DatedValue? {
        history.compactMap { stat in stat.bestOneRepMax.map { DatedValue(value: $0, date: stat.date) } }
            .max { ($0.value, $1.date) < ($1.value, $0.date) }
    }

    var bestSet: (set: PerformedSet, date: Date)? {
        let candidates = history.compactMap { stat in stat.bestSet.map { (set: $0, date: stat.date) } }
        return candidates.max { ($0.set.estimatedOneRepMax ?? 0) < ($1.set.estimatedOneRepMax ?? 0) }
    }

    func volume(in interval: DateInterval) -> Double {
        history.filter { interval.contains($0.date) && $0.date < interval.end }.reduce(0) { $0 + $1.volume }
    }
}

struct PersonalRecord: Identifiable, Equatable, Sendable {
    enum Kind: String, Sendable {
        case maxWeight
        case oneRepMax

        var title: String {
            switch self {
            case .maxWeight: "Max weight"
            case .oneRepMax: "Est. 1RM"
            }
        }
    }

    var exercise: String
    var kind: Kind
    var value: Double
    var date: Date

    var id: String { "\(exercise)-\(kind.rawValue)" }
}

struct StrengthBucket: Identifiable, Equatable, Sendable {
    var start: Date
    var volume: Double = 0
    var sessions = 0
    var id: Date { start }
}

struct StrengthReport: Equatable, Sendable {
    var sessionCount = 0
    var setCount = 0
    var volume: Double = 0
    var buckets: [StrengthBucket] = []
    var bucket: StatsBucket = .week
    /// Exercises trained in the period, most recent first (with all-time history).
    var exercises: [ExerciseSummary] = []
    /// All-time records, newest first.
    var records: [PersonalRecord] = []
}

/// Strength statistics from logged gym sessions (pure logic). Only ticked-off sets
/// count; their actual reps/weight fall back to the planned values.
enum StrengthStats {
    /// Epley: 1RM = weight × (1 + reps / 30); a single rep is the weight itself.
    static func oneRepMax(weight: Double, reps: Int) -> Double {
        guard reps > 1 else { return weight }
        return weight * (1 + Double(reps) / 30)
    }

    static func performedSets(_ exercise: ExerciseEntry) -> [PerformedSet] {
        exercise.sets.compactMap { set in
            guard set.isDone, let reps = set.performedReps, reps > 0 else { return nil }
            return PerformedSet(reps: reps, weight: set.performedWeight.flatMap { $0 > 0 ? $0 : nil })
        }
    }

    /// Per-exercise history across sessions, keyed by normalized name.
    static func exerciseSummaries(_ sessions: [StrengthSessionSnapshot]) -> [ExerciseSummary] {
        var history: [String: [ExerciseSessionStat]] = [:]
        var names: [String: (name: String, date: Date)] = [:]
        for session in sessions.sorted(by: { $0.date < $1.date }) where session.counts {
            for exercise in session.workout.exercises {
                let key = ExerciseHistory.normalizedName(exercise.name)
                let sets = performedSets(exercise)
                guard !key.isEmpty, !sets.isEmpty else { continue }
                history[key, default: []].append(ExerciseSessionStat(sessionID: session.id, date: session.date, sets: sets))
                // Display the most recent spelling.
                if names[key].map({ session.date >= $0.date }) ?? true {
                    names[key] = (exercise.name.trimmingCharacters(in: .whitespaces), session.date)
                }
            }
        }
        return history.map { key, stats in
            ExerciseSummary(key: key, name: names[key]?.name ?? key, history: stats)
        }
        .sorted { ($0.lastDate ?? .distantPast) > ($1.lastDate ?? .distantPast) }
    }

    /// Current all-time records (max weight and estimated 1RM per exercise).
    static func records(from summaries: [ExerciseSummary]) -> [PersonalRecord] {
        var records: [PersonalRecord] = []
        for summary in summaries {
            if let max = summary.maxWeight {
                records.append(PersonalRecord(exercise: summary.name, kind: .maxWeight, value: max.value, date: max.date))
            }
            if let best = summary.bestOneRepMax {
                records.append(PersonalRecord(exercise: summary.name, kind: .oneRepMax, value: best.value, date: best.date))
            }
        }
        // Newest first; deterministic for ties.
        return records.sorted {
            if $0.date != $1.date { return $0.date > $1.date }
            if $0.exercise != $1.exercise { return $0.exercise < $1.exercise }
            return $0.kind.rawValue < $1.kind.rawValue
        }
    }

    static func report(
        sessions: [StrengthSessionSnapshot],
        period: StatsPeriod,
        now: Date,
        calendar: Calendar,
        earliest: Date? = nil
    ) -> StrengthReport {
        let interval = period.interval(now: now, calendar: calendar, earliest: earliest)
        let counted = sessions.filter(\.counts)
        let inPeriod = counted.filter { interval.contains($0.date) && $0.date < interval.end }

        var report = StrengthReport()
        report.bucket = period.buckets.primary == .day ? .day : (period.kind == .all ? .month : .week)
        var byBucket: [Date: StrengthBucket] = [:]
        for session in inPeriod {
            let sets = session.workout.exercises.flatMap(performedSets)
            let volume = sets.reduce(0) { $0 + $1.volume }
            report.sessionCount += 1
            report.setCount += sets.count
            report.volume += volume
            let start = StatsBuckets.start(of: report.bucket, containing: session.date, calendar: calendar)
            var bucket = byBucket[start] ?? StrengthBucket(start: start)
            bucket.volume += volume
            bucket.sessions += 1
            byBucket[start] = bucket
        }
        report.buckets = StatsBuckets.starts(of: report.bucket, in: interval, calendar: calendar).map {
            byBucket[$0] ?? StrengthBucket(start: $0)
        }

        let summaries = exerciseSummaries(counted)
        report.exercises = summaries.filter { summary in
            summary.history.contains { interval.contains($0.date) && $0.date < interval.end }
        }
        report.records = records(from: summaries)
        return report
    }

    /// Records set in `session` compared with everything before it. Exercises done
    /// for the first time don't count as records.
    static func newRecords(in session: StrengthSessionSnapshot, previous: [StrengthSessionSnapshot]) -> [PersonalRecord] {
        let earlier = previous.filter { $0.id != session.id && $0.date <= session.date && $0.counts }
        let before = Dictionary(uniqueKeysWithValues: exerciseSummaries(earlier).map { ($0.key, $0) })
        var records: [PersonalRecord] = []
        for exercise in session.workout.exercises {
            let key = ExerciseHistory.normalizedName(exercise.name)
            let sets = performedSets(exercise)
            guard let previousSummary = before[key], !sets.isEmpty else { continue }
            let stat = ExerciseSessionStat(sessionID: session.id, date: session.date, sets: sets)
            if let weight = stat.maxWeight, weight > (previousSummary.maxWeight?.value ?? .infinity) {
                records.append(PersonalRecord(exercise: exercise.name, kind: .maxWeight, value: weight, date: session.date))
            }
            if let oneRM = stat.bestOneRepMax, oneRM > (previousSummary.bestOneRepMax?.value ?? .infinity) + 0.01 {
                records.append(PersonalRecord(exercise: exercise.name, kind: .oneRepMax, value: oneRM, date: session.date))
            }
        }
        return records
    }
}

extension StrengthSessionSnapshot {
    init(session: PlannedSession) {
        self.init(id: session.id, date: session.date, isDone: session.isDone, workout: session.details.strengthWorkout)
    }
}
