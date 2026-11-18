import Foundation
import SwiftData

/// A food in the user's catalog. Nutrients are stored per 100 g.
@Model
final class Food {
    var id: UUID = UUID()
    var name: String = ""
    var brand: String?
    var barcode: String?

    var kcalPer100g: Double = 0
    var proteinPer100g: Double = 0
    var carbsPer100g: Double = 0
    var fatPer100g: Double = 0

    /// Typical portion in grams (e.g. one bar or one serving), if known.
    var servingGrams: Double?

    var sourceRaw: String = FoodSource.custom.rawValue
    var createdAt: Date = Date.now

    // Usage statistics drive the "recent" and "frequent" ordering.
    var lastUsedAt: Date?
    var useCount: Int = 0
    var lastAmountGrams: Double?

    /// Hidden foods don't show up in search or suggestions but keep their history.
    var isHidden: Bool = false

    @Relationship(deleteRule: .nullify, inverse: \FoodEntry.food)
    var entries: [FoodEntry]? = []

    init(
        name: String,
        brand: String? = nil,
        barcode: String? = nil,
        per100g: Nutrients,
        servingGrams: Double? = nil,
        source: FoodSource = .custom
    ) {
        self.name = name
        self.brand = brand
        self.barcode = barcode
        self.kcalPer100g = per100g.kcal
        self.proteinPer100g = per100g.protein
        self.carbsPer100g = per100g.carbs
        self.fatPer100g = per100g.fat
        self.servingGrams = servingGrams
        self.sourceRaw = source.rawValue
    }

    var per100g: Nutrients {
        get {
            Nutrients(kcal: kcalPer100g, protein: proteinPer100g, carbs: carbsPer100g, fat: fatPer100g)
        }
        set {
            kcalPer100g = newValue.kcal
            proteinPer100g = newValue.protein
            carbsPer100g = newValue.carbs
            fatPer100g = newValue.fat
        }
    }

    var source: FoodSource {
        get { FoodSource(rawValue: sourceRaw) ?? .custom }
        set { sourceRaw = newValue.rawValue }
    }

    /// Absolute nutrients for an amount in grams.
    func nutrients(forGrams grams: Double) -> Nutrients {
        per100g.forAmount(grams: grams)
    }

    /// Records a use so the food ranks higher in recent/frequent lists.
    func markUsed(grams: Double, at date: Date = .now) {
        lastUsedAt = date
        useCount += 1
        lastAmountGrams = grams
        isHidden = false
    }

    /// Secondary line for lists, e.g. "Brand · 250 kcal / 100 g".
    var subtitle: String {
        let energy = "\(Format.kcal(kcalPer100g)) kcal / 100 g"
        if let brand, !brand.isEmpty {
            return "\(brand) · \(energy)"
        }
        return energy
    }
}
