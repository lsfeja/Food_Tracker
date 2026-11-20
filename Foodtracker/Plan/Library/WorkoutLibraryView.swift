import SwiftData
import SwiftUI

/// Reusable workouts grouped by sport. Editing a template never changes sessions
/// that were planned from it.
struct WorkoutLibraryView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \WorkoutTemplate.name) private var templates: [WorkoutTemplate]

    @State private var searchText = ""
    @State private var editing: WorkoutTemplate?
    @State private var showNew = false

    var body: some View {
        List {
            if templates.isEmpty {
                ContentUnavailableView(
                    "No Workouts Yet",
                    systemImage: "books.vertical",
                    description: Text("Tap + to create a workout, or use “Save to Library” on any session.")
                )
                .listRowBackground(Color.clear)
            }
            ForEach(groupedSports, id: \.self) { sport in
                Section(sport.displayName) {
                    ForEach(filtered.filter { $0.sport == sport }) { template in
                        Button {
                            editing = template
                        } label: {
                            WorkoutTemplateRow(template: template)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                LibraryActions.delete(template, in: context)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                LibraryActions.duplicate(template, in: context)
                            } label: {
                                Label("Duplicate", systemImage: "plus.square.on.square")
                            }
                            .tint(.gray)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Workout Library")
        .searchable(text: $searchText, prompt: "Search workouts")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showNew = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("New workout")
            }
        }
        .sheet(item: $editing) { template in
            NavigationStack {
                SessionEditorView(content: template.content, navigationTitle: "Edit Workout") { saved in
                    template.content = saved
                    try? context.save()
                    editing = nil
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { editing = nil }
                    }
                }
            }
        }
        .sheet(isPresented: $showNew) {
            NewWorkoutSheet { content in
                LibraryActions.saveToLibrary(content, in: context)
            }
        }
    }

    private var filtered: [WorkoutTemplate] {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return templates }
        return templates.filter {
            $0.displayName.localizedStandardContains(query) || $0.sport.displayName.localizedStandardContains(query)
        }
    }

    private var groupedSports: [SportType] {
        let present = Set(filtered.map(\.sport))
        return SportType.allCases.filter { present.contains($0) }
    }
}

struct WorkoutTemplateRow: View {
    let template: WorkoutTemplate

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: template.sport.systemImage)
                .foregroundStyle(Color.accentColor)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(template.displayName)
                    .lineLimit(1)
                let summary = template.details.summary
                if !summary.isEmpty {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}

/// Pick a sport, then edit the new workout's content.
struct NewWorkoutSheet: View {
    var title = "New Workout"
    var onSave: (WorkoutContent) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var path: [WorkoutContent] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section("Sport") {
                    SportGrid { sport in
                        path.append(WorkoutContent(sport: sport))
                    }
                    .listRowInsets(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10))
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .navigationDestination(for: WorkoutContent.self) { content in
                SessionEditorView(content: content, navigationTitle: title) { saved in
                    onSave(saved)
                    dismiss()
                }
            }
        }
    }
}
