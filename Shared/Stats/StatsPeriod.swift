import Foundation

/// Period selector of the Stats tab.
enum StatsPeriodKind: String, CaseIterable, Identifiable, Sendable {
    case week
    case month
    case year
    case all

    var id: String { rawValue }

    var title: String {
        switch self {
        case .week: "Week"
        case .month: "Month"
        case .year: "Year"
        case .all: "All Time"
        }
    }
}

/// Granularity of chart buckets.
enum StatsBucket: Sendable {
    case day
    case week
    case month
    case year

    var component: Calendar.Component {
        switch self {
        case .day: .day
        case .week: .weekOfYear
        case .month: .month
        case .year: .year
        }
    }
}

/// A period in a selected year. Week and month are the ones containing the
/// reference date: today for the current year, otherwise the last day of that year.
struct StatsPeriod: Hashable, Sendable {
    var kind: StatsPeriodKind
    var year: Int

    static func current(_ kind: StatsPeriodKind, now: Date = .now, calendar: Calendar) -> StatsPeriod {
        StatsPeriod(kind: kind, year: calendar.component(.year, from: now))
    }

    func referenceDate(now: Date, calendar: Calendar) -> Date {
        let currentYear = calendar.component(.year, from: now)
        guard year < currentYear,
              let nextYear = calendar.date(from: DateComponents(year: year + 1, month: 1, day: 1))
        else { return now }
        return nextYear.addingTimeInterval(-1)
    }

    /// Full calendar interval of the period (the current week/month/year includes
    /// future days, which simply have no data).
    func interval(now: Date, calendar: Calendar, earliest: Date? = nil) -> DateInterval {
        let reference = referenceDate(now: now, calendar: calendar)
        let fallback = DateInterval(start: calendar.startOfDay(for: reference), duration: 86_400)
        switch kind {
        case .week:
            return calendar.dateInterval(of: .weekOfYear, for: reference) ?? fallback
        case .month:
            return calendar.dateInterval(of: .month, for: reference) ?? fallback
        case .year:
            return calendar.dateInterval(of: .year, for: reference) ?? fallback
        case .all:
            let end = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
            let start = earliest.map { calendar.startOfDay(for: $0) } ?? calendar.startOfDay(for: now)
            return DateInterval(start: min(start, end), end: end)
        }
    }

    /// The same period one year earlier (for year-over-year comparisons).
    var previousYear: StatsPeriod { StatsPeriod(kind: kind, year: year - 1) }

    /// Main and secondary chart granularity.
    var buckets: (primary: StatsBucket, secondary: StatsBucket?) {
        switch kind {
        case .week: (.day, nil)
        case .month: (.day, .week)
        case .year: (.week, .month)
        case .all: (.month, .year)
        }
    }

    func title(now: Date = .now, calendar: Calendar) -> String {
        let interval = interval(now: now, calendar: calendar)
        switch kind {
        case .week:
            let end = interval.end.addingTimeInterval(-1)
            return "\(interval.start.formatted(.dateTime.day().month(.abbreviated))) – \(end.formatted(.dateTime.day().month(.abbreviated).year()))"
        case .month:
            return interval.start.formatted(.dateTime.month(.wide).year())
        case .year:
            return year == calendar.component(.year, from: now) ? "\(year) to date" : String(year)
        case .all:
            return "All Time"
        }
    }
}

/// Splits an interval into chart buckets.
enum StatsBuckets {
    /// Start dates of all buckets that intersect `interval`, in order.
    static func starts(of bucket: StatsBucket, in interval: DateInterval, calendar: Calendar) -> [Date] {
        guard let first = calendar.dateInterval(of: bucket.component, for: interval.start)?.start else { return [] }
        var starts: [Date] = []
        var cursor = first
        while cursor < interval.end, starts.count < 5_000 {
            starts.append(cursor)
            guard let next = calendar.date(byAdding: bucket.component, value: 1, to: cursor) else { break }
            cursor = next
        }
        return starts
    }

    /// Start of the bucket containing `date`.
    static func start(of bucket: StatsBucket, containing date: Date, calendar: Calendar) -> Date {
        calendar.dateInterval(of: bucket.component, for: date)?.start ?? calendar.startOfDay(for: date)
    }
}
