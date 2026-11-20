import SwiftData
import SwiftUI

/// For an unplanned activity: link it to one of the day's sessions, or create a
/// completed session from it.
struct LinkSessionSheet: View {
    let activity: ActivityRecord
    let day: Date
    let sessions: [PlannedSession]

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ActivityPickerRow(activity: activity)
                } footer: {
                    Text("Imported from \(activity.source.displayName). Not linked to a planned session.")
                }

                Section("Link to Session") {
                    if sessions.isEmpty {
                        Text("No sessions planned on this day.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(sessions) { session in
                        Button {
                            TrainingLinker.link(session, to: activity, in: context)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: session.sport.systemImage)
                                    .foregroundStyle(Color.accentColor)
                                    .frame(width: 26)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(session.displayTitle)
                                    if session.linkedActivityKey != nil {
                                        Text("Already linked; the other activity becomes unplanned")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }

                Section {
                    Button {
                        TrainingLinker.createSession(from: activity, in: context)
                        dismiss()
                    } label: {
                        Label("Add as Completed Session", systemImage: "plus.circle")
                    }
                }
            }
            .navigationTitle("Unplanned Activity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
