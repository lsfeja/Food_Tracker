import SwiftData
import SwiftUI

/// Add a session to a day: from the workout library (copy on use) or a new one.
struct AddSessionSheet: View {
    let day: Date

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query private var templates: [WorkoutTemplate]

    @State private var path: [WorkoutContent] = []
    @State private var searchText = ""

    init(day: Date) {
        self.day = day
        _templates = Query(sort: [
            SortDescriptor(\WorkoutTemplate.useCount, order: .reverse),
            SortDescriptor(\WorkoutTemplate.name),
        ])
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if searchText.isEmpty {
                    Section("New Session") {
                        SportGrid { sport in
                            path.append(WorkoutContent(sport: sport))
                        }
                        .listRowInsets(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10))
                    }
                }

                Section {
                    if filtered.isEmpty {
                        Text(templates.isEmpty
                             ? "Saved workouts appear here. Use “Save to Library” on a session or create them in the library."
                             : "No workout matches “\(searchText)”.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(filtered) { template in
                        Button {
                            LibraryActions.schedule(template, on: day, in: context)
                            dismiss()
                        } label: {
                            HStack {
                                WorkoutTemplateRow(template: template)
                                Image(systemName: "plus.circle")
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("From Library")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search library")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .navigationDestination(for: WorkoutContent.self) { content in
                SessionEditorView(content: content, navigationTitle: "New Session", saveTitle: "Add") { saved in
                    PlanActions.addSession(saved, on: day, in: context)
                    dismiss()
                }
            }
        }
    }

    private var title: String {
        "Add to \(day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))"
    }

    private var filtered: [WorkoutTemplate] {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return templates }
        return templates.filter {
            $0.displayName.localizedStandardContains(query) || $0.sport.displayName.localizedStandardContains(query)
        }
    }
}

/// Grid of sport buttons.
struct SportGrid: View {
    var onSelect: (SportType) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(SportType.allCases) { sport in
                Button {
                    onSelect(sport)
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: sport.systemImage)
                            .font(.title3)
                            .frame(height: 24)
                        Text(sport.displayName)
                            .font(.caption)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.borderless)
            }
        }
    }
}
