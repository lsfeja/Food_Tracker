import Foundation

/// Energy (kcal) and macronutrients (g).
///
/// Used both for per-100 g reference values (`Food.per100g`) and for absolute
/// amounts (`FoodEntry.nutrients`, daily totals).
struct Nutrients: Hashable, Codable, Sendable {
    var kcal: Double
    var protein: Double
    var carbs: Double
    var fat: Double

    init(kcal: Double = 0, protein: Double = 0, carbs: Double = 0, fat: Double = 0) {
        self.kcal = kcal
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }

    static let zero = Nutrients()

    /// Absolute values for `grams` of a food, treating `self` as per-100 g values.
    func forAmount(grams: Double) -> Nutrients {
        scaled(by: grams / 100)
    }

    func scaled(by factor: Double) -> Nutrients {
        Nutrients(
            kcal: kcal * factor,
            protein: protein * factor,
            carbs: carbs * factor,
            fat: fat * factor
        )
    }

    /// Energy derived from macros using Atwater factors (4 / 4 / 9 kcal per gram).
    var kcalFromMacros: Double {
        protein * 4 + carbs * 4 + fat * 9
    }

    static func + (lhs: Nutrients, rhs: Nutrients) -> Nutrients {
        Nutrients(
            kcal: lhs.kcal + rhs.kcal,
            protein: lhs.protein + rhs.protein,
            carbs: lhs.carbs + rhs.carbs,
            fat: lhs.fat + rhs.fat
        )
    }

    static func += (lhs: inout Nutrients, rhs: Nutrients) {
        lhs = lhs + rhs
    }
}

extension Sequence where Element == Nutrients {
    var sum: Nutrients { reduce(Nutrients.zero, +) }
}
