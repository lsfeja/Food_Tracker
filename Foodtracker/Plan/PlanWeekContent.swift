import SwiftData
import SwiftUI

/// Week strip + day list for one week. Recreated per week so `@Query` covers it.
struct PlanWeekContent: View {
    let weekStart: Date
    let mode: PlanView.Mode
    @Binding var selectedDay: Date
    var onSwipe: (Int) -> Void
    var onAdd: (Date) -> Void

    @Environment(\.modelContext) private var context
    @Environment(AppServices.self) private var services

    @Query private var sessions: [PlannedSession]
    @Query private var activities: [ActivityRecord]

    @State private var scrollTarget: Date?

    init(
        weekStart: Date,
        mode: PlanView.Mode,
        selectedDay: Binding<Date>,
        onSwipe: @escaping (Int) -> Void,
        onAdd: @escaping (Date) -> Void
    ) {
        self.weekStart = weekStart
        self.mode = mode
        self._selectedDay = selectedDay
        self.onSwipe = onSwipe
        self.onAdd = onAdd
        let calendar = BudgetCalculator.weekCalendar
        let start = calendar.startOfDay(for: weekStart)
        let end = calendar.date(byAdding: .day, value: 7, to: start) ?? start.addingTimeInterval(7 * 86_400)
        _sessions = Query(
            filter: #Predicate<PlannedSession> { $0.date >= start && $0.date < end },
            sort: [SortDescriptor(\PlannedSession.date), SortDescriptor(\PlannedSession.order)]
        )
        _activities = Query(
            filter: #Predicate<ActivityRecord> { $0.startDate >= start && $0.startDate < end },
            sort: [SortDescriptor(\ActivityRecord.startDate)]
        )
    }

    private var calendar: Calendar { BudgetCalculator.weekCalendar }
    private var days: [Date] { WeekPlanner.days(ofWeekStarting: weekStart, calendar: calendar) }

