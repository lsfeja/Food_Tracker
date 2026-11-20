import Charts
import SwiftData
import SwiftUI

/// Screens pushed from the Stats tab.
enum StatsRoute: Hashable {
    case exercises
    case exercise(key: String)
}

/// Strength stats from logged gym sessions.
struct StrengthStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?

    @Query private var sessions: [PlannedSession]
    @State private var report: StrengthReport?
    @State private var showSessions = false

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    init(period: StatsPeriod, earliest: Date?) {
        self.period = period
        self.earliest = earliest
        let strength = SportType.strength.rawValue
        _sessions = Query(filter: #Predicate<PlannedSession> { $0.sportRaw == strength }, sort: \PlannedSession.date)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let report {
                if report.records.isEmpty && report.sessionCount == 0 {
                    EmptyStatsCard(
                        title: "No Gym Sessions Yet",
                        message: "Tick off sets in a strength session in the Plan tab. Volume, records and progress appear here.",
                        systemImage: "dumbbell.fill"
                    )
                } else {
                    content(report)
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        }
        .task(id: loadKey) {
            await load()
        }
    }

    @ViewBuilder
    private func content(_ report: StrengthReport) -> some View {
        StatsCard(title: "Training", systemImage: "dumbbell.fill", trailing: period.title(calendar: calendar)) {
            MetricGrid {
                GridRow {
                    MetricTile(title: "Sessions", value: report.sessionCount.formatted())
                    MetricTile(title: "Sets", value: report.setCount.formatted())
                }
                GridRow {
                    MetricTile(title: "Volume", value: Format.volume(report.volume), unit: Format.volumeUnit(report.volume))
                    MetricTile(title: "Exercises", value: report.exercises.count.formatted())
                }
            }
        }

        StatsCard(title: showSessions ? "Sessions" : "Volume", systemImage: "chart.bar.fill") {
            Picker("Metric", selection: $showSessions) {
                Text("Volume").tag(false)
                Text("Sessions").tag(true)
            }
            .pickerStyle(.segmented)
            Chart(report.buckets) { bucket in
                BarMark(
                    x: .value("Period", bucket.start, unit: report.bucket.component),
                    y: .value(showSessions ? "Sessions" : "Volume (kg)", showSessions ? Double(bucket.sessions) : bucket.volume)
                )
                .foregroundStyle(Color.accentColor)
                .cornerRadius(3)
            }
            .chartYAxisLabel(showSessions ? "sessions" : "kg")
            .frame(height: 180)
        }

        if !report.records.isEmpty {
            StatsCard(title: "Personal Records", systemImage: "trophy", trailing: "\(report.records.count)") {
                VStack(spacing: 10) {
                    ForEach(report.records.prefix(8)) { record in
                        PersonalRecordRow(record: record, isNew: isInPeriod(record.date))
                    }
                }
                NavigationLink(value: StatsRoute.exercises) {
                    Label("All Exercises", systemImage: "list.bullet")
                        .font(.subheadline)
                }
            }
        }

        if !report.exercises.isEmpty {
            StatsCard(title: "Exercises", systemImage: "figure.strengthtraining.traditional", trailing: "in this period") {
                VStack(spacing: 0) {
                    ForEach(report.exercises.prefix(6)) { exercise in
                        NavigationLink(value: StatsRoute.exercise(key: exercise.key)) {
                            ExerciseSummaryRow(summary: exercise)
                        }
                        .buttonStyle(.plain)
                        if exercise.id != report.exercises.prefix(6).last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
    }

    private func isInPeriod(_ date: Date) -> Bool {
        let interval = period.interval(now: .now, calendar: calendar, earliest: earliest)
        return interval.contains(date) && date < interval.end
    }

    private struct LoadKey: Hashable {
        var period: StatsPeriod
        var count: Int
        var signature: Int
    }

    private var loadKey: LoadKey {
        // Changes when sessions are added, removed or edited (details are JSON data).
        var hasher = Hasher()
        for session in sessions {
            hasher.combine(session.id)
            hasher.combine(session.statusRaw)
            hasher.combine(session.detailsData)
        }
        return LoadKey(period: period, count: sessions.count, signature: hasher.finalize())
    }

    private func load() async {
        let snapshots = sessions.map(StrengthSessionSnapshot.init(session:))
        let period = period
        let earliest = earliest
        let calendar = calendar
        let result = await Task.detached(priority: .userInitiated) {
            StrengthStats.report(sessions: snapshots, period: period, now: .now, calendar: calendar, earliest: earliest)
        }.value
        guard !Task.isCancelled else { return }
        report = result
    }
}

struct PersonalRecordRow: View {
    let record: PersonalRecord
    var isNew = false

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(record.exercise)
                        .font(.subheadline)
                        .lineLimit(1)
                    if isNew {
                        Text("NEW")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.accentColor, in: Capsule())
                            .foregroundStyle(.white)
                    }
                }
                Text("\(record.kind.title) · \(record.date.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text("\(Format.weight(record.value.rounded(toPlaces: 1))) kg")
                .font(.headline)
                .monospacedDigit()
        }
    }
}

struct ExerciseSummaryRow: View {
    let summary: ExerciseSummary

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(summary.name)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    private var detail: String {
        var parts: [String] = []
        if let max = summary.maxWeight { parts.append("Max \(Format.weight(max.value)) kg") }
        if let oneRM = summary.bestOneRepMax { parts.append("1RM \(Format.weight(oneRM.value.rounded(toPlaces: 1))) kg") }
        parts.append(summary.history.count == 1 ? "1 session" : "\(summary.history.count) sessions")
        return parts.joined(separator: " · ")
    }
}

/// Searchable list of all exercises ever logged.
struct ExerciseListView: View {
    @Query private var sessions: [PlannedSession]
    @State private var searchText = ""
    @State private var summaries: [ExerciseSummary] = []

    init() {
        let strength = SportType.strength.rawValue
        _sessions = Query(filter: #Predicate<PlannedSession> { $0.sportRaw == strength }, sort: \PlannedSession.date)
    }

    var body: some View {
        List {
            if summaries.isEmpty {
                Text("No exercises logged yet.")
                    .foregroundStyle(.secondary)
            }
            ForEach(filtered) { summary in
                NavigationLink(value: StatsRoute.exercise(key: summary.key)) {
                    ExerciseSummaryRow(summary: summary)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Exercises")
        .searchable(text: $searchText, prompt: "Search exercises")
        .task(id: sessions.count) {
            summaries = StrengthStats.exerciseSummaries(sessions.map(StrengthSessionSnapshot.init(session:)))
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }
    }

    private var filtered: [ExerciseSummary] {
        let query = ExerciseHistory.normalizedName(searchText)
        guard !query.isEmpty else { return summaries }
        return summaries.filter { $0.key.contains(query) }
    }
}

/// Full history of one exercise with records and a progress chart.
struct ExerciseDetailView: View {
    let key: String

    @Query private var sessions: [PlannedSession]
    @State private var summary: ExerciseSummary?

    init(key: String) {
        self.key = key
        let strength = SportType.strength.rawValue
        _sessions = Query(filter: #Predicate<PlannedSession> { $0.sportRaw == strength }, sort: \PlannedSession.date)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let summary {
                    content(summary)
                } else {
                    ContentUnavailableView("No Data", systemImage: "dumbbell", description: Text("This exercise has no ticked-off sets yet."))
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(summary?.name ?? "Exercise")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: sessions.count) {
            summary = StrengthStats.exerciseSummaries(sessions.map(StrengthSessionSnapshot.init(session:)))
                .first { $0.key == key }
        }
    }

    @ViewBuilder
    private func content(_ summary: ExerciseSummary) -> some View {
        StatsCard(title: "Records", systemImage: "trophy") {
            MetricGrid {
                GridRow {
                    MetricTile(
                        title: "Max weight",
                        value: summary.maxWeight.map { Format.weight($0.value) } ?? "–",
                        unit: "kg",
                        detail: summary.maxWeight.map { $0.date.formatted(date: .abbreviated, time: .omitted) }
                    )
                    MetricTile(
                        title: "Est. 1RM",
                        value: summary.bestOneRepMax.map { Format.weight($0.value.rounded(toPlaces: 1)) } ?? "–",
                        unit: "kg",
                        detail: summary.bestOneRepMax.map { $0.date.formatted(date: .abbreviated, time: .omitted) }
                    )
                }
                GridRow {
                    MetricTile(
                        title: "Best set",
                        value: summary.bestSet?.set.label ?? "–",
                        detail: summary.bestSet?.date.formatted(date: .abbreviated, time: .omitted)
                    )
                    MetricTile(title: "Total volume", value: Format.volume(summary.totalVolume), unit: Format.volumeUnit(summary.totalVolume))
                }
            }
        }

        if summary.history.contains(where: { $0.maxWeight != nil }) {
            StatsCard(title: "Progress", systemImage: "chart.line.uptrend.xyaxis") {
                Chart {
                    ForEach(summary.history) { stat in
                        if let oneRM = stat.bestOneRepMax {
                            LineMark(x: .value("Date", stat.date, unit: .day), y: .value("kg", oneRM))
                                .foregroundStyle(by: .value("Metric", "Est. 1RM"))
                                .symbol(by: .value("Metric", "Est. 1RM"))
                        }
                        if let weight = stat.maxWeight {
                            LineMark(x: .value("Date", stat.date, unit: .day), y: .value("kg", weight))
                                .foregroundStyle(by: .value("Metric", "Max weight"))
                                .symbol(by: .value("Metric", "Max weight"))
                        }
                    }
                }
                .chartForegroundStyleScale(domain: ["Est. 1RM", "Max weight"], range: [Color.accentColor, Color.secondary])
                .chartYScale(domain: .automatic(includesZero: false))
                .chartYAxisLabel("kg")
                .frame(height: 200)
            }
        }

        StatsCard(title: "History", systemImage: "clock.arrow.circlepath", trailing: "\(summary.history.count) sessions") {
            VStack(spacing: 10) {
                ForEach(summary.history.reversed()) { stat in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(stat.date.formatted(date: .abbreviated, time: .omitted))
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("\(Format.volume(stat.volume)) \(Format.volumeUnit(stat.volume))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        Text(stat.sets.map(\.label).joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let factor = pow(10, Double(places))
        return (self * factor).rounded() / factor
    }
}
