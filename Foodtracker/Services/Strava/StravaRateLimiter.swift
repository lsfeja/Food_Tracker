import Foundation

/// Client-side guard for Strava's read rate limits (100 requests / 15 min,
/// 1,000 / day by default). The 15-minute windows start at :00/:15/:30/:45; the daily
/// limit resets at midnight UTC.
///
/// Counts its own requests (persisted across launches) and also trusts the usage
/// Strava reports in `X-ReadRateLimit-Usage` / `X-RateLimit-Usage` headers.
actor StravaRateLimiter {
    private let defaults: UserDefaults
    private static let storageKey = "strava.requestLog"
    /// Requests kept in reserve, e.g. for a manual refresh.
    private let margin = 5

    private var requestLog: [Date]
    private var blockedUntil: Date?
    private var reportedShort: (count: Int, window: Date)?
    private var reportedDaily: (count: Int, day: Date)?
    private var shortLimit = 100
    private var dailyLimit = 1000

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.array(forKey: Self.storageKey) as? [Double] ?? []
        requestLog = stored.map { Date(timeIntervalSince1970: $0) }
    }

    static func windowStart(for date: Date) -> Date {
        Date(timeIntervalSince1970: (date.timeIntervalSince1970 / 900).rounded(.down) * 900)
    }

    static func dayStart(for date: Date) -> Date {
        Date(timeIntervalSince1970: (date.timeIntervalSince1970 / 86_400).rounded(.down) * 86_400)
    }

    /// Parses "a,b" header values.
    static func parsePair(_ header: String?) -> (Int, Int)? {
        guard let parts = header?.split(separator: ",").map({ $0.trimmingCharacters(in: .whitespaces) }),
              parts.count == 2, let first = Int(parts[0]), let second = Int(parts[1])
        else { return nil }
        return (first, second)
    }

    /// Reserves one request or throws `StravaError.rateLimited`.
    func reserve(now: Date = .now) throws {
        if let blockedUntil, now < blockedUntil {
            throw StravaError.rateLimited(until: blockedUntil)
        }
        blockedUntil = nil

        let window = Self.windowStart(for: now)
        let day = Self.dayStart(for: now)
        requestLog.removeAll { $0 < day }

        var shortCount = requestLog.filter { $0 >= window }.count
        var dailyCount = requestLog.count
        if let reportedShort, reportedShort.window == window { shortCount = max(shortCount, reportedShort.count) }
        if let reportedDaily, reportedDaily.day == day { dailyCount = max(dailyCount, reportedDaily.count) }

        if shortCount >= shortLimit - margin {
            let until = window.addingTimeInterval(900)
            blockedUntil = until
            throw StravaError.rateLimited(until: until)
        }
        if dailyCount >= dailyLimit - margin {
            let until = day.addingTimeInterval(86_400)
            blockedUntil = until
            throw StravaError.rateLimited(until: until)
        }

        requestLog.append(now)
        defaults.set(requestLog.map(\.timeIntervalSince1970), forKey: Self.storageKey)
    }

    /// Updates state from response headers.
    func record(usage: String?, limit: String?, status: Int, now: Date = .now) {
        let window = Self.windowStart(for: now)
        let day = Self.dayStart(for: now)
        if let used = Self.parsePair(usage) {
            reportedShort = (count: used.0, window: window)
            reportedDaily = (count: used.1, day: day)
        }
        if let limits = Self.parsePair(limit), limits.0 > 0, limits.1 > 0 {
            shortLimit = limits.0
            dailyLimit = limits.1
        }
        if status == 429 {
            let dailyExhausted = (reportedDaily?.count ?? 0) >= dailyLimit
            blockedUntil = dailyExhausted ? day.addingTimeInterval(86_400) : window.addingTimeInterval(900)
        }
    }

    func currentBlock(now: Date = .now) -> Date? {
        guard let blockedUntil, blockedUntil > now else { return nil }
        return blockedUntil
    }
}
