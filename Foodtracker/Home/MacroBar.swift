import SwiftUI

/// Progress of one macronutrient against its target.
struct MacroBar: View {
    let title: String
    let value: Double
    let target: Double
    /// Secondary macros (fat) are rendered smaller.
    var isSecondary = false

    var body: some View {
        VStack(alignment: .leading, spacing: isSecondary ? 4 : 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(isSecondary ? .footnote : .subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(Format.grams(value))
                        .font(isSecondary ? .footnote.weight(.semibold) : .body.weight(.semibold))
                        .contentTransition(.numericText())
                    Text(" / \(Format.grams(target)) g")
                        .font(isSecondary ? .footnote : .subheadline)
                        .foregroundStyle(.secondary)
                }
                .monospacedDigit()
            }
            ProgressBar(progress: target > 0 ? value / target : 0, height: isSecondary ? 5 : 9)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title): \(Format.grams(value)) of \(Format.grams(target)) grams")
    }
}
