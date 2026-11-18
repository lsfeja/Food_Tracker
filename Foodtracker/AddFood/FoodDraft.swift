import Foundation

/// Unsaved food data from manual entry, Open Food Facts or a label photo.
/// Nutrients are per 100 g; `nil` means unknown.
struct FoodDraft: Hashable, Sendable {
    var name: String = ""
    var brand: String?
    var barcode: String?
    var kcal: Double?
    var protein: Double?
    var carbs: Double?
    var fat: Double?
    var servingGrams: Double?
    var source: FoodSource = .custom

    /// Enough data to log without user input.
    var isComplete: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && kcal != nil
    }

    var per100g: Nutrients {
        Nutrients(kcal: kcal ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0)
    }

    func makeFood() -> Food {
        let trimmedBrand = brand?.trimmingCharacters(in: .whitespaces)
        return Food(
            name: name.trimmingCharacters(in: .whitespaces),
            brand: (trimmedBrand?.isEmpty ?? true) ? nil : trimmedBrand,
            barcode: barcode,
            per100g: per100g,
            servingGrams: servingGrams,
            source: source
        )
    }
}
