import SwiftData
import SwiftUI
import WidgetKit

struct TrainingEntry: TimelineEntry {
    struct Item: Hashable, Identifiable {
        var id: UUID
        var title: String
        var sport: SportType
        var isDone: Bool
        var isSkipped: Bool
    }

    let date: Date
    let items: [Item]

    var doneCount: Int { items.filter(\.isDone).count }

    /// The session a tap opens: the next one not done yet, else the first.
    var focus: Item? { items.first { !$0.isDone && !$0.isSkipped } ?? items.first }

    var url: URL {
        if let focus { return DeepLink.session(focus.id).url }
        return DeepLink.plan.url
    }

    static func placeholder(date: Date = .now) -> TrainingEntry {
        TrainingEntry(date: date, items: [
            Item(id: UUID(), title: "Gym – Push", sport: .strength, isDone: true, isSkipped: false),
            Item(id: UUID(), title: "Easy Run 10 km", sport: .run, isDone: false, isSkipped: false),
        ])
    }
}

/// Today's planned sessions from the shared store; a second entry at midnight
/// shows the next day.
struct TrainingProvider: TimelineProvider {
    private static let container: ModelContainer? = try? SharedModelContainer.make()

    func placeholder(in context: Context) -> TrainingEntry {
        .placeholder()
    }

    func getSnapshot(in context: Context, completion: @escaping (TrainingEntry) -> Void) {
        completion(context.isPreview ? .placeholder() : entry(for: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TrainingEntry>) -> Void) {
        let now = Date.now
        let calendar = BudgetCalculator.weekCalendar
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
            ?? now.addingTimeInterval(60 * 60)
        completion(Timeline(entries: [entry(for: now), entry(for: midnight)], policy: .atEnd))
    }

    private func entry(for date: Date) -> TrainingEntry {
        guard let container = Self.container else { return TrainingEntry(date: date, items: []) }
        let sessions = (try? TrainingStore(context: ModelContext(container)).sessions(on: date)) ?? []
        return TrainingEntry(date: date, items: sessions.map {
            TrainingEntry.Item(
                id: $0.id,
                title: $0.displayTitle,
                sport: $0.sport,
                isDone: $0.isDone,
                isSkipped: $0.status == .skipped
            )
        })
    }
}

/// Today's training on the Lock Screen and Home Screen. Tapping opens the next
/// session's detail.
struct TrainingWidget: Widget {
    static let kind = "TrainingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: TrainingProvider()) { entry in
            TrainingWidgetView(entry: entry)
        }
        .configurationDisplayName("Training Today")
        .description("Your planned sessions for today.")
        .supportedFamilies([.accessoryRectangular, .systemSmall])
    }
}

struct TrainingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TrainingEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular:
                TrainingRectangularView(entry: entry)
                    .containerBackground(for: .widget) { Color.clear }
            default:
                TrainingSmallView(entry: entry)
                    .containerBackground(for: .widget) { Color("WidgetBackground") }
            }
        }
        .widgetURL(entry.url)
    }
}

private func statusSymbol(_ item: TrainingEntry.Item) -> String {
    if item.isDone { return "checkmark.circle.fill" }
    if item.isSkipped { return "minus.circle" }
    return "circle"
}

private struct TrainingRectangularView: View {
    let entry: TrainingEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                Text("Training")
                    .font(.headline)
                    .widgetAccentable()
                Spacer(minLength: 0)
                if !entry.items.isEmpty {
                    Text("\(entry.doneCount)/\(entry.items.count)")
                        .font(.caption)
                        .monospacedDigit()
                }
            }
            if entry.items.isEmpty {
                Text("Nothing planned")
                    .font(.caption)
            } else {
                ForEach(entry.items.prefix(2)) { item in
                    HStack(spacing: 4) {
                        Image(systemName: item.isDone ? statusSymbol(item) : item.sport.systemImage)
                            .font(.caption2)
                            .frame(width: 14)
                        Text(item.title)
                            .font(.caption)
                            .lineLimit(1)
                    }
                }
                if entry.items.count > 2 {
                    Text("+\(entry.items.count - 2) more")
                        .font(.caption2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TrainingSmallView: View {
    let entry: TrainingEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Today")
                    .font(.headline)
                Spacer()
                if !entry.items.isEmpty {
                    Text("\(entry.doneCount)/\(entry.items.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }

            if entry.items.isEmpty {
                Spacer(minLength: 0)
                VStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .font(.title2)
                        .foregroundStyle(Color.accentColor)
                    Text("Nothing planned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                Spacer(minLength: 0)
            } else {
                ForEach(entry.items.prefix(4)) { item in
                    HStack(spacing: 6) {
                        Image(systemName: item.sport.systemImage)
                            .font(.caption)
                            .foregroundStyle(Color.accentColor)
                            .frame(width: 18)
                        Text(item.title)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(item.isDone || item.isSkipped ? Color.secondary : Color.primary)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Image(systemName: statusSymbol(item))
                            .font(.caption)
                            .foregroundStyle(item.isDone ? Color.accentColor : Color.secondary)
                    }
                }
                if entry.items.count > 4 {
                    Text("+\(entry.items.count - 4) more")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
    }
}
