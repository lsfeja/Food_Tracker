import SwiftData
import SwiftUI

/// Type-specific editors for planning a workout. Rendered as `Form` sections.
struct WorkoutDetailsEditor: View {
    @Binding var details: WorkoutDetails
    let sport: SportType

    var body: some View {
        switch sport.category {
        case .strength:
            StrengthEditor(workout: $details.strengthWorkout)
        case .endurance:
            EnduranceEditor(workout: $details.enduranceWorkout)
        case .other:
            GeneralEditor(workout: $details.generalWorkout)
        }
    }
}

// MARK: - Strength

struct StrengthEditor: View {
    @Binding var workout: StrengthWorkout

    @Query private var strengthSessions: [PlannedSession]

    init(workout: Binding<StrengthWorkout>) {
        _workout = workout
        let strength = SportType.strength.rawValue
        _strengthSessions = Query(
            filter: #Predicate<PlannedSession> { $0.sportRaw == strength },
            sort: \PlannedSession.date,
            order: .reverse
        )
    }

    var body: some View {
        let knownNames = ExerciseHistory.knownNames(in: strengthSessions.prefix(100).map {
            ExerciseHistory.Record(sessionID: $0.id, date: $0.date, workout: $0.details.strengthWorkout)
        })

        ForEach($workout.exercises) { $exercise in
            Section {
                ExerciseNameField(name: $exercise.name, suggestions: knownNames)

                ForEach($exercise.sets) { $exerciseSet in
                    let number = (exercise.sets.firstIndex { $0.id == exerciseSet.id } ?? 0) + 1
                    HStack(spacing: 6) {
                        Text("Set \(number)")
                            .foregroundStyle(.secondary)
                        Spacer()
                        OptionalNumberField(placeholder: "reps", value: $exerciseSet.plannedReps.asDouble, fractionDigits: 0, width: 52)
                        Text("×").foregroundStyle(.secondary)
                        OptionalNumberField(placeholder: "kg", value: $exerciseSet.plannedWeight, fractionDigits: 2, width: 64)
                        Text("kg").foregroundStyle(.secondary)
                    }
                }
                .onDelete { offsets in
                    exercise.sets.remove(atOffsets: offsets)
                }

                Button {
                    let last = exercise.sets.last
                    exercise.sets.append(ExerciseSet(plannedReps: last?.plannedReps ?? 8, plannedWeight: last?.plannedWeight))
                } label: {
                    Label("Add Set", systemImage: "plus")
                }

                Stepper(value: restBinding($exercise), in: 0...600, step: 15) {
                    LabeledContent("Rest", value: (exercise.restSeconds ?? 0) > 0 ? "\(exercise.restSeconds ?? 0) s" : "Off")
                }

                TextField("Exercise notes", text: $exercise.notes, axis: .vertical)
            } header: {
                HStack {
                    Text("Exercise \((workout.exercises.firstIndex { $0.id == exercise.id } ?? 0) + 1)")
                    Spacer()
                    Button(role: .destructive) {
                        workout.exercises.removeAll { $0.id == exercise.id }
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Remove exercise")
                }
            }
        }

        Section {
            Button {
                workout.exercises.append(ExerciseEntry(sets: [ExerciseSet(plannedReps: 8), ExerciseSet(plannedReps: 8), ExerciseSet(plannedReps: 8)]))
            } label: {
                Label("Add Exercise", systemImage: "plus.circle.fill")
            }
        }

        Section("Notes") {
            TextField("Notes", text: $workout.notes, axis: .vertical)
                .lineLimit(2...6)
        }
    }

    private func restBinding(_ exercise: Binding<ExerciseEntry>) -> Binding<Int> {
        Binding(
            get: { exercise.wrappedValue.restSeconds ?? 0 },
            set: { exercise.wrappedValue.restSeconds = $0 > 0 ? $0 : nil }
        )
    }
}

/// Exercise name with suggestions from previous sessions (keeps names consistent so
/// "last time" values can be found).
struct ExerciseNameField: View {
    @Binding var name: String
    let suggestions: [String]
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Exercise name", text: $name)
                .font(.headline)
                .focused($focused)
            if focused, !matches.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(matches, id: \.self) { suggestion in
                            Button(suggestion) {
                                name = suggestion
                                focused = false
                            }
                            .font(.footnote)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.accentColor.opacity(0.12), in: Capsule())
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }
        }
    }

    private var matches: [String] {
        let query = ExerciseHistory.normalizedName(name)
        return Array(
            suggestions
                .filter { query.isEmpty || ExerciseHistory.normalizedName($0).contains(query) }
                .filter { ExerciseHistory.normalizedName($0) != query }
                .prefix(8)
        )
    }
}

