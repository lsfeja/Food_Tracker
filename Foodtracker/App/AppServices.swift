import Foundation
import Observation

/// Dependency container for app services, injected via `.environment(services)`.
@MainActor
@Observable
final class AppServices {
    let foodDatabase: any FoodDatabaseService

    init(foodDatabase: any FoodDatabaseService = OpenFoodFactsService()) {
        self.foodDatabase = foodDatabase
    }
}
