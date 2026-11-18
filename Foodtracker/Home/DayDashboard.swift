import SwiftData
import SwiftUI

/// Progress and entries for one day. Used for "Today" and for past days from History.
struct DayDashboard: View {
    let day: Date

    @Environment(AppRouter.self) private var router
    @Environment(AppServices.self) private var services
    @Environment(\.modelContext) private var context

    @Query private var weekEntries: [FoodEntry]
    @Query private var weekActivities: [ActivityRecord]

    @AppStorage(SettingsKey.targetKcal, store: AppGroup.defaults) private var targetKcal = SettingsDefault.targetKcal
    @AppStorage(SettingsKey.targetProtein, store: AppGroup.defaults) private var targetProtein = SettingsDefault.targetProtein
    @AppStorage(SettingsKey.targetCarbs, store: AppGroup.defaults) private var targetCarbs = SettingsDefault.targetCarbs
    @AppStorage(SettingsKey.targetFat, store: AppGroup.defaults) private var targetFat = SettingsDefault.targetFat
    @AppStorage(SettingsKey.weeklyModeEnabled, store: AppGroup.defaults) private var weeklyModeEnabled = SettingsDefault.weeklyModeEnabled
    @AppStorage(SettingsKey.weeklyLimitKcal, store: AppGroup.defaults) private var weeklyLimitKcal = SettingsDefault.weeklyLimitKcal
    @AppStorage(SettingsKey.activeCaloriesEnabled, store: AppGroup.defaults) private var activeCaloriesEnabled = SettingsDefault.activeCaloriesEnabled
    @AppStorage(SettingsKey.activeCaloriesPercent, store: AppGroup.defaults) private var activeCaloriesPercent = SettingsDefault.activeCaloriesPercent

    @State private var editingEntry: FoodEntry?

    init(day: Date) {
        self.day = day
        let week = BudgetCalculator.week(containing: day)
        let start = week.start
        let end = week.end
        _weekEntries = Query(
            filter: #Predicate<FoodEntry> { $0.timestamp >= start && $0.timestamp < end },
            sort: \FoodEntry.timestamp,
            order: .reverse
        )
        _weekActivities = Query(
            filter: #Predicate<ActivityRecord> { $0.startDate >= start && $0.startDate < end },
            sort: \ActivityRecord.startDate
        )
    }

    var body: some View {
        let budget = currentBudget
        let entries = dayEntries
        let activities = dayActivities

        List {
            Section {
                summary(budget)
            }

            if let weekly = budget.weekly {
                Section {
                    WeeklyBalanceView(balance: weekly)
                }
            }

            Section {
                if entries.isEmpty {
                    emptyState
                } else {
                    ForEach(entries) { entry in
                        Button {
                            editingEntry = entry
                        } label: {
                            EntryRow(entry: entry)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                withAnimation { FoodLogger.delete(entry, in: context) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                editingEntry = entry
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(.gray)
                        }
                    }
                }
            } header: {
                if !entries.isEmpty {
                    Text("Entries")
                }
            }

            if !activities.isEmpty {
                Section("Activity") {
                    ForEach(activities) { activity in
                        ActivityRow(activity: activity)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await services.activitySync.sync()
        }
        .navigationTitle(title)
        .safeAreaInset(edge: .bottom) {
            AddFoodButton(day: day)
                .padding(.bottom, 8)
        }
        .sheet(item: $editingEntry) { entry in
            EditEntryView(entry: entry)
        }
    }

    // MARK: - Sections

    private func summary(_ budget: DayBudget) -> some View {
        VStack(spacing: 24) {
            CalorieRing(budget: budget.calories)
                .frame(width: 210, height: 210)
                .padding(.top, 8)

            HStack {
                stat("Eaten", Format.kcal(budget.calories.eaten))
                Divider().frame(height: 28)
                stat("Active", Format.signedKcal(budget.calories.activeBonus))
                Divider().frame(height: 28)
                stat("Budget", Format.kcal(budget.calories.total))
            }

            VStack(spacing: 14) {
                MacroBar(title: "Protein", value: budget.eaten.protein, target: budget.targets.protein)
                MacroBar(title: "Carbs", value: budget.eaten.carbs, target: budget.targets.carbs)
                MacroBar(title: "Fat", value: budget.eaten.fat, target: budget.targets.fat, isSecondary: true)
            }
        }
        .padding(.vertical, 8)
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
                .monospacedDigit()
                .contentTransition(.numericText())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "fork.knife")
                .font(.title2)
                .foregroundStyle(.tertiary)
            Text("Nothing logged yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Tap + to add food. Hold it to scan.")
                .font(.footnote)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
    }

    // MARK: - Data

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    private var isToday: Bool { calendar.isDateInToday(day) }

    private var title: String {
        if isToday { return "Today" }
        if calendar.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(.dateTime.weekday(.wide).day().month())
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

    private var currentBudget: DayBudget {
        let totals = BudgetCalculator.totalsByDay(entries: weekEntries, activities: weekActivities, calendar: calendar)
        return BudgetCalculator.budget(for: day, settings: settings, totalsByDay: totals, calendar: calendar)
    }

    private var dayEntries: [FoodEntry] {
        weekEntries.filter { calendar.isDate($0.timestamp, inSameDayAs: day) }
    }

    private var dayActivities: [ActivityRecord] {
        weekActivities.filter { calendar.isDate($0.startDate, inSameDayAs: day) }
    }
}

/// Weekly budget mode: what's left for the rest of the week.
struct WeeklyBalanceView: View {
    let balance: WeeklyBalance

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("This week")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(balance.daysRemaining == 1 ? "last day" : "\(balance.daysRemaining) days left")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(Format.kcal(abs(balance.remaining)))
                    .font(.title2.weight(.bold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text(balance.remaining >= 0 ? "kcal left" : "kcal over")
                    .font(.subheadline)
                    .foregroundStyle(balance.remaining >= 0 ? AnyShapeStyle(.secondary) : AnyShapeStyle(Color.orange))
                Spacer()
                Text("of \(Format.kcal(balance.total))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            ProgressBar(
                progress: balance.total > 0 ? balance.eaten / balance.total : 0,
                height: 6,
                tint: balance.remaining >= 0 ? .accentColor : .orange
            )
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// The prominent "+" button. Tap: search/manual. Long press: scan or label photo.
struct AddFoodButton: View {
    let day: Date
    @Environment(AppRouter.self) private var router

    var body: some View {
        Button {
            router.presentAddFood(.search, day: day)
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 68, height: 68)
                .background(Circle().fill(Color.accentColor))
                .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                router.presentAddFood(.barcode, day: day)
            } label: {
                Label("Scan Barcode", systemImage: "barcode.viewfinder")
            }
            Button {
                router.presentAddFood(.label, day: day)
            } label: {
                Label("Photograph Label", systemImage: "text.viewfinder")
            }
        }
        .accessibilityLabel("Add food")
        .accessibilityHint("Hold for barcode scanner or label photo")
    }
}
