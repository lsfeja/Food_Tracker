import SwiftUI

/// Link an unplanned activity to a session (implemented in the Strava milestone).
struct LinkSessionSheet: View {
    let activity: ActivityRecord
    let day: Date
    let sessions: [PlannedSession]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ContentUnavailableView(activity.name, systemImage: "link", description: Text(activity.summary))
                .toolbar { Button("Close") { dismiss() } }
        }
    }
}
