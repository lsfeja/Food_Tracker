import SwiftData
import SwiftUI

/// Add a session to a day: new session by sport, or (later) from the library.
struct AddSessionSheet: View {
    let day: Date

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var path: [WorkoutContent] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section("New Session") {
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