// MARK: - Endurance

struct EnduranceEditor: View {
    @Binding var workout: EnduranceWorkout

    var body: some View {
        Section("Target") {
            LabeledContent("Duration") {
                HStack(spacing: 4) {
                    OptionalNumberField(placeholder: "–", value: $workout.durationMinutes, fractionDigits: 0)
                    Text("min").foregroundStyle(.secondary)
                }
            }
            LabeledContent("Distance") {
                HStack(spacing: 4) {
                    OptionalNumberField(placeholder: "–", value: $workout.distanceKm, fractionDigits: 2)
                    Text("km").foregroundStyle(.secondary)
                }
            }
            IntensityPicker(intensity: $workout.intensity)
        }

        ForEach($workout.blocks) { $block in
            Section {
                Stepper(value: $block.repeats, in: 1...50) {
                    LabeledContent("Repeats", value: "\(block.repeats)×")
                }
                ForEach($block.steps) { $step in
                    VStack(alignment: .leading, spacing: 6) {
                        TextField("Step (e.g. Work, Recovery)", text: $step.label)
                        HStack(spacing: 6) {
                            OptionalNumberField(placeholder: "min", value: $step.durationMinutes, fractionDigits: 1, width: 56)
                            Text("min").foregroundStyle(.secondary)
                            OptionalNumberField(placeholder: "km", value: $step.distanceKm, fractionDigits: 2, width: 56)
                            Text("km").foregroundStyle(.secondary)
                            Spacer()
                            IntensityPicker(intensity: $step.intensity)
                                .labelsHidden()
                        }
                    }
                }
                .onDelete { offsets in
                    block.steps.remove(atOffsets: offsets)
                }
                Button {
                    block.steps.append(IntervalStep(durationMinutes: 3, intensity: .zone(1)))
                } label: {
                    Label("Add Step", systemImage: "plus")
                }
            } header: {
                HStack {
                    Text(block.summary.isEmpty ? "Block" : block.summary)
                        .lineLimit(1)
                    Spacer()
                    Button(role: .destructive) {
                        workout.blocks.removeAll { $0.id == block.id }
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Remove block")
                }
                .textCase(nil)
            }
        }

        Section {
            Menu {
                Button("Warm-up") {
                    workout.blocks.append(IntervalBlock(steps: [IntervalStep(label: "Warm-up", durationMinutes: 15, intensity: .zone(1))]))
                }
                Button("Intervals") {
                    workout.blocks.append(IntervalBlock(repeats: 5, steps: [
                        IntervalStep(label: "Work", durationMinutes: 4, intensity: .zone(4)),
                        IntervalStep(label: "Recovery", durationMinutes: 3, intensity: .zone(1)),
                    ]))
                }
                Button("Steady") {
                    workout.blocks.append(IntervalBlock(steps: [IntervalStep(label: "Steady", durationMinutes: 20, intensity: .zone(2))]))
                }
                Button("Cool-down") {
                    workout.blocks.append(IntervalBlock(steps: [IntervalStep(label: "Cool-down", durationMinutes: 10, intensity: .zone(1))]))
                }
            } label: {
                Label("Add Interval Block", systemImage: "plus.circle.fill")
            }
        } footer: {
            let total = workout.blocks.reduce(0) { $0 + $1.totalMinutes }
            if total > 0 {
                Text("Structure: \(Format.duration(minutes: total))")
            }
        }

        Section("Notes") {
            TextField("Notes", text: $workout.notes, axis: .vertical)
                .lineLimit(2...6)
        }
    }
}

// MARK: - Other

struct GeneralEditor: View {
    @Binding var workout: GeneralWorkout

    var body: some View {
        Section {
            LabeledContent("Duration") {
                HStack(spacing: 4) {
                    OptionalNumberField(placeholder: "–", value: $workout.durationMinutes, fractionDigits: 0)
                    Text("min").foregroundStyle(.secondary)
                }
            }
        }
        Section("Notes") {
            TextField("What to do", text: $workout.notes, axis: .vertical)
                .lineLimit(3...10)
        }
    }
}
