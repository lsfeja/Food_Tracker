import AppIntents
import Charts
import SwiftData
import SwiftUI
import WidgetKit

extension StatsSportFilter: AppEnum {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Sport"

    static let caseDisplayRepresentations: [StatsSportFilter: DisplayRepresentation] = [
        .all: "All Sports",
        .cycling: "Cycling",
        .ride: "Outdoor Ride",
        .indoorRide: "Indoor Ride",
        .run: "Run",
        .swim: "Swim",
        .other: "Other",
    ]
}

struct StatsWidgetConfiguration: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Year to Date"
    static let description = IntentDescription("Distance this year and progress toward your yearly goal.")

    @Parameter(title: "Sport", default: .cycling)
    var sport: StatsSportFilter

    init() {}
}

struct StatsEntry: TimelineEntry {
    let date: Date
    let sport: StatsSportFilter
    let year: Int
    let totals: EnduranceTotals
    let lastYearToDateKm: Double
    let goal: GoalProgress?
    /// km per month of the current year.
    let months: [VolumeBucket]

    static func placeholder(sport: StatsSportFilter = .cycling, date: Date = .now) -> StatsEntry {
        StatsEntry(
            date: date,
            sport: sport,
            year: Calendar.current.component(.year, from: date),
            totals: EnduranceTotals(distanceMeters: 4_210_000, movingSeconds: 180 * 3600, elevationMeters: 38_000, count: 142),
            lastYearToDateKm: 3_890,
            goal: GoalProgress(target: 8000, actual: 4210, expected: 4000, projected: 8400),
            months: []
        )
    }
}

struct StatsProvider: AppIntentTimelineProvider {
    private static let container: ModelContainer? = try? SharedModelContainer.make()

    func placeholder(in context: Context) -> StatsEntry {
        .placeholder()
    }

    func snapshot(for configuration: StatsWidgetConfiguration, in context: Context) async -> StatsEntry {
        context.isPreview ? .placeholder(sport: configuration.sport) : entry(for: configuration.sport, now: .now)
    }

    func timeline(for configuration: StatsWidgetConfiguration, in context: Context) async -> Timeline<StatsEntry> {
        let now = Date.now
        let calendar = BudgetCalculator.weekCalendar
        // The "on track" judgement depends on the date: refresh daily (and whenever the
        // app reloads timelines after a sync).
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now.addingTimeInterval(3600)
        return Timeline(entries: [entry(for: configuration.sport, now: now)], policy: .after(midnight))
    }

    private func entry(for sport: StatsSportFilter, now: Date) -> StatsEntry {
        let calendar = BudgetCalculator.weekCalendar
        let year = calendar.component(.year, from: now)
        guard let container = Self.container,
              let yearStart = calendar.date(from: DateComponents(year: year, month: 1, day: 1)),
              let lastYearStart = calendar.date(byAdding: .year, value: -1, to: yearStart),
              let lastYearSameDay = calendar.date(byAdding: .year, value: -1, to: now)
        else {
            return StatsEntry(date: now, sport: sport, year: year, totals: EnduranceTotals(), lastYearToDateKm: 0, goal: nil, months: [])
        }

        let context = ModelContext(container)
        let descriptor = FetchDescriptor<ActivityRecord>(predicate: #Predicate<ActivityRecord> { $0.startDate >= lastYearStart })
        let snapshots = ((try? context.fetch(descriptor)) ?? [])
            .map(ActivitySnapshot.init(record:))
            .filter { sport.matches($0.sport) }

        let report = EnduranceStats.report(
            activities: snapshots,
            filter: sport,
            period: StatsPeriod(kind: .year, year: year),
            now: now,
            calendar: calendar
        )
        let lastYearKm = snapshots
            .filter { $0.start >= lastYearStart && $0.start <= lastYearSameDay }
            .reduce(0) { $0 + $1.distanceMeters } / 1000

        let raw = sport.rawValue
        let goalDescriptor = FetchDescriptor<YearlyGoal>(predicate: #Predicate<YearlyGoal> { $0.year == year && $0.sportRaw == raw })
        let goal = (try? context.fetch(goalDescriptor))?.first
        let progress = goal?.distanceKm.flatMap { target in
            target > 0
                ? EnduranceStats.goalProgress(target: target, actual: report.totals.distanceKm, year: year, now: now, calendar: calendar)
                : nil
        }

        return StatsEntry(
            date: now,
            sport: sport,
            year: year,
            totals: report.totals,
            lastYearToDateKm: lastYearKm,
            goal: progress,
            months: report.secondary
        )
    }
}

/// Year-to-date distance per sport with goal progress (Home Screen).
struct StatsWidget: Widget {
    static let kind = "StatsWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Self.kind, intent: StatsWidgetConfiguration.self, provider: StatsProvider()) { entry in
            StatsWidgetView(entry: entry)
                .containerBackground(for: .widget) { Color("WidgetBackground") }
                .widgetURL(DeepLink.stats.url)
        }
        .configurationDisplayName("Year to Date")
        .description("Distance this year and progress toward your yearly goal.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct StatsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StatsEntry

    var body: some View {
        switch family {
        case .systemMedium:
            HStack(spacing: 16) {
                summary
                    .frame(maxWidth: .infinity, alignment: .leading)
                monthChart
                    .frame(maxWidth: .infinity)
            }
        default:
            summary
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: entry.sport.systemImage)
                    .foregroundStyle(Color.accentColor)
                Text("\(entry.sport.displayName) \(String(entry.year))")
                    .lineLimit(1)
            }
            .font(.caption.weight(.semibold))

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(Format.distanceValue(km: entry.totals.distanceKm))
                    .font(.system(.title, design: .rounded).weight(.bold))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("km")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let goal = entry.goal {
                ProgressView(value: goal.fraction)
                    .tint(goal.status == .behind ? Color.orange : Color.accentColor)
                Text(goalText(goal))
                    .font(.caption2)
                    .foregroundStyle(goal.status == .behind ? Color.orange : Color.secondary)
                    .lineLimit(1)
            } else {
                Text("\(Format.hoursValue(seconds: entry.totals.movingSeconds)) h · \(entry.totals.count) activities")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Text(lastYearText)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var monthChart: some View {
        if entry.months.isEmpty {
            Text("No data yet")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else {
            Chart(entry.months) { month in
                BarMark(
                    x: .value("Month", month.start, unit: .month),
                    y: .value("km", month.totals.distanceKm)
                )
                .foregroundStyle(Color.accentColor)
                .cornerRadius(2)
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .month, count: 3)) { _ in
                    AxisValueLabel(format: .dateTime.month(.narrow))
                }
            }
            .chartYAxis(.hidden)
        }
    }

    private func goalText(_ goal: GoalProgress) -> String {
        let percent = Int((goal.fraction * 100).rounded())
        switch goal.status {
        case .reached: return "Goal reached · \(Format.distanceValue(km: goal.target)) km"
        case .onTrack: return "\(percent) % of \(Format.distanceValue(km: goal.target)) · on track"
        case .behind: return "\(percent) % of \(Format.distanceValue(km: goal.target)) · behind"
        }
    }

    private var lastYearText: String {
        let delta = entry.totals.distanceKm - entry.lastYearToDateKm
        let sign = delta >= 0 ? "+" : "−"
        return "\(sign)\(Format.distanceValue(km: abs(delta))) km vs. last year"
    }
}
