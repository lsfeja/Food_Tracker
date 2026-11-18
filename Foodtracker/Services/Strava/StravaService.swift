import Foundation
import Observation
import OSLog

/// Strava connection state for the UI and the `ActivitySource` implementation.
@MainActor
@Observable
final class StravaService: ActivitySource {
    let kind: ActivitySourceKind = .strava

    private(set) var isConnected: Bool
    private(set) var athleteName: String?
    private(set) var isConnecting = false

    @ObservationIgnored let configuration: StravaConfiguration?
    @ObservationIgnored private let client: StravaAPIClient?
    @ObservationIgnored private let authenticator = StravaAuthenticator()
    @ObservationIgnored private let logger = Logger(subsystem: "Foodtracker", category: "Strava")

    /// Max. pages of 100 activities per sync (the lookback window is short).
    private static let maxPages = 3

    var isConfigured: Bool { configuration != nil }

    init(
        configuration: StravaConfiguration? = .fromBundle(),
        keychain: KeychainStore = KeychainStore(service: "Foodtracker.Strava")
    ) {
        self.configuration = configuration
        self.client = configuration.map { StravaAPIClient(configuration: $0, keychain: keychain) }
        let tokens: StravaTokens? = try? keychain.value(StravaTokens.self, for: StravaAPIClient.tokenAccount)
        self.isConnected = configuration != nil && tokens != nil
        self.athleteName = tokens?.athleteName
    }

    // MARK: - Connection

    /// OAuth login. Throws `CancellationError` if the user cancels.
    func connect() async throws {
        guard let configuration, let client else { throw StravaError.notConfigured }
        isConnecting = true
        defer { isConnecting = false }

        let callback = try await authenticator.authorize(
            url: configuration.authorizeURL,
            callbackScheme: StravaConfiguration.callbackScheme
        )
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func item(_ name: String) -> String? { items.first { $0.name == name }?.value }

        if let error = item("error") {
            throw StravaError.authorizationFailed(error == "access_denied" ? "Access was denied." : error)
        }
        guard let code = item("code") else {
            throw StravaError.authorizationFailed("No authorization code received.")
        }
        let scope = item("scope") ?? ""
        guard scope.contains("activity:read") else { throw StravaError.missingScope }

        let tokens = try await client.exchange(code: code, scope: scope)
        isConnected = true
        athleteName = tokens.athleteName
    }

    func disconnect() async {
        await client?.deauthorize()
        isConnected = false
        athleteName = nil
    }

    // MARK: - ActivitySource

    func fetchActivities(since: Date, cached: [String: ImportedActivity]) async throws -> ActivityFetchResult {
        guard let client else { throw StravaError.notConfigured }

        var summaries: [StravaSummaryActivity] = []
        var listComplete = false
        do {
            for page in 1...Self.maxPages {
                let batch = try await client.activities(after: since, page: page, perPage: 100)
                summaries += batch
                if batch.count < 100 {
                    listComplete = true
                    break
                }
            }
        } catch StravaError.notConnected {
            isConnected = false
            athleteName = nil
            throw StravaError.notConnected
        }

        // Calories are only in the detailed activity: one extra request per new
        // activity. Known activities with complete details are reused from the cache.
        var activities: [ImportedActivity] = []
        var canFetchDetails = true
        for summary in summaries {
            let id = String(summary.id)
            if let known = cached[id], known.detailsComplete {
                let reported = known.caloriesEstimated ? nil : known.activeCalories
                activities.append(summary.imported(calories: reported, detailsComplete: true))
                continue
            }

            var calories: Double?
            var detailsComplete = false
            if canFetchDetails {
                do {
                    let detail = try await client.activity(id: summary.id)
                    calories = detail.calories
                    detailsComplete = true
                } catch {
                    // Rate limit or network issue: keep the summary (kJ estimate) and
                    // fetch details in a later sync.
                    logger.notice("Activity details postponed: \(error.localizedDescription, privacy: .public)")
                    canFetchDetails = false
                }
            }
            activities.append(summary.imported(calories: calories, detailsComplete: detailsComplete))
        }

        return ActivityFetchResult(activities: activities, isComplete: listComplete)
    }
}
