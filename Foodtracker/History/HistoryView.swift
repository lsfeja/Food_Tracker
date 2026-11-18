import Charts
import SwiftData
import SwiftUI

/// Daily and weekly calorie totals with a small chart.
struct HistoryView: View {
    private enum Scope: String, CaseIterable, Identifiable {
        case days = "Days"
        case weeks = "Weeks"
        var id: String { rawValue }
    }

    private static let weekCount = 12
    private static let chartDays = 14
    private static let listDays = 60

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

    @State private var scope: Scope = .days

    private let today = Date.now

    init() {
        let calendar = BudgetCalculator.weekCalendar
        let currentWeek = BudgetCalculator.week(containing: .now, calendar: calendar)
        let earliestWeek = calendar.date(byAdding: .day, value: -7 * (Self.weekCount - 1), to: currentWeek.start) ?? currentWeek.start
        let earliestDay = calendar.date(byAdding: .day, value: -Self.listDays, to: calendar.startOfDay(for: .now)) ?? earliestWeek
        let start = min(earliestWeek, earliestDay)
        _entries = Query(filter: #Predicate<FoodEntry> { $0.timestamp >= start }, sort: \FoodEntry.timestamp)
        _activities = Query(filter: #Predicate<ActivityRecord> { $0.startDate >= start }, sort: \ActivityRecord.startDate)
    }

    var body: some View {
        let totals = BudgetCalculator.totalsByDay(entries: entries, activities: activities)

        List {
            Section {
                Picker("Range", selection: $scope) {
                    ForEach(Scope.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowSeparator(.hidden)

                switch scope {
                case .days:
                    dayChart(HistoryStats.days(endingAt: today, count: Self.chartDays, totals: totals, settings: settings))
                case .weeks:
                    weekChart(HistoryStats.weeks(endingAt: today, count: Self.weekCount, totals: totals, settings: settings))
                }
            }

            switch scope {
            case .days:
                dayList(HistoryStats.days(endingAt: today, count: Self.listDays, totals: totals, settings: settings))
            case .weeks:
                weekList(HistoryStats.weeks(endingAt: today, count: Self.weekCount, totals: totals, settings: settings))
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("History")
    }

    // MARK: - Days

    private func dayChart(_ stats: [DayStat]) -> some View {
        let logged = stats.filter { $0.eaten.kcal > 0 }
        let average = logged.isEmpty ? 0 : logged.map(\.eaten.kcal).reduce(0, +) / Double(logged.count)

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Average")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(Format.kcal(average)) kcal / day")
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
            }
            Chart {
                ForEach(stats) { stat in
                    BarMark(
                        x: .value("Day", stat.day, unit: .day),
                        y: .value("Calories", stat.eaten.kcal)
                    )
                    .foregroundStyle(stat.eaten.kcal > stat.budget ? Color.orange : Color.accentColor)
                    .cornerRadius(4)
                }
                RuleMark(y: .value("Target", targetKcal))
                    .foregroundStyle(Color.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .day, count: 2)) { _ in
                    AxisValueLabel(format: .dateTime.weekday(.narrow))
                }
            }
            .frame(height: 180)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func dayList(_ stats: [DayStat]) -> some View {
        let days = stats.filter(\.hasData).reversed()
        Section("Days") {
            if days.isEmpty {
                Text("No entries yet.")
                    .foregroundStyle(.secondary)
            }
            ForEach(Array(days)) { stat in
                NavigationLink(value: stat.day) {
                    DayStatRow(stat: stat)
                }
            }
        }
    }

    // MARK: - Weeks

    private func weekChart(_ stats: [WeekStat]) -> some View {
        let logged = stats.filter { $0.eatenKcal > 0 }
        let average = logged.isEmpty ? 0 : logged.map(\.eatenKcal).reduce(0, +) / Double(logged.count)

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Average")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(Format.kcal(average)) kcal / week")
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
            }
            Chart {
                ForEach(stats) { stat in
                    BarMark(
                        x: .value("Week", stat.start, unit: .weekOfYear),
                        y: .value("Calories", stat.eatenKcal)
                    )
                    .foregroundStyle(stat.eatenKcal > stat.budget ? Color.orange : Color.accentColor)
                    .cornerRadius(4)
                }
                RuleMark(y: .value("Limit", weeklyLimit))
                    .foregroundStyle(Color.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .weekOfYear, count: 2)) { _ in
                    AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                }
            }
            .frame(height: 180)
        }
        .padding(.vertical, 4)
    }

    private func weekList(_ stats: [WeekStat]) -> some View {
        Section("Weeks") {
            ForEach(Array(stats.reversed())) { stat in
                WeekStatRow(stat: stat)
            }
        }
    }

    // MARK: - Settings

    private var weeklyLimit: Double {
        settings.budget.effectiveWeeklyLimit(dailyTarget: targetKcal)
    }

    private var settings: UserSettings {
        UserSettings(
            targets: NutritionTargets(kcal: targetKcal, protein: targetProtein, carbs: targetCarbs, fat: targetFat),
            budget: BudgetSettings(
                weeklyModeEnabled: weeklyModeEnabled,
                weeklyLimitKcal: weeklyLimitKcal,
                activeCaloriesEnabled: activeCaloriesEnabled,
                activeCaloriesPercent: activeCaloriesPercent
            )
        )
    }
}

private struct DayStatRow: View {
    let stat: DayStat

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(stat.day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                Text("P \(Format.grams(stat.eaten.protein)) · C \(Format.grams(stat.eaten.carbs)) · F \(Format.grams(stat.eaten.fat))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text("\(Format.kcal(stat.eaten.kcal)) kcal")
                    .font(.body.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(stat.eaten.kcal > stat.budget ? Color.orange : Color.primary)
                Text("of \(Format.kcal(stat.budget))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }
}

private struct WeekStatRow: View {
    let stat: WeekStat

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(weekLabel)
                Text("Ø \(Format.kcal(stat.averagePerLoggedDay)) kcal · \(stat.loggedDays) days logged")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text("\(Format.kcal(stat.eatenKcal)) kcal")
                    .font(.body.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(stat.eatenKcal > stat.budget ? Color.orange : Color.primary)
                Text("of \(Format.kcal(stat.budget))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }

    private var weekLabel: String {
        let end = Calendar.current.date(byAdding: .day, value: 6, to: stat.start) ?? stat.start
        return "\(stat.start.formatted(.dateTime.day().month(.abbreviated))) – \(end.formatted(.dateTime.day().month(.abbreviated)))"
    }
}
