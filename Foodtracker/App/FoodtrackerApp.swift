import SwiftData
import SwiftUI

@main
struct FoodtrackerApp: App {
    @State private var router = AppRouter()
    @State private var services = AppServices()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
                .environment(services)
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
