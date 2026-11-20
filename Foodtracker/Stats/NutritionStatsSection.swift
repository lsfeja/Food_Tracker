import Charts
import SwiftData
import SwiftUI

/// Nutrition averages, days within target, and eaten vs. active calories.
struct NutritionStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?

    @Query private var entries: [FoodEntry]
    @Query private var activities: [ActivityRecord]

    @AppStorage(SettingsKey.targetKcal, store: AppGroup.defaults) private var targetKcal = SettingsDefault.targetKcal
    @AppStorage(SettingsKey.targetProtein, store: AppGroup.defaults) private var targetProtein = SettingsDefault.targetProtein
    @AppStorage(SettingsKey.targetCarbs, store: AppGroup.defaults) private var targetCarbs = SettingsDefault.targetCarbs
    @AppStorage(SettingsKey.targetFat, store: AppGroup.defaults) private var targetFat = SettingsDefault.targetFat
    @AppStorage(SettingsKey.weeklyModeEnabled, store: AppGroup.defaults) private var weeklyModeEnabled = SettingsDefault.weeklyModeEnabled
    @AppStorage(SettingsKey.weeklyLimitKcal, store: AppGroup.defaults) private var weeklyLimitKcal = SettingsDefault.weeklyLimitKcal
    @AppStorage(SettingsKey.activeCaloriesEnabled, store: AppGroup.defaults) private var activeCaloriesEnabled = SettingsDefault.activeCaloriesEnabled
    @AppStorage(SettingsKey.activeCaloriesPercent, store: AppGroup.defaults) private var activeCaloriesPercent = SettingsDefault.activeCaloriesPercent

    @State private var report: NutritionReport?

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    init(period: StatsPeriod, earliest: Date?) {
        self.period = period
        self.earliest = earliest
        let calendar = BudgetCalculator.weekCalendar
        let interval = period.interval(now: .now, calendar: calendar, earliest: earliest)
        // Start at the week's Monday so weekly-mode budgets see the whole week.
        let start = BudgetCalculator.week(containing: interval.start, calendar: calendar).start
        let end = interval.end
        _entries = Query(filter: #Predicate<FoodEntry> { $0.timestamp >= start && $0.timestamp < end })
        _activities = Query(filter: #Predicate<ActivityRecord> { $0.startDate >= start && $0.startDate < end })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let report {
                if report.loggedDays == 0 {
                    EmptyStatsCard(
                        title: "No Food Logged",
                        message: "Log meals in the Nutrition tab to see averages and target days here.",
                        systemImage: "fork.knife"
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
            load()
        }
    }

    @ViewBuilder
    private func content(_ report: NutritionReport) -> some View {
        StatsCard(title: "Daily Average", systemImage: "fork.knife", trailing: "\(report.loggedDays) days logged") {
            MetricGrid {
                GridRow {
                    MetricTile(title: "Calories", value: Format.kcal(report.average.kcal), unit: "kcal", detail: "target \(Format.kcal(report.targets.kcal))")
                    MetricTile(title: "Protein", value: Format.grams(report.average.protein), unit: "g", detail: "target \(Format.grams(report.targets.protein))")
                }
                GridRow {
                    MetricTile(title: "Carbs", value: Format.grams(report.average.carbs), unit: "g", detail: "target \(Format.grams(report.targets.carbs))")
                    MetricTile(title: "Fat", value: Format.grams(report.average.fat), unit: "g", detail: "target \(Format.grams(report.targets.fat))")
                }
            }
            if report.buckets.filter({ $0.loggedDays > 0 }).count > 1 {
                Chart {
                    ForEach(report.buckets.filter { $0.loggedDays > 0 }) { bucket in
                        BarMark(
                            x: .value("Period", bucket.start, unit: report.bucket.component),
                            y: .value("kcal", bucket.average.kcal)
                        )
                        .foregroundStyle(bucket.average.kcal > report.targets.kcal ? Color.orange : Color.accentColor)
                        .cornerRadius(3)
                    }
                    RuleMark(y: .value("Target", report.targets.kcal))
                        .foregroundStyle(Color.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                }
                .chartYAxisLabel("Ø kcal")
                .frame(height: 160)
            }
        }

        StatsCard(title: "Calorie Budget", systemImage: "target") {
            let total = max(report.daysWithin + report.daysOver, 1)
            HStack(alignment: .firstTextBaseline) {
                MetricTile(title: "Within budget", value: report.daysWithin.formatted(), unit: "days")
                MetricTile(title: "Over budget", value: report.daysOver.formatted(), unit: "days")
            }
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    Rectangle()
                        .fill(Color.accentColor)
                        .frame(width: proxy.size.width * Double(report.daysWithin) / Double(total))
                    Rectangle()
                        .fill(Color.orange)
                }
                .clipShape(Capsule())
            }
            .frame(height: 10)
        }

        StatsCard(title: "Eaten vs. Active", systemImage: "flame") {
            Chart {
                ForEach(report.energy) { bucket in
                    BarMark(
                        x: .value("Period", bucket.start, unit: report.energyBucket.component),
                        y: .value("kcal", bucket.eaten.kcal)
                    )
                    .foregroundStyle(by: .value("Type", "Eaten"))
                    .position(by: .value("Type", "Eaten"))
                    BarMark(
                        x: .value("Period", bucket.start, unit: report.energyBucket.component),
                        y: .value("kcal", bucket.activeCalories)
                    )
                    .foregroundStyle(by: .value("Type", "Active"))
                    .position(by: .value("Type", "Active"))
                }
            }
            .chartForegroundStyleScale(domain: ["Eaten", "Active"], range: [Color.accentColor, Color.orange.opacity(0.8)])
            .chartYAxisLabel("kcal")
            .frame(height: 180)
        }
    }

    private struct LoadKey: Hashable {
        var period: StatsPeriod
        var entries: Int
        var activities: Int
        var eatenKcal: Double
        var settings: [Double]
    }

    private var loadKey: LoadKey {
        LoadKey(
            period: period,
            entries: entries.count,
            activities: activities.count,
            eatenKcal: entries.reduce(0) { $0 + $1.kcal },
            settings: [targetKcal, targetProtein, targetCarbs, targetFat, weeklyLimitKcal, activeCaloriesPercent,
                       weeklyModeEnabled ? 1 : 0, activeCaloriesEnabled ? 1 : 0]
        )
    }

    private func load() {
        let settings = UserSettings(
            targets: NutritionTargets(kcal: targetKcal, protein: targetProtein, carbs: targetCarbs, fat: targetFat),
            budget: BudgetSettings(
                weeklyModeEnabled: weeklyModeEnabled,
                weeklyLimitKcal: weeklyLimitKcal,
                activeCaloriesEnabled: activeCaloriesEnabled,
                activeCaloriesPercent: activeCaloriesPercent
            )
        )
        let totals = BudgetCalculator.totalsByDay(entries: entries, activities: activities, calendar: calendar)
        report = NutritionStats.report(totalsByDay: totals, settings: settings, period: period, now: .now, calendar: calendar, earliest: earliest)
    }
}
