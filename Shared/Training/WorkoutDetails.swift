import Foundation

// Sport-specific session content, stored as JSON on PlannedSession, WorkoutTemplate and
// WeekTemplate. All decoders are lenient (missing keys fall back to defaults), so new
// fields can be added without migrations.

/// Training intensity: heart-rate/power zone (1–5) or rating of perceived exertion (1–10).
enum Intensity: Codable, Hashable, Sendable {
    case zone(Int)
    case rpe(Int)

    var label: String {
        switch self {
        case .zone(let value): "Z\(value)"
        case .rpe(let value): "RPE \(value)"
        }
    }
}

// MARK: - Strength

struct ExerciseSet: Codable, Hashable, Identifiable, Sendable {
    var id = UUID()
    var plannedReps: Int?
    /// kg; `nil` = bodyweight.
    var plannedWeight: Double?
    var actualReps: Int?
    var actualWeight: Double?
    var isDone = false

    /// What was (or will be) performed: actual values, falling back to the plan.
    var performedReps: Int? { actualReps ?? plannedReps }
    var performedWeight: Double? { actualWeight ?? plannedWeight }
}

struct ExerciseEntry: Codable, Hashable, Identifiable, Sendable {
    var id = UUID()
    var name = ""
    var sets: [ExerciseSet] = []
    var restSeconds: Int? = 90
    var notes = ""
}

struct StrengthWorkout: Codable, Hashable, Sendable {
    var exercises: [ExerciseEntry] = []
    var notes = ""

    var setCount: Int { exercises.reduce(0) { $0 + $1.sets.count } }
    var doneSetCount: Int { exercises.reduce(0) { $0 + $1.sets.filter(\.isDone).count } }
}

// MARK: - Endurance

struct IntervalStep: Codable, Hashable, Identifiable, Sendable {
    var id = UUID()
    var label = ""
    var durationMinutes: Double?
    var distanceKm: Double?
    var intensity: Intensity?

    /// "4′ Z4", "400 m RPE 8"
    var summary: String {
        var parts: [String] = []
        if let durationMinutes { parts.append(Format.shortMinutes(durationMinutes)) }
        if let distanceKm { parts.append(Format.shortDistance(distanceKm)) }
        if let intensity { parts.append(intensity.label) }
        return parts.isEmpty ? (label.isEmpty ? "Step" : label) : parts.joined(separator: " ")
    }
}

/// A group of steps repeated `repeats` times, e.g. 5 × (4′ Z4 / 3′ Z1).
struct IntervalBlock: Codable, Hashable, Identifiable, Sendable {
    var id = UUID()
    var repeats = 1
    var steps: [IntervalStep] = []

    var totalMinutes: Double {
        Double(max(repeats, 1)) * steps.reduce(0) { $0 + ($1.durationMinutes ?? 0) }
    }

    var summary: String {
        let inner = steps.map(\.summary).joined(separator: " / ")
        guard repeats > 1 else { return inner }
        return steps.count > 1 ? "\(repeats)×(\(inner))" : "\(repeats)×\(inner)"
    }
}

struct EnduranceWorkout: Codable, Hashable, Sendable {
    var durationMinutes: Double?
    var distanceKm: Double?
    var intensity: Intensity?
    /// Optional structure, e.g. warm-up, 5 × (4′ Z4 / 3′ Z1), cool-down.
    var blocks: [IntervalBlock] = []
    var notes = ""

    /// Planned duration, or the sum of the interval structure.
    var totalMinutes: Double? {
        if let durationMinutes { return durationMinutes }
        let fromBlocks = blocks.reduce(0) { $0 + $1.totalMinutes }
        return fromBlocks > 0 ? fromBlocks : nil
    }

    /// "15′ Z1 · 5×(4′ Z4 / 3′ Z1) · 10′ Z1"
    var structureSummary: String? {
        blocks.isEmpty ? nil : blocks.map(\.summary).joined(separator: " · ")
    }
}

// MARK: - Other

struct GeneralWorkout: Codable, Hashable, Sendable {
    var durationMinutes: Double?
    var notes = ""
}

// MARK: - Details

/// Type-specific payload of a session. New sport categories add a case here.
enum WorkoutDetails: Codable, Hashable, Sendable {
    case strength(StrengthWorkout)
    case endurance(EnduranceWorkout)
    case general(GeneralWorkout)

    static func empty(for category: SportCategory) -> WorkoutDetails {
        switch category {
        case .strength: .strength(StrengthWorkout())
        case .endurance: .endurance(EnduranceWorkout())
        case .other: .general(GeneralWorkout())
        }
    }

    var category: SportCategory {
        switch self {
        case .strength: .strength
        case .endurance: .endurance
        case .general: .other
        }
    }

    // Accessors for SwiftUI bindings: reading returns the payload (or an empty one),
    // writing replaces the case.
    var strengthWorkout: StrengthWorkout {
        get { if case .strength(let workout) = self { return workout }; return StrengthWorkout() }
        set { self = .strength(newValue) }
    }

    var enduranceWorkout: EnduranceWorkout {
        get { if case .endurance(let workout) = self { return workout }; return EnduranceWorkout() }
        set { self = .endurance(newValue) }
    }

    var generalWorkout: GeneralWorkout {
        get { if case .general(let workout) = self { return workout }; return GeneralWorkout() }
        set { self = .general(newValue) }
    }

    var notes: String {
        switch self {
        case .strength(let workout): workout.notes
        case .endurance(let workout): workout.notes
        case .general(let workout): workout.notes
        }
    }

