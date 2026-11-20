import SwiftData
import SwiftUI

/// A planned session as a to-do row: checkbox, sport icon, title, short info.
struct SessionRow: View {
    let session: PlannedSession
    var linkedActivity: ActivityRecord?
    var onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                Image(systemName: checkboxSymbol)
                    .font(.title2)
                    .foregroundStyle(session.isDone ? Color.accentColor : Color.secondary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.borderless)
            .sensoryFeedback(.success, trigger: session.isDone) { _, done in done }
            .accessibilityLabel(session.isDone ? "Mark as not done" : "Mark as done")

            Image(systemName: session.sport.systemImage)
                .font(.body)
                .foregroundStyle(session.status == .skipped ? Color.secondary : Color.accentColor)
                .frame(width: 26)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.displayTitle)
                    .foregroundStyle(session.isDone || session.status == .skipped ? Color.secondary : Color.primary)
                    .lineLimit(1)
                if !infoLine.isEmpty {
                    Text(infoLine)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let linkedActivity {
                    Label(linkedActivity.summary, systemImage: "checkmark.seal")
                        .font(.caption)
                        .foregroundStyle(Color.accentColor)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }

    private var checkboxSymbol: String {
        switch session.status {
        case .done: "checkmark.circle.fill"
        case .skipped: "minus.circle"
        case .planned: "circle"
        }
    }

    private var infoLine: String {
        session.status == .skipped ? "Skipped" : session.details.summary
    }
}

/// An imported activity without a planned session.
struct UnplannedActivityRow: View {
    let activity: ActivityRecord
    let day: Date
    let sessions: [PlannedSession]

    @State private var showLinkSheet = false

    var body: some View {
        Button {
            showLinkSheet = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "bolt.horizontal.circle")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Image(systemName: (activity.sportType ?? .custom).systemImage)
                    .foregroundStyle(.secondary)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(activity.name)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text("Unplanned · \(activity.source.displayName) · \(activity.summary)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showLinkSheet) {
            LinkSessionSheet(activity: activity, day: day, sessions: sessions)
        }
    }
}
