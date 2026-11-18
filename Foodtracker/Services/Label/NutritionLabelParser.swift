import Foundation

/// A piece of recognized text with its normalized bounding box
/// (Vision coordinates: origin bottom-left, values 0…1).
struct TextFragment: Equatable, Sendable {
    var text: String
    var minX: Double
    var minY: Double
    var width: Double
    var height: Double

    var midY: Double { minY + height / 2 }
}

/// Per-100 g values extracted from a nutrition label. `nil` = not found.
struct ParsedNutrition: Equatable, Sendable {
    var kcal: Double?
    var protein: Double?
    var carbs: Double?
    var fat: Double?
    /// Calories were computed from kJ because no kcal value was found.
    var kcalFromKilojoules = false

    var foundAny: Bool { kcal != nil || protein != nil || carbs != nil || fat != nil }
}

/// Extracts per-100 g energy and macros from OCR text of German or English
/// nutrition tables ("Brennwert", "Fett", "Kohlenhydrate", "Eiweiß" / "Energy",
/// "Fat", "Carbohydrate", "Protein").
///
/// Heuristics:
/// - Fragments are grouped into rows by vertical position and joined left to right.
/// - The first number after a nutrient keyword is used, unless the header shows the
///   per-portion column before the per-100 g column.
/// - Sub-rows ("davon gesättigte Fettsäuren", "of which sugars") and %RI values are ignored.
/// - Values that can't be per 100 g (macros > 100 g, energy > 950 kcal) are dropped.
enum NutritionLabelParser {
    static func parse(fragments: [TextFragment]) -> ParsedNutrition {
        parse(rows: rows(from: fragments))
    }

    static func parse(rows rawRows: [String]) -> ParsedNutrition {
        let rows = rawRows.map(normalize).filter { !$0.isEmpty }
        let column = per100gColumn(in: rows)
        let energy = energyKcal(in: rows, column: column)

        return ParsedNutrition(
            kcal: energy.kcal,
            protein: macro(pattern: proteinPattern, in: rows, column: column),
            carbs: macro(pattern: carbsPattern, in: rows, column: column),
            fat: macro(pattern: fatPattern, in: rows, column: column),
            kcalFromKilojoules: energy.fromKilojoules
        )
    }

    // MARK: - Rows

    /// Groups fragments into text rows (top to bottom, left to right).
    static func rows(from fragments: [TextFragment]) -> [String] {
        let sorted = fragments.sorted { $0.midY > $1.midY }
        var rows: [[TextFragment]] = []
        for fragment in sorted {
            if let last = rows.indices.last {
                let row = rows[last]
                let rowMidY = row.map(\.midY).reduce(0, +) / Double(row.count)
                let rowHeight = row.map(\.height).max() ?? fragment.height
                if abs(fragment.midY - rowMidY) < max(rowHeight, fragment.height) * 0.5 {
                    rows[last].append(fragment)
                    continue
                }
            }
            rows.append([fragment])
        }
        return rows.map { row in
            row.sorted { $0.minX < $1.minX }.map(\.text).joined(separator: " ")
        }
    }

