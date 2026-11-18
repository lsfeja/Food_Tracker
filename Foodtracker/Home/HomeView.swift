import SwiftUI

/// Root screen: today's dashboard plus the global add-food sheet.
struct HomeView: View {
    @Environment(AppRouter.self) private var router
    @Environment(\.scenePhase) private var scenePhase

    @State private var today = Calendar.current.startOfDay(for: .now)

    var body: some View {
        @Bindable var router = router

        NavigationStack {
            DayDashboard(day: today)
                .id(today)
        }
        .sheet(item: $router.addFoodRequest) { request in
            AddFoodView(request: request)
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
