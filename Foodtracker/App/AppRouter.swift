import Foundation
import Observation

/// Global navigation state: the add-food sheet and deep-link handling.
@MainActor
@Observable
final class AppRouter {
    struct AddFoodRequest: Identifiable, Equatable {
        let id = UUID()
        var mode: AddFoodMode
        /// Day the food is logged to (today, or a past day opened from History).
        var day: Date
    }

    var addFoodRequest: AddFoodRequest?

    func presentAddFood(_ mode: AddFoodMode = .search, day: Date = .now) {
        addFoodRequest = AddFoodRequest(mode: mode, day: day)
    }

    func handle(_ link: DeepLink) {
        switch link {
        case .today:
            addFoodRequest = nil
        case .addFood(let mode):
            presentAddFood(mode)
        }
    }

    func handle(url: URL) {
        guard let link = DeepLink(url: url) else { return }
        handle(link)
    }

    func consumePendingDeepLink() {
        guard let link = DeepLinkInbox.consume() else { return }
        handle(link)
    }
}
