import SwiftUI

/// Root screen: today's dashboard plus the global add-food sheet.
struct HomeView: View {
    private enum Route: Hashable {
        case history
    }

    @Environment(AppRouter.self) private var router
    @Environment(\.scenePhase) private var scenePhase

    @State private var today = Calendar.current.startOfDay(for: .now)
    @State private var showSettings = false

    var body: some View {
        @Bindable var router = router

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
        .sheet(item: $router.addFoodRequest) { request in
            AddFoodView(request: request)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            refreshToday()
            router.consumePendingDeepLink()
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