    /// Planned duration in minutes, if known.
    var plannedMinutes: Double? {
        switch self {
        case .strength: nil
        case .endurance(let workout): workout.totalMinutes
        case .general(let workout): workout.durationMinutes
        }
    }

    /// Converts to another category, keeping notes and duration where possible.
    func adapted(to category: SportCategory) -> WorkoutDetails {
        guard category != self.category else { return self }
        switch category {
        case .strength:
            return .strength(StrengthWorkout(notes: notes))
        case .endurance:
            return .endurance(EnduranceWorkout(durationMinutes: plannedMinutes, notes: notes))
        case .other:
            return .general(GeneralWorkout(durationMinutes: plannedMinutes, notes: notes))
        }
    }

    /// Copy without progress (done flags, actual values). Used for templates.
    func resettingProgress() -> WorkoutDetails {
        guard case .strength(var workout) = self else { return self }
        for exerciseIndex in workout.exercises.indices {
            for setIndex in workout.exercises[exerciseIndex].sets.indices {
                workout.exercises[exerciseIndex].sets[setIndex].isDone = false
                workout.exercises[exerciseIndex].sets[setIndex].actualReps = nil
                workout.exercises[exerciseIndex].sets[setIndex].actualWeight = nil
            }
        }
        return .strength(workout)
    }

    /// Short info line for lists, e.g. "4 exercises · 16 sets" or "60 min · 10 km · Z2".
    var summary: String {
        switch self {
        case .strength(let workout):
            guard !workout.exercises.isEmpty else { return workout.notes.firstLine }
            let exercises = workout.exercises.count == 1 ? "1 exercise" : "\(workout.exercises.count) exercises"
            let done = workout.doneSetCount
            let sets = done > 0 ? "\(done)/\(workout.setCount) sets" : "\(workout.setCount) sets"
            return "\(exercises) · \(sets)"
        case .endurance(let workout):
            var parts: [String] = []
            if let minutes = workout.totalMinutes { parts.append(Format.duration(minutes: minutes)) }
            if let distance = workout.distanceKm { parts.append(Format.distance(km: distance)) }
            if let intensity = workout.intensity { parts.append(intensity.label) }
            if let main = workout.blocks.first(where: { $0.repeats > 1 }) { parts.append(main.summary) }
            return parts.isEmpty ? workout.notes.firstLine : parts.joined(separator: " · ")
        case .general(let workout):
            if let minutes = workout.durationMinutes { return Format.duration(minutes: minutes) }
            return workout.notes.firstLine
        }
    }
}

/// Everything that describes a workout independent of when it's scheduled.
/// Copied by value from templates into sessions ("copy on use").
struct WorkoutContent: Codable, Hashable, Sendable {
    var sport: SportType
    var title: String
    var details: WorkoutDetails

    init(sport: SportType, title: String = "", details: WorkoutDetails? = nil) {
        self.sport = sport
        self.title = title
        self.details = details ?? .empty(for: sport.category)
    }

    var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? sport.displayName : trimmed
    }

    /// Changes the sport; details are converted if the category changes.
    mutating func changeSport(to newSport: SportType) {
        sport = newSport
        details = details.adapted(to: newSport.category)
    }

    func resettingProgress() -> WorkoutContent {
        var copy = self
        copy.details = details.resettingProgress()
        return copy
    }
}

// MARK: - JSON

enum WorkoutCoding {
    static func encode<T: Encodable>(_ value: T) -> Data? {
        try? JSONEncoder().encode(value)
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data?) -> T? {
        guard let data else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}

// MARK: - Lenient decoding

private extension KeyedDecodingContainer {
    func value<T: Decodable>(_ key: Key, default defaultValue: T) -> T {
        ((try? decodeIfPresent(T.self, forKey: key)) ?? nil) ?? defaultValue
    }

    func optional<T: Decodable>(_ key: Key) -> T? {
        (try? decodeIfPresent(T.self, forKey: key)) ?? nil
    }
}

extension ExerciseSet {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.value(.id, default: UUID())
        plannedReps = container.optional(.plannedReps)
        plannedWeight = container.optional(.plannedWeight)
        actualReps = container.optional(.actualReps)
        actualWeight = container.optional(.actualWeight)
        isDone = container.value(.isDone, default: false)
    }
}

extension ExerciseEntry {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.value(.id, default: UUID())
        name = container.value(.name, default: "")
        sets = container.value(.sets, default: [])
        restSeconds = container.optional(.restSeconds)
        notes = container.value(.notes, default: "")
    }
}

extension StrengthWorkout {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        exercises = container.value(.exercises, default: [])
        notes = container.value(.notes, default: "")
    }
}

extension IntervalStep {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.value(.id, default: UUID())
        label = container.value(.label, default: "")
        durationMinutes = container.optional(.durationMinutes)
        distanceKm = container.optional(.distanceKm)
        intensity = container.optional(.intensity)
    }
}

extension IntervalBlock {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.value(.id, default: UUID())
        repeats = container.value(.repeats, default: 1)
        steps = container.value(.steps, default: [])
    }
}

extension EnduranceWorkout {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        durationMinutes = container.optional(.durationMinutes)
        distanceKm = container.optional(.distanceKm)
        intensity = container.optional(.intensity)
        blocks = container.value(.blocks, default: [])
        notes = container.value(.notes, default: "")
    }
}

extension GeneralWorkout {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        durationMinutes = container.optional(.durationMinutes)
        notes = container.value(.notes, default: "")
    }
}

private extension String {
    var firstLine: String {
        split(separator: "\n", maxSplits: 1).first.map(String.init) ?? ""
    }
}
