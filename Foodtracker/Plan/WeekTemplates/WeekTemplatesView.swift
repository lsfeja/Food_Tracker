import SwiftUI

/// Week templates (implemented in a later milestone).
struct WeekTemplatesView: View {
    var body: some View {
        ContentUnavailableView("Week Templates", systemImage: "rectangle.stack", description: Text("Coming soon"))
            .navigationTitle("Week Templates")
    }
}

struct LoadWeekTemplateView: View {
    let initialWeekStart: Date
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ContentUnavailableView("Load Template", systemImage: "square.and.arrow.down", description: Text("Coming soon"))
                .toolbar { Button("Close") { dismiss() } }
        }
    }
}

struct SaveWeekTemplateView: View {
    let weekStart: Date
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ContentUnavailableView("Save Template", systemImage: "square.and.arrow.up", description: Text("Coming soon"))
                .toolbar { Button("Close") { dismiss() } }
        }
    }
}
