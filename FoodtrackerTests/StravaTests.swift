import Foundation
import Testing
@testable import Foodtracker

struct StravaTests {
    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    @Test func decodesTokenResponse() throws {
        let json = """
        {"token_type":"Bearer","expires_at":1731945600,"expires_in":21600,
         "refresh_token":"r1","access_token":"a1",
         "athlete":{"id":42,"firstname":"Alex","lastname":"Muster"}}
        """
        let response = try decoder.decode(StravaTokenResponse.self, from: Data(json.utf8))
        let tokens = StravaTokens(response: response, scope: "read,activity:read_all", previous: nil)
        #expect(tokens.accessToken == "a1")
        #expect(tokens.refreshToken == "r1")
        #expect(tokens.expiresAt == Date(timeIntervalSince1970: 1_731_945_600))
        #expect(tokens.athleteID == 42)
        #expect(tokens.athleteName == "Alex Muster")
    }

    @Test func refreshKeepsAthleteInfo() throws {
        let previous = StravaTokens(accessToken: "old", refreshToken: "r0", expiresAt: .now, scope: "activity:read_all", athleteID: 7, athleteName: "Sam")
        let json = #"{"access_token":"new","refresh_token":"r1","expires_at":1731945600}"#
        let response = try decoder.decode(StravaTokenResponse.self, from: Data(json.utf8))
        let tokens = StravaTokens(response: response, scope: previous.scope, previous: previous)
        #expect(tokens.accessToken == "new")
        #expect(tokens.athleteID == 7)
        #expect(tokens.athleteName == "Sam")
    }

    @Test func decodesSummaryActivity() throws {
        let json = """
        [{"id":12345678987654321,"name":"Morning Ride","type":"Ride","sport_type":"MountainBikeRide",
          "start_date":"2025-11-17T07:30:00Z","start_date_local":"2025-11-17T08:30:00Z",
          "elapsed_time":4000,"moving_time":3600,"kilojoules":812.5,"distance":30000.0}]
        """
        let activities = try decoder.decode([StravaSummaryActivity].self, from: Data(json.utf8))
        let imported = try #require(activities.first).imported(calories: nil, detailsComplete: false)
        #expect(imported.externalID == "12345678987654321")
        #expect(imported.type == "MountainBikeRide")
        #expect(imported.durationSeconds == 3600)
        #expect(imported.activeCalories == 813)
        #expect(imported.caloriesEstimated)
        #expect(imported.detailsComplete == false)
    }

    @Test func prefersReportedCalories() {
        let reported = StravaCalories.resolve(reported: 650.4, kilojoules: 812)
        #expect(reported.kcal == 650)
        #expect(reported.estimated == false)

        let fromWork = StravaCalories.resolve(reported: 0, kilojoules: 812)
        #expect(fromWork.kcal == 812)
        #expect(fromWork.estimated)

        let none = StravaCalories.resolve(reported: nil, kilojoules: nil)
        #expect(none.kcal == 0)
        #expect(none.estimated == false)
    }

    @Test func authorizeURLContainsClientScopeAndRedirect() {
        let authorizeURL = StravaConfiguration(clientID: "298532", clientSecret: "s").authorizeURL.absoluteString
        #expect(authorizeURL.contains("client_id=298532"))
        #expect(authorizeURL.contains("scope=activity:read_all"))
        #expect(authorizeURL.contains("redirect_uri=foodtracker://foodtracker"))
    }

    @Test func rateLimiterBlocksBeforeShortTermLimit() async throws {
        let defaults = UserDefaults(suiteName: "StravaTests-\(UUID().uuidString)")!
        let limiter = StravaRateLimiter(defaults: defaults)
        // 12:00:00 UTC is the start of a 15-minute window.
        let start = Date(timeIntervalSince1970: 1_763_380_800)
        for index in 0..<95 {
            try await limiter.reserve(now: start.addingTimeInterval(Double(index)))
        }
        await #expect(throws: StravaError.rateLimited(until: start.addingTimeInterval(900))) {
            try await limiter.reserve(now: start.addingTimeInterval(100))
        }
        // Next window is free again.
        try await limiter.reserve(now: start.addingTimeInterval(901))
    }

    @Test func rateLimiterHonorsReportedUsage() async throws {
        let defaults = UserDefaults(suiteName: "StravaTests-\(UUID().uuidString)")!
        let limiter = StravaRateLimiter(defaults: defaults)
        let now = Date(timeIntervalSince1970: 1_763_380_800)
        await limiter.record(usage: "97,300", limit: "100,1000", status: 200, now: now)
        await #expect(throws: StravaError.self) {
            try await limiter.reserve(now: now.addingTimeInterval(10))
        }
    }

    @Test func rateLimiterParsesHeaderPairs() {
        let pair = StravaRateLimiter.parsePair("12, 340")
        #expect(pair?.0 == 12)
        #expect(pair?.1 == 340)
        #expect(StravaRateLimiter.parsePair("abc") == nil)
        #expect(StravaRateLimiter.parsePair(nil) == nil)
    }

    @Test func syncWindowCoversCurrentWeek() {
        let start = ActivitySyncService.syncStartDate()
        let weekStart = BudgetCalculator.week(containing: .now).start
        #expect(start <= weekStart)
        #expect(Date.now.timeIntervalSince(start) <= Double(ActivitySyncService.lookbackDays + 7) * 86_400)
    }
}
