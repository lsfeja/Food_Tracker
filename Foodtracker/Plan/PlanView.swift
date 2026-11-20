import SwiftUI

/// Plan tab: training calendar (implemented in the following milestones).
struct PlanView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.planPath) {
            ContentUnavailableView("Training Plan", systemImage: "calendar", description: Text("Coming soon"))
                .navigationTitle("Plan")
                .navigationDestination(for: PlanRoute.self) { _ in
                    EmptyView()
                }
        }
    }
}
