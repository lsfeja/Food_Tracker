import SwiftUI

/// Nutrition tab: today's dashboard, history and settings.
struct HomeView: View {
    private enum Route: Hashable {
        case history
    }

    @Environment(\.scenePhase) private var scenePhase

    @State private var today = Calendar.current.startOfDay(for: .now)
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            DayDashboard(day: today)
                .id(today)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        NavigationLink(value: Route.history) {
                            Image(systemName: "chart.bar.xaxis")
                        }
                        .accessibilityLabel("History")
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                        .accessibilityLabel("Settings")
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .history:
                        HistoryView()
                    }
                }
                .navigationDestination(for: Date.self) { day in
                    DayDashboard(day: day)
                }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { refreshToday() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            refreshToday()
        }
    }

    /// Rolls the dashboard over to the new day after midnight.
    private func refreshToday() {
        let start = Calendar.current.startOfDay(for: .now)
        if start != today { today = start }
    }
}
