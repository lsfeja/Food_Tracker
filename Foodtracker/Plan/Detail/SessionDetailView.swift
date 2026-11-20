import SwiftData
import SwiftUI

/// Detail of a planned session. Strength sessions are tracked live here (tick off
/// sets, enter actual reps/weight); other sports show their plan.
struct SessionDetailView: View {
    let session: PlannedSession

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @Query private var strengthSessions: [PlannedSession]

    @State private var details: WorkoutDetails
    @State private var showEditor = false
    @State private var confirmDelete = false
    @State private var restEnd: Date?
    @State private var savedToLibrary = false

    init(session: PlannedSession) {
        self.session = session
        _details = State(initialValue: session.details)
        let strength = SportType.strength.rawValue
        _strengthSessions = Query(
            filter: #Predicate<PlannedSession> { $0.sportRaw == strength },
            sort: \PlannedSession.date,
            order: .reverse
        )
    }

    var body: some View {
        List {
            header

            LinkedActivitySection(session: session)

            switch details {
            case .strength:
                StrengthTrackingSections(
                    workout: $details.strengthWorkout,
                    history: history,
                    sessionID: session.id,
                    sessionDate: session.date,
                    onSetCompleted: startRest(seconds:)
                )
            case .endurance(let workout):
                EndurancePlanSections(workout: workout)
            case .general(let workout):
                GeneralPlanSections(workout: workout)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(session.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .safeAreaInset(edge: .bottom) {
            if let restEnd {
                RestTimerBanner(end: restEnd) { self.restEnd = nil }
                    .padding(.horizontal)
                    .padding(.bottom, 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: restEnd)
        .onChange(of: details) { _, newValue in
            session.details = newValue
            completeIfAllSetsDone(newValue)
            PlanActions.commit(context, touching: [])
        }
        .sheet(isPresented: $showEditor) {
            NavigationStack {
                SessionEditorView(content: session.content, navigationTitle: "Edit Session") { saved in
                    session.content = saved
                    details = saved.details
                    PlanActions.commit(context, touching: [session.date])
                    showEditor = false
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showEditor = false }
                    }
                }
            }
        }
        .confirmationDialog("Delete this session?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                PlanActions.delete(session, in: context)
                dismiss()
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: session.sport.systemImage)
                    .font(.title)
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 44, height: 44)
                    .background(Color.accentColor.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(session.displayTitle)
                        .font(.title3.weight(.semibold))
                    Text("\(session.sport.displayName) · \(session.date.formatted(.dateTime.weekday(.wide).day().month()))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if !details.summary.isEmpty {
                        Text(details.summary)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.vertical, 4)

            Button {
                withAnimation { PlanActions.toggleDone(session, in: context) }
            } label: {
                Label(session.isDone ? "Done" : "Mark as Done",
                      systemImage: session.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderless)
            .foregroundStyle(session.isDone ? Color.accentColor : Color.primary)
            .sensoryFeedback(.success, trigger: session.isDone) { _, done in done }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button("Edit") { showEditor = true }
            Menu {
                Button {
                    PlanActions.setSkipped(session, session.status != .skipped, in: context)
                } label: {
                    Label(session.status == .skipped ? "Unskip" : "Skip", systemImage: "forward")
                }
                Button {
                    _ = PlanActions.duplicate(session, in: context)
                } label: {
                    Label("Duplicate", systemImage: "plus.square.on.square")
                }
                Button {
                    LibraryActions.saveToLibrary(session.content, in: context)
                    savedToLibrary = true
                } label: {
                    Label("Save to Library", systemImage: "books.vertical")
                }
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .sensoryFeedback(.success, trigger: savedToLibrary)
        }
    }

    // MARK: - Logic

    private var history: [ExerciseHistory.Record] {
        strengthSessions.prefix(200).map {
            ExerciseHistory.Record(sessionID: $0.id, date: $0.date, workout: $0.details.strengthWorkout)
        }
    }

    private func startRest(seconds: Int) {
        guard seconds > 0 else { return }
        restEnd = Date.now.addingTimeInterval(TimeInterval(seconds))
    }

    /// Ticking the last set completes the session.
    private func completeIfAllSetsDone(_ details: WorkoutDetails) {
        guard case .strength(let workout) = details,
              workout.setCount > 0,
              workout.doneSetCount == workout.setCount,
              session.status == .planned
        else { return }
        session.setDone(true)
    }
}

// MARK: - Strength tracking

private struct StrengthTrackingSections: View {
    @Binding var workout: StrengthWorkout
    let history: [ExerciseHistory.Record]
    let sessionID: UUID
    let sessionDate: Date
    var onSetCompleted: (Int) -> Void

    var body: some View {
        if workout.exercises.isEmpty {
            Section {
                Text("No exercises yet. Tap Edit to add some.")
                    .foregroundStyle(.secondary)
            }
        }

        ForEach($workout.exercises) { $exercise in
            Section {
                ForEach($exercise.sets) { $exerciseSet in
                    let number = (exercise.sets.firstIndex { $0.id == exerciseSet.id } ?? 0) + 1
                    SetTrackingRow(number: number, exerciseSet: $exerciseSet) {
                        onSetCompleted(exercise.restSeconds ?? 0)
                    }
                }
                Button {
                    let last = exercise.sets.last
                    exercise.sets.append(ExerciseSet(
                        plannedReps: last?.performedReps ?? last?.plannedReps,
                        plannedWeight: last?.performedWeight ?? last?.plannedWeight
                    ))
                } label: {
                    Label("Add Set", systemImage: "plus")
                        .font(.subheadline)
                }
            } header: {
                ExerciseHeader(
                    exercise: exercise,
                    last: ExerciseHistory.lastPerformance(
                        of: exercise.name,
                        onOrBefore: sessionDate,
                        excluding: sessionID,
                        in: history
                    )
                )
            } footer: {
                if !exercise.notes.isEmpty {
                    Text(exercise.notes)
                }
            }
        }

        if !workout.notes.isEmpty {
            Section("Notes") {
                Text(workout.notes)
            }
        }
    }
}

private struct ExerciseHeader: View {
    let exercise: ExerciseEntry
    let last: ExercisePerformance?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(exercise.name.isEmpty ? "Exercise" : exercise.name)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                Text("\(exercise.sets.filter(\.isDone).count)/\(exercise.sets.count)")
                    .font(.subheadline)
                    .monospacedDigit()
            }
            HStack(spacing: 10) {
                if let rest = exercise.restSeconds, rest > 0 {
                    Label("\(rest) s", systemImage: "timer")
                }
                if let last {
                    Label("Last: \(last.summary) (\(last.date.formatted(.dateTime.day().month(.abbreviated))))",
                          systemImage: "clock.arrow.circlepath")
                        .lineLimit(1)
                }
            }
            .font(.caption)
        }
        .textCase(nil)
        .padding(.bottom, 2)
    }
}

/// One set: planned values, editable actual reps/weight, and a checkbox.
private struct SetTrackingRow: View {
    let number: Int
    @Binding var exerciseSet: ExerciseSet
    var onCompleted: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text("\(number)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 18)

            Text(plannedText)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Spacer(minLength: 4)

            OptionalNumberField(
                placeholder: exerciseSet.plannedReps.map(String.init) ?? "reps",
                value: $exerciseSet.actualReps.asDouble,
                fractionDigits: 0,
                width: 44
            )
            Text("×").foregroundStyle(.secondary)
            OptionalNumberField(
                placeholder: exerciseSet.plannedWeight.map(Format.weight) ?? "kg",
                value: $exerciseSet.actualWeight,
                fractionDigits: 2,
                width: 56
            )

            Button {
                toggle()
            } label: {
                Image(systemName: exerciseSet.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(exerciseSet.isDone ? Color.accentColor : Color.secondary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.borderless)
            .sensoryFeedback(.impact(weight: .light), trigger: exerciseSet.isDone)
            .accessibilityLabel(exerciseSet.isDone ? "Set \(number) done" : "Complete set \(number)")
        }
    }

    private var plannedText: String {
        let reps = exerciseSet.plannedReps.map(String.init) ?? "–"
        if let weight = exerciseSet.plannedWeight {
            return "\(reps) × \(Format.weight(weight)) kg"
        }
        return "\(reps) reps"
    }

    private func toggle() {
        if exerciseSet.isDone {
            exerciseSet.isDone = false
            return
        }
        // Untouched fields mean "as planned".
        if exerciseSet.actualReps == nil { exerciseSet.actualReps = exerciseSet.plannedReps }
        if exerciseSet.actualWeight == nil { exerciseSet.actualWeight = exerciseSet.plannedWeight }
        exerciseSet.isDone = true
        onCompleted()
    }
}

/// Rest countdown shown after a set is ticked off.
private struct RestTimerBanner: View {
    let end: Date
    var onFinish: () -> Void

