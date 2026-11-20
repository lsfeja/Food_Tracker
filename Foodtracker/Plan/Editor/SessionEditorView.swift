import SwiftUI

/// Edits workout content (sport, title, details). Used for sessions, library
/// templates and sessions inside week templates.
struct SessionEditorView: View {
    let navigationTitle: String
    let saveTitle: String
    var onSave: (WorkoutContent) -> Void

    @State private var content: WorkoutContent

    init(content: WorkoutContent, navigationTitle: String, saveTitle: String = "Save", onSave: @escaping (WorkoutContent) -> Void) {
        _content = State(initialValue: content)
        self.navigationTitle = navigationTitle
        self.saveTitle = saveTitle
        self.onSave = onSave
    }

    var body: some View {
        Form {
            Section {
                Picker(selection: sportBinding) {
                    ForEach(SportType.allCases) { sport in
                        Label(sport.displayName, systemImage: sport.systemImage).tag(sport)
                    }
                } label: {
                    Text("Sport")
                }
                TextField(content.sport.displayName, text: $content.title)
            }

            WorkoutDetailsEditor(details: $content.details, sport: content.sport)
        }
        .navigationTitle(navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(saveTitle) {
                    var saved = content
                    saved.title = saved.title.trimmingCharacters(in: .whitespaces)
                    onSave(saved)
                }
            }
        }
    }

    private var sportBinding: Binding<SportType> {
        Binding(
            get: { content.sport },
            set: { content.changeSport(to: $0) }
        )
    }
}

/// Type-specific editors (filled in by the session detail milestone).
struct WorkoutDetailsEditor: View {
    @Binding var details: WorkoutDetails
    let sport: SportType

    var body: some View {
        Section("Notes") {
            TextField("Notes", text: notesBinding, axis: .vertical)
                .lineLimit(3...8)
        }
    }

    private var notesBinding: Binding<String> {
        Binding(
            get: { details.notes },
            set: { newValue in
                switch details {
                case .strength(var workout): workout.notes = newValue; details = .strength(workout)
                case .endurance(var workout): workout.notes = newValue; details = .endurance(workout)
                case .general(var workout): workout.notes = newValue; details = .general(workout)
                }
            }
        )
    }
}
