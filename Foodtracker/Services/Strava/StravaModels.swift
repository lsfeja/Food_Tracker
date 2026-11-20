import Foundation

/// App credentials from `Config/Secrets.xcconfig` (via Info.plist).
struct StravaConfiguration: Sendable {
    let clientID: String
    let clientSecret: String

    static let redirectURI = "foodtracker://foodtracker"
    static let callbackScheme = "foodtracker"
    static let scope = "activity:read_all"

    /// `nil` if the credentials are missing or still placeholders.
    static func fromBundle(_ bundle: Bundle = .main) -> StravaConfiguration? {
        func value(_ key: String) -> String {
            ((bundle.object(forInfoDictionaryKey: key) as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let clientID = value("StravaClientID")
        let clientSecret = value("StravaClientSecret")
        let isPlaceholder = { (string: String) in
            string.isEmpty || string.contains("$(") || string.uppercased().hasPrefix("YOUR_")
        }
        guard !isPlaceholder(clientID), !isPlaceholder(clientSecret) else { return nil }
        return StravaConfiguration(clientID: clientID, clientSecret: clientSecret)
    }

    var authorizeURL: URL {
        var components = URLComponents(string: "https://www.strava.com/oauth/mobile/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: Self.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "approval_prompt", value: "auto"),
            URLQueryItem(name: "scope", value: Self.scope),
        ]
        return components.url!
    }
}

/// OAuth tokens, stored as JSON in the Keychain.
struct StravaTokens: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var scope: String
    var athleteID: Int?
    var athleteName: String?

    init(accessToken: String, refreshToken: String, expiresAt: Date, scope: String, athleteID: Int? = nil, athleteName: String? = nil) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.scope = scope
        self.athleteID = athleteID
        self.athleteName = athleteName
    }

    /// Builds tokens from a token response, keeping athlete info from `previous`
    /// (refresh responses don't include the athlete).
    init(response: StravaTokenResponse, scope: String, previous: StravaTokens?) {
        let name = [response.athlete?.firstname, response.athlete?.lastname]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        self.init(
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            expiresAt: Date(timeIntervalSince1970: TimeInterval(response.expiresAt)),
            scope: scope,
            athleteID: response.athlete?.id ?? previous?.athleteID,
            athleteName: name.isEmpty ? previous?.athleteName : name
        )
    }
}

/// Errors that tell callers when to retry (e.g. rate limits).
protocol RetryAfterError: Error {
    var retryDate: Date? { get }
}

enum StravaError: LocalizedError, Equatable, RetryAfterError {
    case notConfigured
    case notConnected
    case missingScope
    case authorizationFailed(String)
    case rateLimited(until: Date)
    case http(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            "Strava isn't configured. Add your client ID and secret to Config/Secrets.xcconfig."
        case .notConnected:
            "Strava is not connected. Please connect again in Settings."
        case .missingScope:
            "Foodtracker needs permission to read your activities. Please connect again and allow activity access."
        case .authorizationFailed(let reason):
            "Strava login failed: \(reason)"
        case .rateLimited(let until):
            "Strava's request limit was reached. Try again \(until.formatted(.relative(presentation: .named)))."
        case .http(let status):
            "Strava returned an error (HTTP \(status))."
        }
    }
}

extension StravaError {
    var retryDate: Date? {
        if case .rateLimited(let until) = self { return until }
        return nil
    }
}

// MARK: - API responses (decoded with .convertFromSnakeCase and .iso8601 dates)

struct StravaTokenResponse: Decodable, Sendable {
    struct Athlete: Decodable, Sendable {
        let id: Int
        let firstname: String?
        let lastname: String?
    }

    let accessToken: String
    let refreshToken: String
    let expiresAt: Int
    let athlete: Athlete?
}

struct StravaSummaryActivity: Decodable, Sendable {
    let id: Int64
    let name: String?
    let type: String?
    let sportType: String?
    let startDate: Date
    let elapsedTime: Double?
    let movingTime: Double?
    /// Meters.
    let distance: Double?
    /// Meters.
    let totalElevationGain: Double?
    /// Indoor trainer activity.
    let trainer: Bool?
    /// Only for rides with power data.
    let kilojoules: Double?
}

struct StravaAthleteStats: Decodable, Sendable {
    struct Totals: Decodable, Sendable {
        let count: Int?
    }

    let allRideTotals: Totals?
    let allRunTotals: Totals?
    let allSwimTotals: Totals?

    var totalCount: Int {
        [allRideTotals, allRunTotals, allSwimTotals].compactMap { $0?.count }.reduce(0, +)
    }
}

struct StravaDetailedActivity: Decodable, Sendable {
    let id: Int64
    let calories: Double?
    let kilojoules: Double?
}

enum StravaCalories {
    /// Picks the best calorie value: reported calories, else an estimate from
    /// mechanical work (≈ 1 kcal per kJ at ~24 % efficiency), else 0.
    static func resolve(reported: Double?, kilojoules: Double?) -> (kcal: Double, estimated: Bool) {
        if let reported, reported > 0 { return (reported.rounded(), false) }
        if let kilojoules, kilojoules > 0 { return (kilojoules.rounded(), true) }
        return (0, false)
    }
}

extension StravaSummaryActivity {
    func imported(calories: Double?, detailsComplete: Bool) -> ImportedActivity {
        let resolved = StravaCalories.resolve(reported: calories, kilojoules: kilojoules)
        return ImportedActivity(
            externalID: String(id),
            name: name ?? "Activity",
            type: sportType ?? type ?? "Workout",
            startDate: startDate,
            durationSeconds: movingTime ?? elapsedTime ?? 0,
            distanceMeters: distance ?? 0,
            elevationMeters: totalElevationGain ?? 0,
            isIndoor: (trainer ?? false) || (sportType ?? type) == "VirtualRide" || (sportType ?? type) == "VirtualRun",
            activeCalories: resolved.kcal,
            caloriesEstimated: resolved.estimated,
            detailsComplete: detailsComplete
        )
    }
}
