import Foundation

/// Strava API v3 client: token exchange/refresh (tokens in the Keychain) and
/// rate-limited GET requests. Concurrent refreshes are coalesced.
actor StravaAPIClient {
    static let tokenAccount = "tokens"

    private let configuration: StravaConfiguration
    private let keychain: KeychainStore
    private let session: URLSession
    private let rateLimiter: StravaRateLimiter
    private var refreshTask: Task<StravaTokens, Error>?

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    init(
        configuration: StravaConfiguration,
        keychain: KeychainStore,
        session: URLSession = .shared,
        rateLimiter: StravaRateLimiter = StravaRateLimiter()
    ) {
        self.configuration = configuration
        self.keychain = keychain
        self.session = session
        self.rateLimiter = rateLimiter
    }

    // MARK: - Tokens

    func storedTokens() -> StravaTokens? {
        try? keychain.value(StravaTokens.self, for: Self.tokenAccount)
    }

    /// Exchanges the OAuth authorization code for tokens and stores them.
    func exchange(code: String, scope: String) async throws -> StravaTokens {
        let response = try await tokenRequest([
            "code": code,
            "grant_type": "authorization_code",
        ])
        let tokens = StravaTokens(response: response, scope: scope, previous: nil)
        try keychain.setValue(tokens, for: Self.tokenAccount)
        return tokens
    }

    /// A non-expired access token, refreshing it if necessary.
    func validAccessToken() async throws -> String {
        guard let tokens = storedTokens() else { throw StravaError.notConnected }
        if tokens.expiresAt.timeIntervalSinceNow > 120 {
            return tokens.accessToken
        }
        return try await refreshedTokens(from: tokens).accessToken
    }

    /// Revokes access at Strava (best effort) and removes local tokens.
    func deauthorize() async {
        if let tokens = storedTokens(), let url = URL(string: "https://www.strava.com/oauth/deauthorize") {
            var request = URLRequest(url: url, timeoutInterval: 15)
            request.httpMethod = "POST"
            request.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
            _ = try? await session.data(for: request)
        }
        try? keychain.delete(Self.tokenAccount)
    }

    private func refreshedTokens(from current: StravaTokens) async throws -> StravaTokens {
        if let refreshTask {
            return try await refreshTask.value
        }
        let task = Task { try await self.performRefresh(current) }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func performRefresh(_ current: StravaTokens) async throws -> StravaTokens {
        do {
            let response = try await tokenRequest([
                "refresh_token": current.refreshToken,
                "grant_type": "refresh_token",
            ])
            let tokens = StravaTokens(response: response, scope: current.scope, previous: current)
            try keychain.setValue(tokens, for: Self.tokenAccount)
            return tokens
        } catch StravaError.http(let status) where status == 400 || status == 401 {
            // The refresh token was revoked (e.g. app access removed on strava.com).
            try? keychain.delete(Self.tokenAccount)
            throw StravaError.notConnected
        }
    }

    private func tokenRequest(_ parameters: [String: String]) async throws -> StravaTokenResponse {
        guard let url = URL(string: "https://www.strava.com/oauth/token") else { throw StravaError.http(0) }
        var allParameters = parameters
        allParameters["client_id"] = configuration.clientID
        allParameters["client_secret"] = configuration.clientSecret

        var form = URLComponents()
        form.queryItems = allParameters
            .sorted { $0.key < $1.key }
            .map { URLQueryItem(name: $0.key, value: $0.value) }

        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = form.percentEncodedQuery?.data(using: .utf8)

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw StravaError.http(status) }
        return try Self.decoder.decode(StravaTokenResponse.self, from: data)
    }

    // MARK: - API

    /// Activities that started after `after` (one page).
    func activities(after: Date, page: Int, perPage: Int) async throws -> [StravaSummaryActivity] {
        try await activities(before: nil, after: after, page: page, perPage: perPage)
    }

    /// One page of activities in a time window (`per_page` max. 200).
    func activities(before: Date?, after: Date?, page: Int, perPage: Int) async throws -> [StravaSummaryActivity] {
        var query = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "per_page", value: String(min(perPage, 200))),
        ]
        if let before { query.append(URLQueryItem(name: "before", value: String(Int(before.timeIntervalSince1970)))) }
        if let after { query.append(URLQueryItem(name: "after", value: String(Int(after.timeIntervalSince1970)))) }
        return try await get("athlete/activities", query: query)
    }

    /// Lifetime activity counts (ride + run + swim; other sports aren't reported).
    func athleteActivityCount() async throws -> Int? {
        guard let athleteID = storedTokens()?.athleteID else { return nil }
        let stats: StravaAthleteStats = try await get("athletes/\(athleteID)/stats", query: [])
        return stats.totalCount
    }

    /// Detailed activity (includes `calories`).
    func activity(id: Int64) async throws -> StravaDetailedActivity {
        try await get("activities/\(id)", query: [
            URLQueryItem(name: "include_all_efforts", value: "false"),
        ])
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem]) async throws -> T {
        guard var components = URLComponents(string: "https://www.strava.com/api/v3/\(path)") else {
            throw StravaError.http(0)
        }
        components.queryItems = query
        guard let url = components.url else { throw StravaError.http(0) }

        try await rateLimiter.reserve()
        let token = try await validAccessToken()
        var (data, response) = try await send(url: url, token: token)

        if response.statusCode == 401, let current = storedTokens() {
            // Token rejected although not expired: refresh once and retry.
            let refreshed = try await refreshedTokens(from: current)
            try await rateLimiter.reserve()
            (data, response) = try await send(url: url, token: refreshed.accessToken)
        }

        await rateLimiter.record(
            usage: response.value(forHTTPHeaderField: "X-ReadRateLimit-Usage")
                ?? response.value(forHTTPHeaderField: "X-RateLimit-Usage"),
            limit: response.value(forHTTPHeaderField: "X-ReadRateLimit-Limit")
                ?? response.value(forHTTPHeaderField: "X-RateLimit-Limit"),
            status: response.statusCode
        )

        switch response.statusCode {
        case 200..<300:
            return try Self.decoder.decode(T.self, from: data)
        case 401:
            throw StravaError.notConnected
        case 429:
            let until = await rateLimiter.currentBlock() ?? Date.now.addingTimeInterval(900)
            throw StravaError.rateLimited(until: until)
        default:
            throw StravaError.http(response.statusCode)
        }
    }

    private func send(url: URL, token: String) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw StravaError.http(0) }
        return (data, http)
    }
}
