import SwiftUI

/// A labeled, right-aligned decimal text field for forms.
///
/// String-backed so partially typed values ("9,") don't get reformatted. Parse the text
/// with `DecimalParser`.
struct NumberField: View {
    let title: String
    @Binding var text: String
    var unit: String?
    var prompt: String = "0"

    var body: some View {
        LabeledContent {
            HStack(spacing: 4) {
                TextField(title, text: $text, prompt: Text(prompt))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                if let unit {
                    Text(unit)
                        .foregroundStyle(.secondary)
                }
            }
        } label: {
            Text(title)
        }
    }
}
