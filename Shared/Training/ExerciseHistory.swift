import Foundation

/// What was done for one exercise in an earlier session.
struct ExercisePerformance: Equatable, Sendable {
    var date: Date
    var sets: [ExerciseSet]

    /// "3 × 8 @ 80 kg", "8 @ 80 · 6 @ 82.5 kg", "3 × 12"
    var summary: String { ExerciseHistory.summary(of: sets) }
}

/// "Last time" lookups for strength exercises, matched by name (pure logic).
enum ExerciseHistory {
    struct Record: Sendable {
        var sessionID: UUID
        var date: Date
        var workout: StrengthWorkout
    }

    /// Case-, accent- and whitespace-insensitive name used for matching.
    static func normalizedName(_ name: String) -> String {
        name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Most recent performance of `name` on or before `date`, ignoring `excludedSessionID`.
    /// Only sets that were ticked off count.
    static func lastPerformance(
        of name: String,
        onOrBefore date: Date,
        excluding excludedSessionID: UUID?,
        in records: [Record]
    ) -> ExercisePerformance? {
        let key = normalizedName(name)
        guard !key.isEmpty else { return nil }
        let candidates = records
            .filter { $0.sessionID != excludedSessionID && $0.date <= date }
            .sorted { $0.date > $1.date }
        for record in candidates {
            for exercise in record.workout.exercises where normalizedName(exercise.name) == key {
                let done = exercise.sets.filter(\.isDone)
                if !done.isEmpty {
                    return ExercisePerformance(date: record.date, sets: done)
                }
            }
        }
        return nil
    }

    /// Distinct exercise names (most recently used spelling first), for autocomplete.
    static func knownNames(in records: [Record]) -> [String] {
        var seen = Set<String>()
        var names: [String] = []
        for record in records.sorted(by: { $0.date > $1.date }) {
            for exercise in record.workout.exercises {
                let trimmed = exercise.name.trimmingCharacters(in: .whitespaces)
                let key = normalizedName(trimmed)
                guard !key.isEmpty, !seen.contains(key) else { continue }
                seen.insert(key)
                names.append(trimmed)
            }
        }
        return names
    }

    static func summary(of sets: [ExerciseSet]) -> String {
        guard !sets.isEmpty else { return "" }
        let reps = sets.map(\.performedReps)
        let weights = sets.map(\.performedWeight)
        let allSameReps = Set(reps.map { $0 ?? -1 }).count == 1
        let allSameWeight = Set(weights.map { $0 ?? -1 }).count == 1

        func repsText(_ value: Int?) -> String { value.map(String.init) ?? "–" }

        if allSameReps && allSameWeight {
            var text = "\(sets.count) × \(repsText(reps[0]))"
            if let weight = weights[0] { text += " @ \(Format.weight(weight)) kg" }
            return text
        }
        let parts = sets.map { set -> String in
            if let weight = set.performedWeight {
                return "\(repsText(set.performedReps)) @ \(Format.weight(weight))"
            }
            return repsText(set.performedReps)
        }
        let unit = weights.contains { $0 != nil } ? " kg" : ""
        return parts.joined(separator: " · ") + unit
    }
}
