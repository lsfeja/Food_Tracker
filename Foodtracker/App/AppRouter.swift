import Foundation
import Observation
import SwiftUI

/// Tabs of the root `TabView`. Add new cases for future areas (e.g. analytics).
enum AppTab: Hashable {
    case nutrition
    case plan
}

/// Screens pushed inside the Plan tab's navigation stack.
enum PlanRoute: Hashable {
    case session(UUID)
    case library
    case weekTemplates
}

/// Global navigation state: selected tab, the add-food sheet, the Plan stack and
/// deep-link handling.
@MainActor
@Observable
final class AppRouter {
    struct AddFoodRequest: Identifiable, Equatable {
        let id = UUID()
        var mode: AddFoodMode
        /// Day the food is logged to (today, or a past day opened from History).
        var day: Date
    }

    var selectedTab: AppTab = .nutrition
    var addFoodRequest: AddFoodRequest?
    /// Heterogeneous so pushed screens can push their own value types.
    var planPath = NavigationPath()

    func presentAddFood(_ mode: AddFoodMode = .search, day: Date = .now) {
        addFoodRequest = AddFoodRequest(mode: mode, day: day)
    }

    func showSession(_ id: UUID) {
        selectedTab = .plan
        planPath = NavigationPath([PlanRoute.session(id)])
    }

    func handle(_ link: DeepLink) {
        switch link {
        case .today:
            selectedTab = .nutrition // Don't interrupt an open sheet.
        case .addFood(let mode):
            selectedTab = .nutrition
            presentAddFood(mode)
        case .plan:
            selectedTab = .plan
        case .session(let id):
            showSession(id)
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
