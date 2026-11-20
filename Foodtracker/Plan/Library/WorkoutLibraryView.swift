import SwiftUI

/// Workout library (implemented in a later milestone).
struct WorkoutLibraryView: View {
    var body: some View {
        ContentUnavailableView("Workout Library", systemImage: "books.vertical", description: Text("Coming soon"))
            .navigationTitle("Library")
    }
}
