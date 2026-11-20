import SwiftData
import SwiftUI

/// Resolves a session ID (navigation value / deep link) to its detail view.
struct SessionDetailLoader: View {
    @Query private var matches: [PlannedSession]

    init(sessionID: UUID) {
        let id = sessionID
        _matches = Query(filter: #Predicate<PlannedSession> { $0.id == id })
    }

    var body: some View {
        if let session = matches.first {
            SessionDetailView(session: session)
        } else {
            ContentUnavailableView(
                "Session not found",
                systemImage: "calendar.badge.exclamationmark",
                description: Text("It may have been deleted.")
            )
        }
    }
}
