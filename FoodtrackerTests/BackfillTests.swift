import Foundation
import SwiftData
import Testing
@testable import Foodtracker

@MainActor
final class FakeHistorySource: ActivityHistorySource {
    let kind: ActivitySourceKind = .strava
    var isConnected = true
    var pages: [[ImportedActivity]]
    var rateLimitOnPage: Int?
    var total: Int?
    private(set) var requestedPages: [Int] = []

    init(pages: [[ImportedActivity]], rateLimitOnPage: Int? = nil, total: Int? = nil) {
        self.pages = pages
        self.rateLimitOnPage = rateLimitOnPage
        self.total = total
    }

    func fetchActivities(since: Date, cached: [String: ImportedActivity]) async throws -> ActivityFetchResult {
        ActivityFetchResult(activities: [], isComplete: true)
    }

    func fetchHistory(before: Date, page: Int, perPage: Int) async throws -> [ImportedActivity] {
        requestedPages.append(page)
        if page == rateLimitOnPage {
            rateLimitOnPage = nil
            throw StravaError.rateLimited(until: .now.addingTimeInterval(3600))
        }
        return page <= pages.count ? pages[page - 1] : []
    }

    func estimatedActivityCount() async -> Int? { total }
}

@MainActor
struct BackfillTests {
    private static func activities(_ count: Int, offset: Int = 0) -> [ImportedActivity] {
        (0..<count).map { index in
            ImportedActivity(
                externalID: String(offset + index),
                name: "Ride \(offset + index)",
                type: "Ride",
                startDate: day(2020, 1, 1).addingTimeInterval(Double(offset + index) * 3600),
                durationSeconds: 3600,
                distanceMeters: 30_000,
                elevationMeters: 250,
                activeCalories: 0,
                caloriesEstimated: false,
                detailsComplete: true
            )
        }
    }

    private func makeDefaults() -> UserDefaults {
        UserDefaults(suiteName: "BackfillTests-\(UUID().uuidString)")!
    }

    @Test func importsAllPagesAndResumesAfterRateLimit() async throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let defaults = makeDefaults()
        let source = FakeHistorySource(
            pages: [Self.activities(200), Self.activities(50, offset: 200)],
            rateLimitOnPage: 2,
            total: 250
        )
        let backfill = ActivityBackfillService(source: source, container: container, defaults: defaults)

        await backfill.start().value
        guard case .paused = backfill.phase else {
            Issue.record("Expected a pause, got \(backfill.phase)")
            return
        }
        #expect(backfill.state.importedCount == 200)
        #expect(backfill.state.nextPage == 2)
        #expect(backfill.progress == 0.8)

        // Progress survives a restart of the service (e.g. app relaunch).
        let relaunched = ActivityBackfillService(source: source, container: container, defaults: defaults)
        #expect(relaunched.state.nextPage == 2)
        await relaunched.run()

        #expect(relaunched.phase == .completed)
        #expect(relaunched.state.importedCount == 250)
        #expect(source.requestedPages == [1, 2, 2])
        let stored = try container.mainContext.fetch(FetchDescriptor<ActivityRecord>())
        #expect(stored.count == 250)
        #expect(stored.allSatisfy { $0.elevationMeters == 250 })
    }

    @Test func keepsExactCaloriesOfKnownActivities() async throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = container.mainContext
        let known = ActivityRecord(
            source: .strava,
            externalID: "7",
            name: "Old name",
            activityType: "Ride",
            startDate: day(2020, 1, 1),
            durationSeconds: 100,
            activeCalories: 777,
            caloriesEstimated: false,
            detailsComplete: true
        )
        context.insert(known)
        try context.save()

        let source = FakeHistorySource(pages: [Self.activities(10)])
        let backfill = ActivityBackfillService(source: source, container: container, defaults: makeDefaults())
        await backfill.start().value

        #expect(backfill.phase == .completed)
        let records = try context.fetch(FetchDescriptor<ActivityRecord>())
        #expect(records.count == 10)
        #expect(known.activeCalories == 777)
        #expect(known.name == "Ride 7")
        #expect(known.elevationMeters == 250)
    }

    @Test func classifiesStatsSports() {
        #expect(StatsSport.classify(activityType: "VirtualRide", isIndoor: true) == .indoorRide)
        #expect(StatsSport.classify(activityType: "Ride", isIndoor: true) == .indoorRide)
        #expect(StatsSport.classify(activityType: "GravelRide", isIndoor: false) == .ride)
        #expect(StatsSport.classify(activityType: "TrailRun", isIndoor: false) == .run)
        #expect(StatsSport.classify(activityType: "Hike", isIndoor: false) == .other)
    }

    @Test func syncCatchesUpAfterLongBreaks() {
        let now = Date.now
        let standard = ActivitySyncService.syncStartDate(now: now)
        #expect(ActivitySyncService.fetchStartDate(lastSync: nil, now: now) == standard)
        #expect(ActivitySyncService.fetchStartDate(lastSync: now, now: now) == standard)
        let longAgo = now.addingTimeInterval(-30 * 86_400)
        #expect(ActivitySyncService.fetchStartDate(lastSync: longAgo, now: now) == longAgo.addingTimeInterval(-2 * 86_400))
        let veryLongAgo = now.addingTimeInterval(-400 * 86_400)
        #expect(ActivitySyncService.fetchStartDate(lastSync: veryLongAgo, now: now) == now.addingTimeInterval(-60 * 86_400))
    }

    @Test func decodesElevationAndTrainerFlag() throws {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        let json = """
        [{"id":1,"name":"Zwift","type":"VirtualRide","sport_type":"VirtualRide","start_date":"2025-11-17T18:00:00Z",
          "moving_time":3600,"distance":35000,"total_elevation_gain":420,"trainer":false},
         {"id":2,"name":"Trainer","type":"Ride","sport_type":"Ride","start_date":"2025-11-18T18:00:00Z",
          "moving_time":3600,"distance":30000,"total_elevation_gain":0,"trainer":true}]
        """
        let summaries = try decoder.decode([StravaSummaryActivity].self, from: Data(json.utf8))
        let imported = summaries.map { $0.imported(calories: nil, detailsComplete: true) }
        #expect(imported[0].elevationMeters == 420)
        #expect(imported[0].isIndoor)
        #expect(imported[1].isIndoor)
    }
}