    @State private var finished = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "timer")
                .font(.title3)
            VStack(alignment: .leading, spacing: 0) {
                Text("Rest")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(timerInterval: Date.now...max(end, .now), countsDown: true)
                    .font(.title2.weight(.semibold))
                    .monospacedDigit()
            }
            Spacer()
            Button("Skip", action: onFinish)
                .buttonStyle(.bordered)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .sensoryFeedback(.success, trigger: finished)
        .task(id: end) {
            let remaining = end.timeIntervalSinceNow
            if remaining > 0 {
                try? await Task.sleep(for: .seconds(remaining))
            }
            guard !Task.isCancelled else { return }
            finished = true
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            onFinish()
        }
    }
}

// MARK: - Endurance / other

private struct EndurancePlanSections: View {
    let workout: EnduranceWorkout

    var body: some View {
        Section("Plan") {
            if let minutes = workout.totalMinutes {
                LabeledContent("Duration", value: Format.duration(minutes: minutes))
            }
            if let distance = workout.distanceKm {
                LabeledContent("Distance", value: Format.distance(km: distance))
            }
            if let intensity = workout.intensity {
                LabeledContent("Intensity", value: intensity.label)
            }
            if workout.totalMinutes == nil && workout.distanceKm == nil && workout.intensity == nil {
                Text("No targets set. Tap Edit to add duration, distance or intensity.")
                    .foregroundStyle(.secondary)
            }
        }

        if !workout.blocks.isEmpty {
            Section("Intervals") {
                ForEach(workout.blocks) { block in
                    VStack(alignment: .leading, spacing: 4) {
                        if block.repeats > 1 {
                            Text("\(block.repeats)×")
                                .font(.headline)
                                .foregroundStyle(Color.accentColor)
                        }
                        ForEach(block.steps) { step in
                            HStack {
                                Text(step.label.isEmpty ? "Step" : step.label)
                                Spacer()
                                Text(step.summary)
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                            .font(.subheadline)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }

        if !workout.notes.isEmpty {
            Section("Notes") {
                Text(workout.notes)
            }
        }
    }
}

private struct GeneralPlanSections: View {
    let workout: GeneralWorkout

    var body: some View {
        if let minutes = workout.durationMinutes {
            Section {
                LabeledContent("Duration", value: Format.duration(minutes: minutes))
            }
        }
        Section("Notes") {
            if workout.notes.isEmpty {
                Text("No notes. Tap Edit to add some.")
                    .foregroundStyle(.secondary)
            } else {
                Text(workout.notes)
            }
        }
    }
}

