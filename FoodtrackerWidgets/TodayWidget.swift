import SwiftUI
import WidgetKit

/// Today's calories and macros on the Lock Screen and Home Screen.
struct TodayWidget: Widget {
    static let kind = "TodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Calories left and macro progress for today.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .systemSmall])
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                CircularView(budget: entry.budget)
                    .containerBackground(for: .widget) { Color.clear }
            case .accessoryRectangular:
                RectangularView(budget: entry.budget)
                    .containerBackground(for: .widget) { Color.clear }
            case .accessoryInline:
                InlineView(budget: entry.budget)
                    .containerBackground(for: .widget) { Color.clear }
            default:
                SmallView(budget: entry.budget)
                    .containerBackground(for: .widget) { Color("WidgetBackground") }
            }
        }
        .widgetURL(DeepLink.today.url)
    }
}

// MARK: - Helpers

private extension DayBudget {
    var remainingText: String { Format.kcal(abs(calories.remaining)) }
    var remainingLabel: String { calories.isOver ? "kcal over" : "kcal left" }
    var clampedProgress: Double {
        guard calories.progress.isFinite else { return 0 }
        return min(max(calories.progress, 0), 1)
    }
}

private func fraction(_ value: Double, of target: Double) -> Double {
    guard target > 0 else { return 0 }
    return min(max(value / target, 0), 1)
}

// MARK: - Lock Screen

/// Ring with remaining kcal in the center.
private struct CircularView: View {
    let budget: DayBudget

    var body: some View {
        Gauge(value: budget.clampedProgress) {
            Image(systemName: "fork.knife")
        } currentValueLabel: {
            Text(budget.calories.isOver ? "−" + budget.remainingText : budget.remainingText)
                .font(.system(.body, design: .rounded).weight(.semibold))
                .minimumScaleFactor(0.5)
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
        .accessibilityLabel("\(budget.remainingText) \(budget.remainingLabel)")
    }
}

/// Remaining kcal plus protein and carb progress.
private struct RectangularView: View {
    let budget: DayBudget

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(budget.remainingText)
                    .font(.system(.headline, design: .rounded))
                    .widgetAccentable()
                Text(budget.remainingLabel)
                    .font(.caption)
            }
            MacroLine(label: "P", value: budget.eaten.protein, target: budget.targets.protein)
            MacroLine(label: "C", value: budget.eaten.carbs, target: budget.targets.carbs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MacroLine: View {
    let label: String
    let value: Double
    let target: Double

    var body: some View {
        HStack(spacing: 5) {
            Text(label)
                .font(.caption2.weight(.bold))
                .frame(width: 10, alignment: .leading)
            ProgressView(value: fraction(value, of: target))
                .progressViewStyle(.linear)
                .widgetAccentable()
            Text("\(Format.grams(value))/\(Format.grams(target))")
                .font(.caption2)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

/// "1,240 kcal left"
private struct InlineView: View {
    let budget: DayBudget

    var body: some View {
        Label("\(budget.remainingText) \(budget.remainingLabel)", systemImage: "fork.knife")
    }
}

// MARK: - Home Screen

private struct SmallView: View {
    let budget: DayBudget

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .stroke(Color.secondary.opacity(0.2), lineWidth: 6)
                    Circle()
                        .trim(from: 0, to: budget.clampedProgress)
                        .stroke(budget.calories.isOver ? Color.orange : Color.accentColor,
                                style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 0) {
                    Text(budget.remainingText)
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(budget.remainingLabel)
                        .font(.caption)
                        .foregroundStyle(budget.calories.isOver ? Color.orange : Color.secondary)
                }
            }

            Spacer(minLength: 0)

            VStack(spacing: 6) {
                SmallMacroRow(title: "Protein", value: budget.eaten.protein, target: budget.targets.protein)
                SmallMacroRow(title: "Carbs", value: budget.eaten.carbs, target: budget.targets.carbs)
                SmallMacroRow(title: "Fat", value: budget.eaten.fat, target: budget.targets.fat, height: 3)
            }
        }
    }
}

private struct SmallMacroRow: View {
    let title: String
    let value: Double
    let target: Double
    var height: CGFloat = 4

    var body: some View {
        VStack(spacing: 2) {
            HStack {
                Text(title)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Format.grams(value))/\(Format.grams(target)) g")
                    .monospacedDigit()
            }
            .font(.caption2)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(0.2))
                    Capsule()
                        .fill(Color.accentColor)
                        .frame(width: proxy.size.width * fraction(value, of: target))
                }
            }
            .frame(height: height)
        }
    }
}
