import SwiftUI

/// Large ring showing eaten vs. budget with the remaining calories in the center.
struct CalorieRing: View {
    let budget: CalorieBudget
    var lineWidth: CGFloat = 18

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.15), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: trimmedProgress)
                .stroke(ringColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.snappy, value: trimmedProgress)

            VStack(spacing: 2) {
                Text(Format.kcal(abs(budget.remaining)))
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(budget.isOver ? "kcal over" : "kcal left")
                    .font(.subheadline)
                    .foregroundStyle(budget.isOver ? AnyShapeStyle(Color.orange) : AnyShapeStyle(.secondary))
            }
            .padding(lineWidth * 1.5)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(accessibilityText))
    }

    private var accessibilityText: String {
        budget.isOver
            ? "\(Format.kcal(-budget.remaining)) kilocalories over budget"
            : "\(Format.kcal(budget.remaining)) kilocalories left"
    }

    private var trimmedProgress: CGFloat {
        guard budget.progress.isFinite else { return 0 }
        return CGFloat(min(max(budget.progress, 0), 1))
    }

    private var ringColor: Color {
        budget.isOver ? .orange : .accentColor
    }
}