    var body: some View {
        let grouped = sessionsByDay
        let activityGroups = unplannedActivitiesByDay

        VStack(spacing: 0) {
            WeekStrip(
                days: days,
                selectedDay: mode == .day ? selectedDay : nil,
                progress: grouped.mapValues { ($0.filter(\.isDone).count, $0.count) },
                onSelect: select(_:),
                onSwipe: onSwipe
            )
            Divider()

            ScrollViewReader { proxy in
                List {
                    ForEach(visibleDays, id: \.self) { day in
                        daySection(day, sessions: grouped[day] ?? [], unplanned: activityGroups[day] ?? [])
                            .id(day)
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable {
                    await services.activitySync.sync()
                }
                .onChange(of: scrollTarget) { _, target in
                    guard let target else { return }
                    withAnimation { proxy.scrollTo(target, anchor: .top) }
                    scrollTarget = nil
                }
                .task {
                    // Bring today into view when opening the current week.
                    guard mode == .week, let today = days.first(where: { calendar.isDateInToday($0) }) else { return }
                    try? await Task.sleep(for: .milliseconds(80))
                    proxy.scrollTo(today, anchor: .top)
                }
            }
        }
    }

    // MARK: - Sections

    private func daySection(_ day: Date, sessions: [PlannedSession], unplanned: [ActivityRecord]) -> some View {
        Section {
            ForEach(sessions) { session in
                NavigationLink(value: PlanRoute.session(session.id)) {
                    SessionRow(session: session, linkedActivity: linkedActivity(for: session)) {
                        withAnimation { PlanActions.toggleDone(session, in: context) }
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        withAnimation { PlanActions.delete(session, in: context) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    Button {
                        withAnimation { _ = PlanActions.duplicate(session, in: context) }
                    } label: {
                        Label("Duplicate", systemImage: "plus.square.on.square")
                    }
                    .tint(.gray)
                }
                .draggable(session.id.uuidString)
                .dropDestination(for: String.self) { items, _ in
                    handleDrop(items, on: day, before: session)
                }
            }

            ForEach(unplanned) { activity in
                UnplannedActivityRow(activity: activity, day: day, sessions: sessions)
            }

            if sessions.isEmpty && unplanned.isEmpty {
                Text("Nothing planned")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dropDestination(for: String.self) { items, _ in
                        handleDrop(items, on: day, before: nil)
                    }
            }
        } header: {
            DayHeader(day: day, onAdd: { onAdd(day) })
                .dropDestination(for: String.self) { items, _ in
                    handleDrop(items, on: day, before: nil)
                }
        }
    }

    // MARK: - Actions

    private func select(_ day: Date) {
        selectedDay = day
        if mode == .week { scrollTarget = day }
    }

    private func handleDrop(_ items: [String], on day: Date, before target: PlannedSession?) -> Bool {
        guard let idString = items.first, let id = UUID(uuidString: idString) else { return false }
        let session = sessions.first { $0.id == id }
            ?? (try? TrainingStore(context: context, calendar: calendar).session(id: id)) ?? nil
        guard let session else { return false }
        withAnimation { PlanActions.move(session, to: day, before: target, in: context) }
        return true
    }

    // MARK: - Data

    private var visibleDays: [Date] {
        guard mode == .day else { return days }
        let selected = calendar.startOfDay(for: selectedDay)
        return days.contains(selected) ? [selected] : [days[0]]
    }

    private var sessionsByDay: [Date: [PlannedSession]] {
        Dictionary(grouping: sessions) { calendar.startOfDay(for: $0.date) }
    }

    private var linkedKeys: Set<String> {
        Set(sessions.compactMap(\.linkedActivityKey))
    }

    private var unplannedActivitiesByDay: [Date: [ActivityRecord]] {
        let keys = linkedKeys
        return Dictionary(grouping: activities.filter { !keys.contains($0.linkKey) }) {
            calendar.startOfDay(for: $0.startDate)
        }
    }

    private func linkedActivity(for session: PlannedSession) -> ActivityRecord? {
        guard let key = session.linkedActivityKey else { return nil }
        return activities.first { $0.linkKey == key }
    }
}

/// Mon–Sun strip with today highlighted and completion dots. Swipe to change week.
struct WeekStrip: View {
    let days: [Date]
    /// Highlighted day in day mode.
    let selectedDay: Date?
    /// Per day: (done, total).
    let progress: [Date: (Int, Int)]
    var onSelect: (Date) -> Void
    var onSwipe: (Int) -> Void

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(days, id: \.self) { day in
                dayCell(day)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height) else { return }
                    if value.translation.width < -50 { onSwipe(1) }
                    if value.translation.width > 50 { onSwipe(-1) }
                }
        )
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Next week") { onSwipe(1) }
        .accessibilityAction(named: "Previous week") { onSwipe(-1) }
    }

    private func dayCell(_ day: Date) -> some View {
        let isToday = calendar.isDateInToday(day)
        let isSelected = selectedDay.map { calendar.isDate($0, inSameDayAs: day) } ?? false
        let (done, total) = progress[day] ?? (0, 0)

        return Button {
            onSelect(day)
        } label: {
            VStack(spacing: 4) {
                Text(day.formatted(.dateTime.weekday(.narrow)))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(day.formatted(.dateTime.day()))
                    .font(.callout.weight(isToday ? .bold : .regular))
                    .monospacedDigit()
                    .foregroundStyle(isToday ? Color.white : Color.primary)
                    .frame(width: 32, height: 32)
                    .background {
                        if isToday {
                            Circle().fill(Color.accentColor)
                        } else if isSelected {
                            Circle().stroke(Color.accentColor, lineWidth: 1.5)
                        }
                    }
                HStack(spacing: 3) {
                    ForEach(0..<min(total, 3), id: \.self) { index in
                        Circle()
                            .fill(index < done ? Color.accentColor : Color.secondary.opacity(0.35))
                            .frame(width: 5, height: 5)
                    }
                }
                .frame(height: 5)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(day.formatted(.dateTime.weekday(.wide).day().month())), \(done) of \(total) done")
    }
}

/// Section header: "Today · Thu 20 Nov" with a + button.
struct DayHeader: View {
    let day: Date
    var onAdd: () -> Void

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    var body: some View {
        let isToday = calendar.isDateInToday(day)
        HStack {
            HStack(spacing: 6) {
                if isToday {
                    Text("Today")
                        .foregroundStyle(Color.accentColor)
                }
                Text(day.formatted(.dateTime.weekday(.wide).day().month(.abbreviated)))
                    .foregroundStyle(isToday ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.secondary))
            }
            .font(.subheadline.weight(isToday ? .semibold : .regular))
            Spacer()
            Button(action: onAdd) {
                Image(systemName: "plus.circle.fill")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Add session on \(day.formatted(.dateTime.weekday(.wide)))")
        }
        .textCase(nil)
    }
}
