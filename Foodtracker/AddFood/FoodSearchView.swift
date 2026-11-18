import SwiftData
import SwiftUI

/// Root of the add-food sheet: quick actions, recent/frequent foods and search.
struct FoodSearchView: View {
    @Environment(AddFoodFlow.self) private var flow
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @Query(filter: #Predicate<Food> { $0.isHidden == false }) private var foods: [Food]

    @State private var searchText = ""

    var body: some View {
        List {
            Section {
                quickActions
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))

            if query.isEmpty {
                suggestionSections
            } else {
                searchSections
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search foods")
        .autocorrectionDisabled()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }

    // MARK: - Sections

    private var quickActions: some View {
        HStack(spacing: 8) {
            QuickActionButton(title: "Scan", systemImage: "barcode.viewfinder") {
                flow.push(.barcodeScanner)
            }
            QuickActionButton(title: "Label", systemImage: "text.viewfinder") {
                flow.push(.labelScanner(barcode: nil))
            }
            QuickActionButton(title: "New Food", systemImage: "square.and.pencil") {
                flow.push(.newFood(FoodDraft(name: query), .manual))
            }
            QuickActionButton(title: "Quick Add", systemImage: "bolt") {
                flow.push(.quickAdd)
            }
        }
    }

    @ViewBuilder
    private var suggestionSections: some View {
        let recent = recentFoods
        let recentIDs = Set(recent.map(\.id))
        let frequent = frequentFoods(excluding: recentIDs)
        let shownIDs = recentIDs.union(frequent.map(\.id))
        let others = foods
            .filter { !shownIDs.contains($0.id) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        if foods.isEmpty {
            Section {
                Text("Your foods will appear here. Scan a barcode, photograph a label or create a food.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        if !recent.isEmpty {
            Section("Recent") {
                ForEach(recent) { foodRow($0) }
            }
        }
        if !frequent.isEmpty {
            Section("Frequent") {
                ForEach(frequent) { foodRow($0) }
            }
        }
        if !others.isEmpty {
            Section("My Foods") {
                ForEach(others) { foodRow($0) }
            }
        }
    }

    @ViewBuilder
    private var searchSections: some View {
        let matches = localMatches
        Section {
            if matches.isEmpty {
                Text("No saved food matches “\(query)”.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(matches) { foodRow($0) }
            }
            Button {
                flow.push(.newFood(FoodDraft(name: query), .manual))
            } label: {
                Label("Create “\(query)”", systemImage: "plus")
            }
        } header: {
            Text("My Foods")
        }
    }

    private func foodRow(_ food: Food) -> some View {
        Button {
            flow.push(.portion(food, .manual))
        } label: {
            FoodRow(food: food)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing) {
            Button {
                food.isHidden = true
                try? context.save()
            } label: {
                Label("Hide", systemImage: "eye.slash")
            }
            .tint(.gray)
            Button {
                flow.push(.editFood(food))
            } label: {
                Label("Edit", systemImage: "pencil")
            }
            .tint(.accentColor)
        }
    }

    // MARK: - Data

    private var query: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var title: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(flow.day) { return "Add Food" }
        return "Add to \(flow.day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))"
    }

    private var recentFoods: [Food] {
        Array(
            foods
                .filter { $0.lastUsedAt != nil }
                .sorted { ($0.lastUsedAt ?? .distantPast) > ($1.lastUsedAt ?? .distantPast) }
                .prefix(8)
        )
    }

    private func frequentFoods(excluding excluded: Set<UUID>) -> [Food] {
        Array(
            foods
                .filter { $0.useCount >= 2 && !excluded.contains($0.id) }
                .sorted { $0.useCount > $1.useCount }
                .prefix(8)
        )
    }

    /// Local matches ranked: prefix matches first, then by usage.
    private var localMatches: [Food] {
        let terms = query.split(separator: " ").map(String.init)
        return foods
            .filter { food in
                let haystack = "\(food.name) \(food.brand ?? "") \(food.barcode ?? "")"
                return terms.allSatisfy { haystack.localizedStandardContains($0) }
            }
            .sorted { lhs, rhs in
                let lhsPrefix = lhs.name.lowercased().hasPrefix(query.lowercased())
                let rhsPrefix = rhs.name.lowercased().hasPrefix(query.lowercased())
                if lhsPrefix != rhsPrefix { return lhsPrefix }
                if lhs.useCount != rhs.useCount { return lhs.useCount > rhs.useCount }
                return (lhs.lastUsedAt ?? .distantPast) > (rhs.lastUsedAt ?? .distantPast)
            }
    }
}

/// Compact icon + title button for the top row of the add-food sheet.
struct QuickActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.title3)
                    .frame(height: 24)
                Text(title)
                    .font(.caption)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .foregroundStyle(Color.accentColor)
        }
        .buttonStyle(.borderless)
    }
}

/// A food in search results / suggestions.
struct FoodRow: View {
    let food: Food

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(food.name)
                    .lineLimit(1)
                Text(food.subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let grams = food.lastAmountGrams {
                Text("\(Format.grams(grams)) g")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
            }
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }
}