    /// Lowercased, "ß" → "ss", diacritics removed, whitespace collapsed.
    static func normalize(_ text: String) -> String {
        let lowered = text.lowercased().replacingOccurrences(of: "ß", with: "ss")
        let folded = lowered.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
        return folded
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    // MARK: - Keywords

    static let energyPattern = #"brennwert|energie|energy|kalorien|calories"#
    static let proteinPattern = #"eiwei\w*|\bprotein\w*"#
    static let carbsPattern = #"kohlenhydrat\w*|carbohydrate\w*|\bcarbs?\b"#
    static let fatPattern = #"\bfett\b|\bfat\b"#

    /// Words that, when they precede the keyword in a row, mark a sub-row.
    private static let subRowMarkers = ["davon", "of which", "gesattigt", "saturate", "trans", "zucker", "sugar", "ungesattigt"]

    private static let anyKeywordPattern = [energyPattern, proteinPattern, carbsPattern, fatPattern, #"\bsalz\b|\bsalt\b|zucker|sugar|ballaststoff|fibre|fiber"#]
        .joined(separator: "|")

    // MARK: - Numbers

    struct NumberToken: Equatable {
        var value: Double
        var unit: String?
    }

    private static let numberRegex = try! NSRegularExpression(
        pattern: #"(?<![\d.,])(<\s*)?(\d{1,5}(?:[.,]\d{1,3})?)\s*(kcal|kj|mg|µg|mcg|g|%)?"#
    )

    /// Numbers with optional units, in reading order. Percentages (%RI) are skipped.
    static func numbers(in text: String) -> [NumberToken] {
        let nsText = text as NSString
        let matches = numberRegex.matches(in: text, range: NSRange(location: 0, length: nsText.length))
        return matches.compactMap { match in
            let raw = nsText.substring(with: match.range(at: 2))
            let unitRange = match.range(at: 3)
            let unit = unitRange.location == NSNotFound ? nil : nsText.substring(with: unitRange)
            if unit == "%" { return nil }
            guard let value = parseNumber(raw, unit: unit) else { return nil }
            return NumberToken(value: value, unit: unit)
        }
    }

    static func parseNumber(_ raw: String, unit: String?) -> Double? {
        var string = raw
        // "1.046 kJ" / "1,046 kJ" are thousands, not decimals.
        if unit == "kj" || unit == "kcal",
           string.range(of: #"^\d{1,2}[.,]\d{3}$"#, options: .regularExpression) != nil {
            string = string.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: "")
        }
        return Double(string.replacingOccurrences(of: ",", with: "."))
    }

    private static func pick(_ values: [Double], column: Int) -> Double? {
        guard !values.isEmpty else { return nil }
        return values.count > column ? values[column] : values[0]
    }

    // MARK: - Columns

    /// 0 if the per-100 g column comes first (default), 1 if a per-portion column precedes it.
    static func per100gColumn(in rows: [String]) -> Int {
        for row in rows {
            guard let hundred = row.range(of: #"(?<!\d)100\s*(g|ml)\b"#, options: .regularExpression) else { continue }
            let before = row[..<hundred.lowerBound]
            let portionBefore = before.range(
                of: #"portion|serving|stuck|riegel|scheibe|glas|\(\s*\d+\s*(g|ml)\s*\)"#,
                options: .regularExpression
            ) != nil
            return portionBefore ? 1 : 0
        }
        return 0
    }

    // MARK: - Energy

    static func energyKcal(in rows: [String], column: Int) -> (kcal: Double?, fromKilojoules: Bool) {
        // Rows with an energy keyword plus the next two rows (kcal often wraps).
        var indices: [Int] = []
        for (index, row) in rows.enumerated() where row.range(of: energyPattern, options: .regularExpression) != nil {
            for candidate in index..<min(index + 3, rows.count) where !indices.contains(candidate) {
                indices.append(candidate)
            }
        }
        let candidates = indices.isEmpty ? rows : indices.sorted().map { rows[$0] }

        // 1. "250 kcal"
        let kcalValues = candidates.flatMap(numbers(in:)).filter { $0.unit == "kcal" }.map(\.value)
        if let kcal = pick(kcalValues, column: column), plausibleKcal(kcal) {
            return (kcal, false)
        }

        // 2. "Energie (kJ/kcal) 1046/250": pairs with a kJ/kcal ratio of ~4.184.
        for row in candidates where row.contains("kcal") && row.contains("kj") {
            let values = numbers(in: row).filter { $0.unit == nil }.map(\.value)
            var pairs: [Double] = []
            var index = 0
            while index + 1 < values.count {
                let kj = values[index]
                let kcal = values[index + 1]
                if kcal > 0, (3.9...4.5).contains(kj / kcal) {
                    pairs.append(kcal)
                    index += 2
                } else {
                    index += 1
                }
            }
            if let kcal = pick(pairs, column: column), plausibleKcal(kcal) {
                return (kcal, false)
            }
        }

        // 3. "kcal 250" (unit before the number).
        for row in candidates where !row.contains("kj") {
            guard let unit = row.range(of: "kcal") else { continue }
            let values = numbers(in: String(row[unit.upperBound...])).filter { $0.unit == nil }.map(\.value)
            if let kcal = pick(values, column: column), plausibleKcal(kcal) {
                return (kcal, false)
            }
        }

        // 4. Only kJ available.
        let kjValues = candidates.flatMap(numbers(in:)).filter { $0.unit == "kj" }.map(\.value)
        if let kj = pick(kjValues, column: column) {
            let kcal = (kj / 4.184).rounded()
            if plausibleKcal(kcal) { return (kcal, true) }
        }
        return (nil, false)
    }

    private static func plausibleKcal(_ value: Double) -> Bool {
        value >= 0 && value <= 950
    }

    // MARK: - Macros

    static func macro(pattern: String, in rows: [String], column: Int) -> Double? {
        for (index, row) in rows.enumerated() {
            guard let keyword = firstMainRowMatch(of: pattern, in: row) else { continue }

            var tokens = numbers(in: String(row[keyword.upperBound...]))
                .filter { $0.unit == nil || $0.unit == "g" }
            // Value wrapped onto the next row.
            if tokens.isEmpty, index + 1 < rows.count {
                let next = rows[index + 1]
                if next.range(of: anyKeywordPattern, options: .regularExpression) == nil {
                    tokens = numbers(in: next).filter { $0.unit == nil || $0.unit == "g" }
                }
            }
            if let value = pick(tokens.map(\.value), column: column), value <= 100 {
                return value
            }
        }
        return nil
    }

    /// First match of `pattern` in `row` that isn't preceded by a sub-row marker.
    private static func firstMainRowMatch(of pattern: String, in row: String) -> Range<String.Index>? {
        var searchStart = row.startIndex
        while let match = row.range(of: pattern, options: .regularExpression, range: searchStart..<row.endIndex) {
            let prefix = row[row.startIndex..<match.lowerBound]
            if !subRowMarkers.contains(where: { prefix.contains($0) }) {
                return match
            }
            searchStart = match.upperBound
        }
        return nil
    }
}
