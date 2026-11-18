import SwiftData
import SwiftUI

@main
struct FoodtrackerApp: App {
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(router)
                .onOpenURL { url in
                    router.handle(url: url)
                }
                .onReceive(NotificationCenter.default.publisher(for: DeepLinkInbox.didPostNotification)) { _ in
                    router.consumePendingDeepLink()
                }
        }
        .modelContainer(SharedModelContainer.shared)
    }
}
