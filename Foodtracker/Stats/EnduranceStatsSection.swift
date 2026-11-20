import Charts
import SwiftData
import SwiftUI

/// Endurance stats from imported activities: totals, goal, volume charts,
/// year-over-year, records and indoor share.
struct EnduranceStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?

    @Environment(AppServices.self) private var services
    @Query(sort: \ActivityRecord.startDate) private var activities: [ActivityRecord]
    @Query private var goals: [YearlyGoal]

    @AppStorage("stats.sport") private var filterRaw = StatsSportFilter.all.rawValue
    @AppStorage("stats.enduranceMetric") private var metricRaw = VolumeMetric.distance.rawValue
    @State private var report: EnduranceReport?
    @State private var editingGoal = false

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ChipPicker(
                options: StatsSportFilter.allCases,
                selection: filterBinding,
                title: { $0.displayName },
                systemImage: { $0.systemImage }
            )

            if activities.isEmpty {
                importCard
            } else if let report {
                content(report)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        }
        .task(id: loadKey) {
            await load()
        }
        .sheet(isPresented: $editingGoal) {
            GoalEditor(year: period.year, filter: filter, goal: goal)
        }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ report: EnduranceReport) -> some View {
        StatsCard(title: "Totals", systemImage: filter.systemImage, trailing: period.title(calendar: calendar)) {
            MetricGrid {
                GridRow {
                    MetricTile(title: "Distance", value: Format.distanceValue(km: report.totals.distanceKm), unit: "km")
                    MetricTile(title: "Time", value: Format.hoursValue(seconds: report.totals.movingSeconds), unit: "h")
                }
                GridRow {
                    MetricTile(title: "Elevation", value: Int(report.totals.elevationMeters.rounded()).formatted(), unit: "m")
                    MetricTile(title: "Activities", value: report.totals.count.formatted())
                }
            }
        }

        if period.kind == .year || period.kind == .all {
            goalCard(report)
        }

        volumeCard(report.primary, bucket: report.primaryBucket)
        if let secondaryBucket = report.secondaryBucket, !report.secondary.isEmpty {
            volumeCard(report.secondary, bucket: secondaryBucket)
        }

        if !report.yearOverYear.isEmpty {
            YearOverYearCard(points: report.yearOverYear, year: period.year)
        }

        recordsCard(report)

        if let share = report.indoorShare {
            IndoorShareCard(share: share)
        }
    }

    private var importCard: some View {
        StatsCard(title: "No Activities Yet", systemImage: "arrow.down.circle") {
            if services.strava.isConnected {
                Text("Import your Strava history to see distance, time and elevation over the years.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button(services.backfill.state.hasStarted ? "Resume Import" : "Import Strava History") {
                    services.backfill.start()
                }
                .buttonStyle(.borderedProminent)
                .disabled(services.backfill.isRunning)
            } else {
                Text("Connect Strava in Settings (Nutrition tab › gear) to import your activities.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Goal

    @ViewBuilder
    private func goalCard(_ report: EnduranceReport) -> some View {
        let year = period.kind == .all ? calendar.component(.year, from: .now) : period.year
        if let goal, year == period.year || period.kind == .all {
            StatsCard(title: "\(String(year)) Goal", systemImage: "target", trailing: nil) {
                let yearTotals = period.kind == .year ? report.totals : yearToDateTotals(year)
                if let target = goal.distanceKm, target > 0 {
                    GoalProgressView(
                        progress: EnduranceStats.goalProgress(target: target, actual: yearTotals.distanceKm, year: year, now: .now, calendar: calendar),
                        unit: "km"
                    )
                }
                if let target = goal.hours, target > 0 {
                    GoalProgressView(
                        progress: EnduranceStats.goalProgress(target: target, actual: yearTotals.hours, year: year, now: .now, calendar: calendar),
                        unit: "h"
                    )
                }
                Button("Edit Goal") { editingGoal = true }
                    .font(.subheadline)
            }
        } else if period.kind == .year {
            Button {
                editingGoal = true
            } label: {
                Label("Set a \(String(period.year)) \(filter == .all ? "" : filter.displayName.lowercased() + " ")goal", systemImage: "target")
                    .font(.subheadline)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.accentColor)
        }
    }

    private var goal: YearlyGoal? {
        let year = period.kind == .all ? calendar.component(.year, from: .now) : period.year
        return goals.first { $0.year == year && $0.sport == filter }
    }

    private func yearToDateTotals(_ year: Int) -> EnduranceTotals {
        var totals = EnduranceTotals()
        for record in activities where calendar.component(.year, from: record.startDate) == year {
            let snapshot = ActivitySnapshot(record: record)
            if filter.matches(snapshot.sport) { totals.add(snapshot) }
        }
        return totals
    }

    // MARK: - Volume

    private func volumeCard(_ buckets: [VolumeBucket], bucket: StatsBucket) -> some View {
        StatsCard(title: volumeTitle(bucket), systemImage: "chart.bar.fill") {
            Picker("Metric", selection: metricBinding) {
                ForEach(VolumeMetric.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)

            Chart(buckets) { item in
                BarMark(
                    x: .value("Period", item.start, unit: bucket.component),
                    y: .value(metric.title, metric.value(item.totals))
                )
                .foregroundStyle(Color.accentColor)
                .cornerRadius(3)
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: axisFormat(bucket))
                }
            }
            .chartYAxisLabel(metric.unit)
            .frame(height: 180)
        }
    }

    private func volumeTitle(_ bucket: StatsBucket) -> String {
        switch bucket {
        case .day: "Daily Volume"
        case .week: "Weekly Volume"
        case .month: "Monthly Volume"
        case .year: "Yearly Volume"
        }
    }

    private func axisFormat(_ bucket: StatsBucket) -> Date.FormatStyle {
        switch bucket {
        case .day: .dateTime.day()
        case .week: .dateTime.day().month(.abbreviated)
        case .month: .dateTime.month(.narrow)
        case .year: .dateTime.year()
        }
    }

    // MARK: - Records

    @ViewBuilder
    private func recordsCard(_ report: EnduranceReport) -> some View {
        if report.longest != nil || report.bestWeek != nil {
            StatsCard(title: "Records", systemImage: "trophy") {
                VStack(spacing: 10) {
                    if let longest = report.longest {
                        RecordRow(title: "Longest", value: highlightValue(longest), detail: "\(longest.name) · \(longest.date.formatted(date: .abbreviated, time: .omitted))")
                    }
                    if let climb = report.mostElevation {
                        RecordRow(title: "Most elevation", value: "\(Int(climb.elevationMeters.rounded()).formatted()) m", detail: "\(climb.name) · \(climb.date.formatted(date: .abbreviated, time: .omitted))")
                    }
                    if let week = report.bestWeek {
                        RecordRow(title: "Best week", value: totalsValue(week.totals), detail: "Week of \(week.start.formatted(date: .abbreviated, time: .omitted))")
                    }
                    if let month = report.bestMonth {
                        RecordRow(title: "Best month", value: totalsValue(month.totals), detail: month.start.formatted(.dateTime.month(.wide).year()))
                    }
                }
            }
        }
    }

    private func highlightValue(_ highlight: ActivityHighlight) -> String {
        highlight.distanceKm > 0
            ? "\(Format.distance(km: highlight.distanceKm))"
            : Format.duration(minutes: highlight.hours * 60)
    }

    private func totalsValue(_ totals: EnduranceTotals) -> String {
        totals.distanceKm > 0
            ? "\(Format.distanceValue(km: totals.distanceKm)) km"
            : "\(Format.hoursValue(seconds: totals.movingSeconds)) h"
    }

    // MARK: - Loading

    private var filter: StatsSportFilter { StatsSportFilter(rawValue: filterRaw) ?? .all }
    private var metric: VolumeMetric { VolumeMetric(rawValue: metricRaw) ?? .distance }

    private var filterBinding: Binding<StatsSportFilter> {
        Binding(get: { filter }, set: { filterRaw = $0.rawValue })
    }

    private var metricBinding: Binding<VolumeMetric> {
        Binding(get: { metric }, set: { metricRaw = $0.rawValue })
    }

    private struct LoadKey: Hashable {
        var period: StatsPeriod
        var filter: StatsSportFilter
        var count: Int
        var latest: Date?
        var earliest: Date?
    }

    private var loadKey: LoadKey {
        LoadKey(period: period, filter: filter, count: activities.count, latest: activities.last?.updatedAt, earliest: earliest)
    }

    private func load() async {
        let snapshots = activities.map(ActivitySnapshot.init(record:))
        let period = period
        let filter = filter
        let earliest = earliest
        let calendar = calendar
        let result = await Task.detached(priority: .userInitiated) {
            EnduranceStats.report(activities: snapshots, filter: filter, period: period, now: .now, calendar: calendar, earliest: earliest)
        }.value
        guard !Task.isCancelled else { return }
        report = result
    }
}

enum VolumeMetric: String, CaseIterable, Identifiable {
    case distance
    case time

    var id: String { rawValue }
    var title: String { self == .distance ? "Distance" : "Time" }
    var unit: String { self == .distance ? "km" : "h" }

    func value(_ totals: EnduranceTotals) -> Double {
        self == .distance ? totals.distanceKm : totals.hours
    }
}

struct RecordRow: View {
    let title: String
    let value: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(value)
                .font(.headline)
                .monospacedDigit()
        }
    }
}

