import Charts
import SwiftData
import SwiftUI

/// Plan adherence and training time per sport.
struct PlanStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?

    @Query(sort: \PlannedSession.date) private var sessions: [PlannedSession]
    @Query(sort: \ActivityRecord.startDate) private var activities: [ActivityRecord]
    @State private var report: PlanReport?

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let report {
                content(report)
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
    private func content(_ report: PlanReport) -> some View {
        StatsCard(title: "Adherence", systemImage: "checklist", trailing: period.title(calendar: calendar)) {
            MetricGrid {
                GridRow {
                    MetricTile(
                        title: "Completed",
                        value: report.rate.map { "\(Int(($0 * 100).rounded()))" } ?? "–",
                        unit: report.rate == nil ? nil : "%",
                        detail: "\(report.completed) of \(report.plannedToDate) planned"
                    )
                    MetricTile(title: "Skipped", value: report.skipped.formatted(), detail: "up to today")
                }
            }
            if report.adherence.contains(where: { $0.planned > 0 }) {
                Chart {
                    ForEach(report.adherence) { bucket in
                        BarMark(
                            x: .value("Period", bucket.start, unit: report.adherenceBucket.component),
                            y: .value("Sessions", bucket.planned)
                        )
                        .foregroundStyle(Color.secondary.opacity(0.25))
                        .cornerRadius(3)
                        BarMark(
                            x: .value("Period", bucket.start, unit: report.adherenceBucket.component),
                            y: .value("Sessions", bucket.completed)
                        )
                        .foregroundStyle(Color.accentColor)
                        .cornerRadius(3)
                    }
                }
                .chartYAxisLabel("sessions")
                .frame(height: 160)
                HStack(spacing: 14) {
                    LegendDot(color: .accentColor, title: "Completed")
                    LegendDot(color: Color.secondary.opacity(0.25), title: "Planned")
                }
            } else {
                Text("No sessions planned in this period.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }

        StatsCard(title: "Training Time", systemImage: "stopwatch", trailing: Format.duration(minutes: report.totalMinutes)) {
            if report.time.isEmpty {
                Text("No completed sessions or activities in this period.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                let sports = report.totals.map(\.sport.displayName)
                Chart(report.time) { item in
                    BarMark(
                        x: .value("Period", item.start, unit: report.timeBucket.component),
                        y: .value("Hours", item.minutes / 60)
                    )
                    .foregroundStyle(by: .value("Sport", item.sport.displayName))
                }
                .chartForegroundStyleScale(domain: sports, range: SportPalette.colors(count: sports.count))
                .chartYAxisLabel("h")
                .frame(height: 180)

                VStack(spacing: 6) {
                    ForEach(Array(report.totals.enumerated()), id: \.element.id) { index, total in
                        HStack {
                            LegendDot(color: SportPalette.colors(count: report.totals.count)[index], title: total.sport.displayName)
                            Spacer()
                            Text(Format.duration(minutes: total.minutes))
                                .font(.caption)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private struct LoadKey: Hashable {
        var period: StatsPeriod
        var signature: Int
    }

    private var loadKey: LoadKey {
        var hasher = Hasher()
        hasher.combine(sessions.count)
        hasher.combine(activities.count)
        for session in sessions {
            hasher.combine(session.statusRaw)
            hasher.combine(session.date)
            hasher.combine(session.linkedActivityKey)
        }
        hasher.combine(activities.last?.updatedAt)
        return LoadKey(period: period, signature: hasher.finalize())
    }

    private func load() async {
        let sessionSnapshots = sessions.map(PlanSessionSnapshot.init(session:))
        let activitySnapshots = activities.map(ActivitySnapshot.init(record:))
        let period = period
        let earliest = earliest
        let calendar = calendar
        let result = await Task.detached(priority: .userInitiated) {
            PlanStats.report(sessions: sessionSnapshots, activities: activitySnapshots, period: period, now: .now, calendar: calendar, earliest: earliest)
        }.value
        guard !Task.isCancelled else { return }
        report = result
    }
}

/// Green-family palette for per-sport series (keeps the single-accent look).
enum SportPalette {
    static func colors(count: Int) -> [Color] {
        let base: [Color] = [.accentColor, .mint, .teal, .cyan, .indigo, .gray, .brown, .purple, .pink]
        return (0..<max(count, 0)).map { base[$0 % base.count] }
    }
}

struct LegendDot: View {
    let color: Color
    let title: String

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
