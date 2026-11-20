import SwiftData
import SwiftUI

/// Session details (expanded in the next milestone).
struct SessionDetailView: View {
    let session: PlannedSession
    @Environment(\.modelContext) private var context

    var body: some View {
        List {
            Section {
                Label(session.sport.displayName, systemImage: session.sport.systemImage)
                Text(session.details.summary)
                Button(session.isDone ? "Mark as Not Done" : "Mark as Done") {
                    PlanActions.toggleDone(session, in: context)
                }
            }
        }
        .navigationTitle(session.displayTitle)
    }
}
