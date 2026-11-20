import SwiftData
import SwiftUI

/// Stats tab: period + year selection, then cards per category.
struct StatsView: View {
    enum Category: String, CaseIterable, Identifiable {
        case endurance
        case strength
        case plan
        case nutrition

        var id: String { rawValue }

        var title: String {
            switch self {
            case .endurance: "Endurance"
            case .strength: "Strength"
            case .plan: "Plan"
            case .nutrition: "Nutrition"
            }
        }

        var systemImage: String {
            switch self {
            case .endurance: "figure.run"
            case .strength: "dumbbell.fill"
            case .plan: "checklist"
            case .nutrition: "fork.knife"
            }
        }
    }

    @AppStorage("stats.period") private var periodRaw = StatsPeriodKind.year.rawValue
    @AppStorage("stats.category") private var categoryRaw = Category.endurance.rawValue
    @State private var year = BudgetCalculator.weekCalendar.component(.year, from: .now)

    @Query(StatsView.earliestActivityDescriptor) private var earliestActivity: [ActivityRecord]
    @Query(StatsView.earliestSessionDescriptor) private var earliestSession: [PlannedSession]
    @Query(StatsView.earliestEntryDescriptor) private var earliestEntry: [FoodEntry]

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Period", selection: periodBinding) {
                        ForEach(StatsPeriodKind.allCases) { kind in
                            Text(kind.title).tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)

                    ChipPicker(
                        options: Category.allCases,
                        selection: categoryBinding,
                        title: { $0.title },
                        systemImage: { $0.systemImage }
                    )

                    Text(period.title(calendar: calendar))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    categoryContent
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Stats")
            .toolbar {
                if period.kind != .all {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Year", selection: $year) {
                                ForEach(availableYears.reversed(), id: \.self) { year in
                                    Text(String(year)).tag(year)
                                }
                            }
                        } label: {
                            Label(String(year), systemImage: "calendar")
                                .labelStyle(.titleAndIcon)
                        }
                        .accessibilityLabel("Year \(year)")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var categoryContent: some View {
        switch category {
        case .endurance:
            EnduranceStatsSection(period: period, earliest: earliestDate)
        case .strength:
            StrengthStatsSection(period: period, earliest: earliestDate)
        case .plan:
            PlanStatsSection(period: period, earliest: earliestDate)
        case .nutrition:
            NutritionStatsSection(period: period, earliest: earliestDate)
        }
    }

    // MARK: - State

    private var period: StatsPeriod {
        StatsPeriod(kind: StatsPeriodKind(rawValue: periodRaw) ?? .year, year: year)
    }

    private var category: Category {
        Category(rawValue: categoryRaw) ?? .endurance
    }

    private var periodBinding: Binding<StatsPeriodKind> {
        Binding(get: { period.kind }, set: { periodRaw = $0.rawValue })
    }

    private var categoryBinding: Binding<Category> {
        Binding(get: { category }, set: { categoryRaw = $0.rawValue })
    }

    /// Earliest date with any data (activities, sessions, food entries).
    private var earliestDate: Date? {
        [earliestActivity.first?.startDate, earliestSession.first?.date, earliestEntry.first?.timestamp]
            .compactMap { $0 }
            .min()
    }

    private var availableYears: [Int] {
        let current = calendar.component(.year, from: .now)
        let first = earliestDate.map { calendar.component(.year, from: $0) } ?? current
        return Array(min(first, current)...current)
    }

    // MARK: - Queries

    private static var earliestActivityDescriptor: FetchDescriptor<ActivityRecord> {
        var descriptor = FetchDescriptor<ActivityRecord>(sortBy: [SortDescriptor(\.startDate)])
        descriptor.fetchLimit = 1
        return descriptor
    }

    private static var earliestSessionDescriptor: FetchDescriptor<PlannedSession> {
        var descriptor = FetchDescriptor<PlannedSession>(sortBy: [SortDescriptor(\.date)])
        descriptor.fetchLimit = 1
        return descriptor
    }

    private static var earliestEntryDescriptor: FetchDescriptor<FoodEntry> {
        var descriptor = FetchDescriptor<FoodEntry>(sortBy: [SortDescriptor(\.timestamp)])
        descriptor.fetchLimit = 1
        return descriptor
    }
}

// Category sections (filled in by the following milestones).

struct EnduranceStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?
    var body: some View {
        EmptyStatsCard(title: "Endurance", message: "Coming soon", systemImage: "figure.run")
    }
}

struct StrengthStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?
    var body: some View {
        EmptyStatsCard(title: "Strength", message: "Coming soon", systemImage: "dumbbell.fill")
    }
}

struct PlanStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?
    var body: some View {
        EmptyStatsCard(title: "Plan", message: "Coming soon", systemImage: "checklist")
    }
}

struct NutritionStatsSection: View {
    let period: StatsPeriod
    let earliest: Date?
    var body: some View {
        EmptyStatsCard(title: "Nutrition", message: "Coming soon", systemImage: "fork.knife")
    }
}