/// Progress bar with "on track / behind" relative to the date.
struct GoalProgressView: View {
    let progress: GoalProgress
    let unit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(Format.distanceValue(km: progress.actual)) / \(Format.distanceValue(km: progress.target)) \(unit)")
                    .font(.headline)
                    .monospacedDigit()
                Spacer()
                Text(statusText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(progress.status == .behind ? Color.orange : Color.accentColor)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(0.15))
                    Capsule().fill(progress.status == .behind ? Color.orange : Color.accentColor)
                        .frame(width: proxy.size.width * progress.fraction)
                    // Marker: where an even pace would be today.
                    Rectangle()
                        .fill(Color.primary.opacity(0.6))
                        .frame(width: 2)
                        .offset(x: proxy.size.width * min(progress.expected / max(progress.target, 1), 1) - 1)
                }
            }
            .frame(height: 10)
            Text(detailText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var statusText: String {
        switch progress.status {
        case .reached: "Reached 🎉"
        case .onTrack: "On track"
        case .behind: "Behind"
        }
    }

    private var detailText: String {
        let delta = Format.distanceValue(km: abs(progress.delta))
        let pace = "On pace for \(Format.distanceValue(km: progress.projected)) \(unit)"
        switch progress.status {
        case .reached: return pace
        case .onTrack: return "\(delta) \(unit) ahead of schedule · \(pace)"
        case .behind: return "\(delta) \(unit) behind schedule · \(pace)"
        }
    }
}

