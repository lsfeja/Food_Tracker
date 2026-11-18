import SwiftData
import SwiftUI

/// Log calories (and optionally macros) directly, without creating a food.
struct QuickAddView: View {
    @Environment(AddFoodFlow.self) private var flow
    @Environment(\.modelContext) private var context

    @State private var name = ""
    @State private var kcalText = ""
    @State private var proteinText = ""
    @State private var carbsText = ""
    @State private var fatText = ""
    @FocusState private var kcalFocused: Bool

    var body: some View {
        Form {
            Section {
                LabeledContent {
                    HStack(spacing: 4) {
                        TextField("Calories", text: $kcalText, prompt: Text("0"))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .font(.title2.weight(.semibold))
                            .monospacedDigit()
                            .focused($kcalFocused)
                        Text("kcal").foregroundStyle(.secondary)
                    }
                } label: {
                    Text("Calories")
                }
            }
            Section("Macros (optional)") {
                NumberField(title: "Protein", text: $proteinText, unit: "g")
                NumberField(title: "Carbs", text: $carbsText, unit: "g")
                NumberField(title: "Fat", text: $fatText, unit: "g")
            }
            Section {
                TextField("Name (optional)", text: $name)
            }
        }
        .navigationTitle("Quick Add")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Add", action: add)
                    .disabled(kcal == nil)
            }
        }
        .task {
            try? await Task.sleep(for: .milliseconds(350))
            kcalFocused = true
        }
    }

    private var kcal: Double? {
        DecimalParser.parse(kcalText).flatMap { $0 > 0 ? $0 : nil }
    }

    private func add() {
        guard let kcal else { return }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        FoodLogger.logQuick(
            name: trimmed.isEmpty ? "Quick add" : trimmed,
            nutrients: Nutrients(
                kcal: kcal,
                protein: DecimalParser.parse(proteinText) ?? 0,
                carbs: DecimalParser.parse(carbsText) ?? 0,
                fat: DecimalParser.parse(fatText) ?? 0
            ),
            day: flow.day,
            in: context
        )
        flow.finish()
    }
}
