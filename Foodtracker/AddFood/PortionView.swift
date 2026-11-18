import SwiftData
import SwiftUI

/// Enter the amount in grams and log the food. The fastest path: one field, one button.
struct PortionView: View {
    let food: Food
    let source: EntrySource

    @Environment(AddFoodFlow.self) private var flow
    @Environment(\.modelContext) private var context

    @State private var amountText = ""
    @State private var logged = false
    @FocusState private var amountFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                header
                amountInput
                presets
                preview
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.never)
        .navigationTitle(food.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { flow.push(.editFood(food)) }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button(action: log) {
                Text("Add \(Format.kcal(nutrients.kcal)) kcal")
                    .font(.headline)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(grams == nil)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(.bar)
        }
        .sensoryFeedback(.success, trigger: logged)
        .task {
            try? await Task.sleep(for: .milliseconds(350))
            amountFocused = true
        }
    }

    // MARK: - Subviews

    private var header: some View {
        VStack(spacing: 4) {
            if let brand = food.brand, !brand.isEmpty {
                Text(brand)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Text("Per 100 g: \(Format.kcal(food.kcalPer100g)) kcal · P \(Format.grams(food.proteinPer100g)) · C \(Format.grams(food.carbsPer100g)) · F \(Format.grams(food.fatPer100g))")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .multilineTextAlignment(.center)
        }
    }

    private var amountInput: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            TextField("Amount", text: $amountText, prompt: Text(Format.editable(suggestedGrams)))
                .font(.system(size: 56, weight: .bold, design: .rounded))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .focused($amountFocused)
                .fixedSize()
                .onSubmit(log)
            Text("g")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }

    private var presets: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(presetAmounts, id: \.grams) { preset in
                    Button {
                        amountText = Format.editable(preset.grams)
                    } label: {
                        Text(preset.label)
                            .font(.subheadline)
                            .monospacedDigit()
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Color.secondary.opacity(0.12), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private var preview: some View {
        HStack {
            previewValue(Format.kcal(nutrients.kcal), "kcal")
            previewValue(Format.grams(nutrients.protein), "Protein")
            previewValue(Format.grams(nutrients.carbs), "Carbs")
            previewValue(Format.grams(nutrients.fat), "Fat")
        }
        .padding(.vertical, 14)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func previewValue(_ value: String, _ title: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Logic

    private struct Preset {
        let grams: Double
        let label: String
    }

    /// Amount used when the field is left empty.
    private var suggestedGrams: Double {
        food.lastAmountGrams ?? food.servingGrams ?? 100
    }

    private var presetAmounts: [Preset] {
        var presets: [Preset] = []
        if let serving = food.servingGrams, serving > 0 {
            presets.append(Preset(grams: serving, label: "1 serving · \(Format.grams(serving)) g"))
        }
        if let last = food.lastAmountGrams, last > 0, last != food.servingGrams {
            presets.append(Preset(grams: last, label: "Last · \(Format.grams(last)) g"))
        }
        for grams in [50.0, 100, 150, 200, 250] where !presets.contains(where: { $0.grams == grams }) {
            presets.append(Preset(grams: grams, label: "\(Format.grams(grams)) g"))
        }
        return presets
    }

    private var grams: Double? {
        if amountText.trimmingCharacters(in: .whitespaces).isEmpty { return suggestedGrams }
        guard let value = DecimalParser.parse(amountText), value > 0 else { return nil }
        return value
    }

    private var nutrients: Nutrients {
        food.nutrients(forGrams: grams ?? 0)
    }

    private func log() {
        guard let grams, !logged else { return }
        FoodLogger.log(food, grams: grams, source: source, day: flow.day, in: context)
        logged = true
        flow.finish()
    }
}
