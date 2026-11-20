import SwiftUI

/// Compact text field bound to an optional number. Empty text means `nil`.
/// String-backed so partial input ("8,") isn't reformatted while typing.
struct OptionalNumberField: View {
    let placeholder: String
    @Binding var value: Double?
    /// 0 for integers (number pad), > 0 for decimals.
    var fractionDigits = 1
    var width: CGFloat?

    @State private var text = ""

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(fractionDigits > 0 ? .decimalPad : .numberPad)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .frame(width: width)
            .onAppear {
                text = formatted(value)
            }
            .onChange(of: text) { _, newValue in
                if newValue.trimmingCharacters(in: .whitespaces).isEmpty {
                    if value != nil { value = nil }
                } else if let parsed = DecimalParser.parse(newValue), parsed >= 0, parsed != value {
                    value = parsed
                }
            }
            .onChange(of: value) { _, newValue in
                // Reflect external changes without fighting the user's typing.
                if DecimalParser.parse(text) != newValue {
                    text = formatted(newValue)
                }
            }
    }

    private func formatted(_ number: Double?) -> String {
        number.map { Format.editable($0, maxFractionDigits: max(fractionDigits, 0)) } ?? ""
    }
}

extension Binding where Value == Int? {
    /// Bridges an optional Int to `OptionalNumberField`.
    var asDouble: Binding<Double?> {
        Binding<Double?>(
            get: { wrappedValue.map(Double.init) },
            set: { wrappedValue = $0.map { Int($0.rounded()) } }
        )
    }
}

/// "Zone 1–5 / RPE 1–10 / none" picker.
struct IntensityPicker: View {
    var title = "Intensity"
    @Binding var intensity: Intensity?

    var body: some View {
        Picker(title, selection: $intensity) {
            Text("None").tag(Intensity?.none)
            Section("Zone") {
                ForEach(1...5, id: \.self) { zone in
                    Text("Zone \(zone)").tag(Intensity?.some(.zone(zone)))
                }
            }
            Section("RPE") {
                ForEach(1...10, id: \.self) { rpe in
                    Text("RPE \(rpe)").tag(Intensity?.some(.rpe(rpe)))
                }
            }
        }
    }
}
