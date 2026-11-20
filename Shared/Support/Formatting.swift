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

    /// "45 min", "1 h 30 min", "2 h"
    static func duration(minutes: Double) -> String {
        let total = Int(minutes.rounded())
        if total < 60 { return "\(total) min" }
        let hours = total / 60
        let rest = total % 60
        return rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min"
    }

    /// Duration of an interval step: "4′", "2.5′", "30″".
    static func shortMinutes(_ minutes: Double) -> String {
        if minutes < 1 {
            return "\(Int((minutes * 60).rounded()))″"
        }
        return "\(minutes.formatted(.number.precision(.fractionLength(0...1))))′"
    }

    /// "10 km", "10.5 km"
    static func distance(km: Double) -> String {
        "\(km.formatted(.number.precision(.fractionLength(0...1)))) km"
    }

    /// Interval distance: "400 m" below 1 km, otherwise km.
    static func shortDistance(_ km: Double) -> String {
        km < 1 ? "\(Int((km * 1000).rounded())) m" : distance(km: km)
    }

    /// Large distances without decimals ("4,210"), small ones with one ("12.4").
    static func distanceValue(km: Double) -> String {
        km >= 100
            ? Int(km.rounded()).formatted()
            : km.formatted(.number.precision(.fractionLength(0...1)))
    }

    /// Hours: "123", "12.5"
    static func hoursValue(seconds: Double) -> String {
        let hours = seconds / 3600
        return hours >= 100
            ? Int(hours.rounded()).formatted()
            : hours.formatted(.number.precision(.fractionLength(0...1)))
    }

    /// Training volume: "850" (kg) below 10 t, otherwise tonnes ("12.4").
    static func volume(_ kg: Double) -> String {
        kg >= 10_000
            ? (kg / 1000).formatted(.number.precision(.fractionLength(0...1)))
            : Int(kg.rounded()).formatted()
    }

    static func volumeUnit(_ kg: Double) -> String {
        kg >= 10_000 ? "t" : "kg"
    }

    /// Weight in kg without unit: "80", "82.5"
    static func weight(_ kg: Double) -> String {
        kg.formatted(.number.precision(.fractionLength(0...2)))
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
