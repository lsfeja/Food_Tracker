import SwiftUI

/// Tab bar root. Owns app-wide presentation (add-food sheet), deep links and
/// background sync so they work from every tab.
struct RootView: View {
    @Environment(AppRouter.self) private var router
    @Environment(AppServices.self) private var services
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var router = router

        TabView(selection: $router.selectedTab) {
            Tab("Nutrition", systemImage: "fork.knife", value: AppTab.nutrition) {
                HomeView()
            }
            Tab("Plan", systemImage: "calendar", value: AppTab.plan) {
                PlanView()
            }
        }
        .sheet(item: $router.addFoodRequest) { request in
            AddFoodView(request: request)
        }
        .task {
            // Cold launch (e.g. from the Control or a widget): pick up a pending deep link.
            router.consumePendingDeepLink()
            await services.activitySync.syncIfNeeded()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            router.consumePendingDeepLink()
            Task { await services.activitySync.syncIfNeeded() }
        }
    }
}
