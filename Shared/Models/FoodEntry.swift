import Foundation
import SwiftData

/// A logged item in the diary.
///
/// Nutrients are stored as **absolute values** (a snapshot at logging time), so editing
/// or deleting the linked `Food` never changes history. `grams` is optional so that
/// estimates without a weight (quick add, planned AI estimates) fit the same model.
@Model
final class FoodEntry {
    var id: UUID = UUID()
    var timestamp: Date = Date.now
    var name: String = ""
    var grams: Double?

    var kcal: Double = 0
    var protein: Double = 0
    var carbs: Double = 0
    var fat: Double = 0

    var sourceRaw: String = EntrySource.manual.rawValue
    /// `true` when values are an estimate (e.g. quick add or AI) rather than measured.
    var isEstimated: Bool = false
    var note: String?

    var food: Food?

    init(
        timestamp: Date = .now,
        name: String,
        grams: Double?,
        nutrients: Nutrients,
        source: EntrySource,
        isEstimated: Bool = false,
        food: Food? = nil
    ) {
        self.timestamp = timestamp
        self.name = name
        self.grams = grams
        self.kcal = nutrients.kcal
        self.protein = nutrients.protein
        self.carbs = nutrients.carbs
        self.fat = nutrients.fat
        self.sourceRaw = source.rawValue
        self.isEstimated = isEstimated
        self.food = food
    }

    var nutrients: Nutrients {
        get { Nutrients(kcal: kcal, protein: protein, carbs: carbs, fat: fat) }
        set {
            kcal = newValue.kcal
            protein = newValue.protein
            carbs = newValue.carbs
            fat = newValue.fat
        }
    }

    var source: EntrySource {
        get { EntrySource(rawValue: sourceRaw) ?? .manual }
        set { sourceRaw = newValue.rawValue }
    }

    /// Changes the amount. Nutrients scale proportionally to the previous amount, or
    /// are recomputed from the linked food if there was no previous amount.
    func updateGrams(_ newGrams: Double) {
        guard newGrams > 0 else { return }
        if let oldGrams = grams, oldGrams > 0 {
            nutrients = nutrients.scaled(by: newGrams / oldGrams)
        } else if let food {
            nutrients = food.nutrients(forGrams: newGrams)
        }
        grams = newGrams
    }
}
