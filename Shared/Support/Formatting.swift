import Foundation

/// Number formatting helpers (metric units, current locale).
enum Format {
    /// "1,240" (grouping per locale), no unit.
    static func kcal(_ value: Double) -> String {
        Int(value.rounded()).formatted()
    }

    /// "+320" / "−120" for signed calorie deltas.
    static func signedKcal(_ value: Double) -> String {
        let rounded = Int(value.rounded())
        if rounded > 0 { return "+\(rounded.formatted())" }
        if rounded < 0 { return "−\(abs(rounded).formatted())" }
        return "0"
    }

    /// Grams: one decimal below 10 g (e.g. "2.5"), whole numbers above.
    static func grams(_ value: Double) -> String {
        if abs(value) < 10 {
            return value.formatted(.number.precision(.fractionLength(0...1)))
        }
        return Int(value.rounded()).formatted()
    }

    /// Value for prefilling a text field: up to `maxFractionDigits` decimals, no grouping.
    static func editable(_ value: Double, maxFractionDigits: Int = 1) -> String {
        value.formatted(.number.precision(.fractionLength(0...maxFractionDigits)).grouping(.never))
    }
}

/// Parses user-entered decimal numbers. Accepts both "," and "." as decimal separator.
enum DecimalParser {
    static func parse(_ text: String) -> Double? {
        var string = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\u{00A0}", with: "")
        guard !string.isEmpty else { return nil }

        if let lastComma = string.lastIndex(of: ","), let lastDot = string.lastIndex(of: ".") {
            // Both present: the last one is the decimal separator, the other groups thousands.
            if lastComma > lastDot {
                string = string.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
            } else {
                string = string.replacingOccurrences(of: ",", with: "")
            }
        } else {
            string = string.replacingOccurrences(of: ",", with: ".")
        }

        guard let value = Double(string), value.isFinite else { return nil }
        return value
    }
}
