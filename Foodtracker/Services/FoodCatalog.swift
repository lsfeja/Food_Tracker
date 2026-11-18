import Foundation
import SwiftData

/// Helpers for finding and saving foods in the local catalog.
@MainActor
enum FoodCatalog {
    /// Equivalent spellings of a barcode (UPC-A ↔ EAN-13 with a leading zero).
    nonisolated static func barcodeVariants(_ code: String) -> Set<String> {
        let digits = code.filter(\.isNumber)
        guard !digits.isEmpty else { return [] }
        var variants: Set<String> = [digits]
        if digits.count == 12 { variants.insert("0" + digits) }
        if digits.count == 13, digits.hasPrefix("0") { variants.insert(String(digits.dropFirst())) }
        return variants
    }

    /// A saved food with this barcode, including hidden ones.
    static func food(withBarcode code: String, in context: ModelContext) -> Food? {
        let variants = barcodeVariants(code)
        guard !variants.isEmpty else { return nil }
        let descriptor = FetchDescriptor<Food>(predicate: #Predicate<Food> { $0.barcode != nil })
        let candidates = (try? context.fetch(descriptor)) ?? []
        return candidates.first { food in
            guard let barcode = food.barcode else { return false }
            return !variants.isDisjoint(with: barcodeVariants(barcode))
        }
    }

    /// Saves a draft as a food, reusing an existing food with the same barcode.
    static func save(_ draft: FoodDraft, in context: ModelContext) -> Food {
        if let barcode = draft.barcode, let existing = food(withBarcode: barcode, in: context) {
            existing.isHidden = false
            return existing
        }
        let food = draft.makeFood()
        context.insert(food)
        try? context.save()
        return food
    }
}
