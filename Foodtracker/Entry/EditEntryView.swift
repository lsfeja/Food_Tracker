import SwiftData
import SwiftUI

/// Edit or delete a logged entry.
struct EditEntryView: View {
    let entry: FoodEntry

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    @State private var name: String
    @State private var gramsText: String
    @State private var kcalText: String
    @State private var proteinText: String
    @State private var carbsText: String
    @State private var fatText: String
    @State private var timestamp: Date
    @State private var confirmDelete = false

    init(entry: FoodEntry) {
        self.entry = entry
        _name = State(initialValue: entry.name)
        _gramsText = State(initialValue: entry.grams.map { Format.editable($0) } ?? "")
        _kcalText = State(initialValue: Format.editable(entry.kcal, maxFractionDigits: 0))
        _proteinText = State(initialValue: Format.editable(entry.protein))
        _carbsText = State(initialValue: Format.editable(entry.carbs))
        _fatText = State(initialValue: Format.editable(entry.fat))
        _timestamp = State(initialValue: entry.timestamp)
    }

    /// Weight-based entries are edited by amount; others by their absolute values.
    private var isWeightBased: Bool {
        (entry.grams ?? 0) > 0 || entry.food != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                }

                if isWeightBased {
                    Section {
                        NumberField(title: "Amount", text: $gramsText, unit: "g")
                    } footer: {
                        if let preview = scaledNutrients {
                            Text("\(Format.kcal(preview.kcal)) kcal · P \(Format.grams(preview.protein)) g · C \(Format.grams(preview.carbs)) g · F \(Format.grams(preview.fat)) g")
                                .monospacedDigit()
                        }
                    }
                } else {
                    Section("Nutrients") {
                        NumberField(title: "Calories", text: $kcalText, unit: "kcal")
                        NumberField(title: "Protein", text: $proteinText, unit: "g")
                        NumberField(title: "Carbs", text: $carbsText, unit: "g")
                        NumberField(title: "Fat", text: $fatText, unit: "g")
                    }
                }

                Section {
                    DatePicker("Time", selection: $timestamp)
                    LabeledContent("Source", value: entry.source.displayName)
                }

                Section {
                    Button("Delete Entry", role: .destructive) {
                        confirmDelete = true
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!isValid)
                }
            }
            .confirmationDialog("Delete this entry?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    FoodLogger.delete(entry, in: context)
                    dismiss()
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var grams: Double? {
        DecimalParser.parse(gramsText).flatMap { $0 > 0 ? $0 : nil }
    }

    private var scaledNutrients: Nutrients? {
        guard let grams else { return nil }
        if let old = entry.grams, old > 0 {
            return entry.nutrients.scaled(by: grams / old)
        }
        return entry.food?.nutrients(forGrams: grams)
    }

    private var isValid: Bool {
        if name.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        if isWeightBased { return grams != nil }
        return DecimalParser.parse(kcalText) != nil
    }

    private func save() {
        entry.name = name.trimmingCharacters(in: .whitespaces)
        entry.timestamp = timestamp
        if isWeightBased {
            if let grams { entry.updateGrams(grams) }
        } else {
            entry.nutrients = Nutrients(
                kcal: DecimalParser.parse(kcalText) ?? entry.kcal,
                protein: DecimalParser.parse(proteinText) ?? 0,
                carbs: DecimalParser.parse(carbsText) ?? 0,
                fat: DecimalParser.parse(fatText) ?? 0
            )
        }
        FoodLogger.commit(context)
        dismiss()
    }
}
