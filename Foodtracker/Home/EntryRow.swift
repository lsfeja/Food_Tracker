import SwiftUI

/// One logged item in the day's list.
struct EntryRow: View {
    let entry: FoodEntry

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(entry.name)
                        .font(.body)
                        .lineLimit(1)
                    if entry.source != .manual {
                        Image(systemName: entry.source.systemImage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityLabel(entry.source.displayName)
                    }
                }
                Text(detailLine)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                KcalText(value: entry.kcal, approximate: entry.isEstimated)
                Text("P \(Format.grams(entry.protein)) · C \(Format.grams(entry.carbs)) · F \(Format.grams(entry.fat))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }

    private var detailLine: String {
        let time = entry.timestamp.formatted(date: .omitted, time: .shortened)
        if let grams = entry.grams {
            return "\(Format.grams(grams)) g · \(time)"
        }
        return time
    }
}

/// An imported activity in the day's list.
struct ActivityRow: View {
    let activity: ActivityRecord

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(Color.accentColor)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.name)
                    .lineLimit(1)
                Text("\(activity.source.displayName) · \(Duration.seconds(activity.durationSeconds).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated)))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            KcalText(value: activity.activeCalories, approximate: activity.caloriesEstimated)
        }
    }

    private var symbol: String {
        let type = activity.activityType.lowercased()
        if type.contains("ride") || type.contains("cycl") { return "figure.outdoor.cycle" }
        if type.contains("run") { return "figure.run" }
        if type.contains("swim") { return "figure.pool.swim" }
        if type.contains("walk") || type.contains("hike") { return "figure.walk" }
        if type.contains("ski") { return "figure.skiing.crosscountry" }
        if type.contains("weight") || type.contains("workout") { return "figure.strengthtraining.traditional" }
        return "flame"
    }
}

/// "540 kcal" with a bold number and a small unit.
struct KcalText: View {
    let value: Double
    var approximate = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text("\(approximate ? "~" : "")\(Format.kcal(value))")
                .font(.body.weight(.semibold))
            Text("kcal")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .monospacedDigit()
    }
}