/// This year vs. last year, cumulative distance.
struct YearOverYearCard: View {
    let points: [CumulativePoint]
    let year: Int

    var body: some View {
        StatsCard(title: "\(String(year)) vs. \(String(year - 1))", systemImage: "chart.line.uptrend.xyaxis", trailing: summary) {
            Chart(points) { point in
                LineMark(
                    x: .value("Date", point.date, unit: .day),
                    y: .value("km", point.distanceKm)
                )
                .foregroundStyle(by: .value("Year", String(point.year)))
                .interpolationMethod(.monotone)
            }
            .chartForegroundStyleScale(domain: [String(year), String(year - 1)], range: [Color.accentColor, Color.secondary.opacity(0.5)])
            .chartXAxis {
                AxisMarks(values: .stride(by: .month, count: 2)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.month(.abbreviated))
                }
            }
            .chartYAxisLabel("km")
            .frame(height: 200)
        }
    }

    /// "+320 km vs. same day last year"
    private var summary: String? {
        guard let current = points.last(where: { $0.year == year }) else { return nil }
        guard let previous = points.last(where: { $0.year == year - 1 && $0.date <= current.date }) else { return nil }
        let delta = current.distanceKm - previous.distanceKm
        let sign = delta >= 0 ? "+" : "−"
        return "\(sign)\(Format.distanceValue(km: abs(delta))) km"
    }
}

/// Indoor vs. outdoor share of cycling time.
struct IndoorShareCard: View {
    let share: IndoorShare

    var body: some View {
        StatsCard(title: "Indoor vs. Outdoor", systemImage: "figure.indoor.cycle", trailing: "\(Int((share.indoorFraction * 100).rounded())) % indoor") {
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    Rectangle()
                        .fill(Color.accentColor)
                        .frame(width: proxy.size.width * share.indoorFraction)
                    Rectangle()
                        .fill(Color.secondary.opacity(0.3))
                }
                .clipShape(Capsule())
            }
            .frame(height: 12)
            HStack {
                Label("Indoor · \(share.indoorCount) · \(Format.hoursValue(seconds: share.indoorSeconds)) h", systemImage: "circle.fill")
                    .foregroundStyle(Color.accentColor)
                Spacer()
                Label("Outdoor · \(share.outdoorCount) · \(Format.hoursValue(seconds: share.outdoorSeconds)) h", systemImage: "circle.fill")
                    .foregroundStyle(.secondary)
            }
            .font(.caption)
            .labelStyle(.titleOnly)
        }
    }
}

/// Create/edit/delete the yearly goal for a sport filter.
struct GoalEditor: View {
    let year: Int
    let filter: StatsSportFilter
    let goal: YearlyGoal?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var distance: Double?
    @State private var hours: Double?

    init(year: Int, filter: StatsSportFilter, goal: YearlyGoal?) {
        self.year = year
        self.filter = filter
        self.goal = goal
        _distance = State(initialValue: goal?.distanceKm)
        _hours = State(initialValue: goal?.hours)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Distance") {
                        HStack(spacing: 4) {
                            OptionalNumberField(placeholder: "e.g. 8000", value: $distance, fractionDigits: 0)
                            Text("km").foregroundStyle(.secondary)
                        }
                    }
                    LabeledContent("Time") {
                        HStack(spacing: 4) {
                            OptionalNumberField(placeholder: "optional", value: $hours, fractionDigits: 0)
                            Text("h").foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("\(filter.displayName) · \(String(year))")
                } footer: {
                    Text("Progress is compared with an even pace through the year to show whether you're on track.")
                }
                if goal != nil {
                    Section {
                        Button("Delete Goal", role: .destructive) {
                            if let goal { context.delete(goal) }
                            save()
                        }
                    }
                }
            }
            .navigationTitle("Yearly Goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if let goal {
                            goal.distanceKm = distance
                            goal.hours = hours
                            goal.updatedAt = .now
                        } else {
                            context.insert(YearlyGoal(year: year, sport: filter, distanceKm: distance, hours: hours))
                        }
                        save()
                    }
                    .disabled(distance == nil && hours == nil)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        try? context.save()
        WidgetRefresher.reload()
        dismiss()
    }
}
