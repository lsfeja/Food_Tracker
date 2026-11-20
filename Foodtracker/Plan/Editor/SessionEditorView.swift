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
