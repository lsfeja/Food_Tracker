import Foundation
import Observation
import SwiftData

/// Dependency container for app services, injected via `.environment(services)`.
@MainActor
@Observable
final class AppServices {
    let foodDatabase: any FoodDatabaseService
    let ocr: OCRService
    let strava: StravaService
    let activitySync: ActivitySyncService
    /// One-time Strava history import for the Stats tab.
    let backfill: ActivityBackfillService

    init(
        foodDatabase: any FoodDatabaseService = OpenFoodFactsService(),
        ocr: OCRService = OCRService(),
        strava: StravaService = StravaService(),
        container: ModelContainer = SharedModelContainer.shared
    ) {
        self.foodDatabase = foodDatabase
        self.ocr = ocr
        self.strava = strava
        // Register further activity sources (e.g. Garmin) here.
        self.activitySync = ActivitySyncService(sources: [strava], container: container)
        self.backfill = ActivityBackfillService(source: strava, container: container)
    }
}
