import SwiftData
import SwiftUI

/// Create a food (optionally prefilled from Open Food Facts or a label photo) or edit
/// an existing one. All nutrient values are per 100 g.
struct FoodEditorView: View {
    enum Mode {
        case create(FoodDraft, EntrySource)
        case edit(Food)
    }

    let mode: Mode

    @Environment(AddFoodFlow.self) private var flow
    @Environment(\.modelContext) private var context

    @State private var name: String
    @State private var brand: String
    @State private var barcode: String
    @State private var kcalText: String
    @State private var proteinText: String
    @State private var carbsText: String
    @State private var fatText: String
    @State private var servingText: String
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case name, kcal }

    init(mode: Mode) {
        self.mode = mode
        let draft: FoodDraft
        switch mode {
        case .create(let value, _):
            draft = value
        case .edit(let food):
            draft = FoodDraft(
                name: food.name,
                brand: food.brand,
                barcode: food.barcode,
                kcal: food.kcalPer100g,
                protein: food.proteinPer100g,
                carbs: food.carbsPer100g,
                fat: food.fatPer100g,
                servingGrams: food.servingGrams,
                source: food.source
            )
        }
        _name = State(initialValue: draft.name)
        _brand = State(initialValue: draft.brand ?? "")
        _barcode = State(initialValue: draft.barcode ?? "")
        _kcalText = State(initialValue: draft.kcal.map { Format.editable($0, maxFractionDigits: 0) } ?? "")
        _proteinText = State(initialValue: draft.protein.map { Format.editable($0) } ?? "")
        _carbsText = State(initialValue: draft.carbs.map { Format.editable($0) } ?? "")
        _fatText = State(initialValue: draft.fat.map { Format.editable($0) } ?? "")
        _servingText = State(initialValue: draft.servingGrams.map { Format.editable($0) } ?? "")
    }

    var body: some View {
        Form {
            if let notice {
                Section {
                    Label(notice, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                TextField("Name", text: $name)
                    .focused($focusedField, equals: .name)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .kcal }
                TextField("Brand (optional)", text: $brand)
            }

            Section {
                LabeledContent {
                    HStack(spacing: 4) {
                        TextField("Calories", text: $kcalText, prompt: Text("0"))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                            .focused($focusedField, equals: .kcal)
                        Text("kcal").foregroundStyle(.secondary)
                    }
                } label: {
                    Text("Calories")
                }
                NumberField(title: "Protein", text: $proteinText, unit: "g")
                NumberField(title: "Carbohydrates", text: $carbsText, unit: "g")
                NumberField(title: "Fat", text: $fatText, unit: "g")
            } header: {
                Text("Per 100 g")
            } footer: {
                macroHint
            }

            Section {
                NumberField(title: "Serving size", text: $servingText, unit: "g", prompt: "optional")
                LabeledContent("Barcode") {
                    TextField("optional", text: $barcode)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                }
            }
        }
        .navigationTitle(isEditing ? "Edit Food" : "New Food")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(isEditing ? "Save" : "Next") { save() }
                    .disabled(!isValid)
            }
        }
        .task {
            if name.isEmpty {
                focusedField = .name
            } else if kcalText.isEmpty {
                focusedField = .kcal
            }
        }
    }

    // MARK: - Helpers

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var notice: String? {
        guard case .create(let draft, _) = mode else { return nil }
        switch draft.source {
        case .label:
            return "Values were read from the label photo. Please check them against the label."
        case .openFoodFacts where !draft.isComplete:
            return "Open Food Facts has incomplete data for this product. Please fill in the missing values."
        default:
            return nil
        }
    }

    /// Suggests kcal from macros when calories are missing, or flags a large mismatch.
    @ViewBuilder
    private var macroHint: some View {
        let macros = Nutrients(
            protein: DecimalParser.parse(proteinText) ?? 0,
            carbs: DecimalParser.parse(carbsText) ?? 0,
            fat: DecimalParser.parse(fatText) ?? 0
        )
        let estimate = macros.kcalFromMacros
        if estimate > 0 {
            if let kcal = DecimalParser.parse(kcalText) {
                if abs(kcal - estimate) > max(40, kcal * 0.2) {
                    Text("Macros add up to about \(Format.kcal(estimate)) kcal. Check the values.")
                }
            } else {
                Button("Use \(Format.kcal(estimate)) kcal (from macros)") {
                    kcalText = Format.editable(estimate, maxFractionDigits: 0)
                }
                .font(.footnote)
            }
        }
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespaces)
    }

    private var isValid: Bool {
        guard !trimmedName.isEmpty, let kcal = DecimalParser.parse(kcalText), kcal >= 0 else { return false }
        return true
    }

    private func save() {
        guard isValid else { return }
        let nutrients = Nutrients(
            kcal: DecimalParser.parse(kcalText) ?? 0,
            protein: DecimalParser.parse(proteinText) ?? 0,
            carbs: DecimalParser.parse(carbsText) ?? 0,
            fat: DecimalParser.parse(fatText) ?? 0
        )
        let serving = DecimalParser.parse(servingText).flatMap { $0 > 0 ? $0 : nil }
        let trimmedBrand = brand.trimmingCharacters(in: .whitespaces)
        let trimmedBarcode = barcode.trimmingCharacters(in: .whitespaces)

        switch mode {
        case .edit(let food):
            food.name = trimmedName
            food.brand = trimmedBrand.isEmpty ? nil : trimmedBrand
            food.barcode = trimmedBarcode.isEmpty ? nil : trimmedBarcode
            food.per100g = nutrients
            food.servingGrams = serving
            try? context.save()
            flow.pop()

        case .create(let draft, let entrySource):
            let food = Food(
                name: trimmedName,
                brand: trimmedBrand.isEmpty ? nil : trimmedBrand,
                barcode: trimmedBarcode.isEmpty ? nil : trimmedBarcode,
                per100g: nutrients,
                servingGrams: serving,
                source: draft.source
            )
            context.insert(food)
            try? context.save()
            flow.replaceTop(with: .portion(food, entrySource))
        }
    }
}
