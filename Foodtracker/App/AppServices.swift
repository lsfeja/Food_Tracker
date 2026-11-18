import Foundation
import Observation

/// Dependency container for app services, injected via `.environment(services)`.
@MainActor
@Observable
final class AppServices {
    let foodDatabase: any FoodDatabaseService
    let ocr: OCRService

    init(
        foodDatabase: any FoodDatabaseService = OpenFoodFactsService(),
        ocr: OCRService = OCRService()
    ) {
        self.foodDatabase = foodDatabase
        self.ocr = ocr
    }
}
