import SwiftData
import SwiftUI

/// Pick a week template and a target week, preview, then add or replace.
struct LoadWeekTemplateView: View {
    let initialWeekStart: Date

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \WeekTemplate.name) private var templates: [WeekTemplate]

    @State private var selectedID: UUID?
    @State private var weekOffset = 0
    @State private var mode: WeekTemplateActions.ApplyMode = .add

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    var body: some View {
        NavigationStack {
            Form {
                if templates.isEmpty {
                    ContentUnavailableView(
                        "No Week Templates",
                        systemImage: "rectangle.stack",
                        description: Text("Save a week as a template or create one under Manage Templates.")
                    )
                } else {
                    Section("Template") {
                        Picker("Template", selection: $selectedID) {
                            ForEach(templates) { template in
                                Text(template.name.isEmpty ? "Untitled" : template.name).tag(Optional(template.id))
                            }
                        }
                    }

                    Section("Week") {
                        HStack {
                            Button {
                                weekOffset -= 1
                            } label: {
                                Image(systemName: "chevron.left")
                            }
                            .buttonStyle(.borderless)
                            Spacer()
                            VStack(spacing: 2) {
                                Text(weekLabel)
                                    .font(.headline)
                                Text(rangeLabel)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button {
                                weekOffset += 1
                            } label: {
                                Image(systemName: "chevron.right")
                            }
                            .buttonStyle(.borderless)
                        }
                    }

                    Section {
                        Picker("Mode", selection: $mode) {
                            ForEach(WeekTemplateActions.ApplyMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                    } footer: {
                        Text(mode == .add
                             ? "Template sessions are added after sessions already planned."
                             : "Planned sessions in this week are removed. Completed sessions are kept.")
                    }

                    if let template = selectedTemplate {
                        preview(template)
                    }
                }
            }
            .navigationTitle("Load Week Template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Load") {
                        guard let template = selectedTemplate else { return }
                        WeekTemplateActions.apply(template, toWeekStarting: targetWeekStart, mode: mode, in: context)
                        dismiss()
                    }
                    .disabled(selectedTemplate == nil)
                }
            }
            .onAppear {
                if selectedID == nil { selectedID = templates.first?.id }
            }
        }
    }

    @ViewBuilder
    private func preview(_ template: WeekTemplate) -> some View {
        let sessions = template.sessions
        let existing = WeekTemplateActions.weekSessions(targetWeekStart, in: context)
        let days = WeekPlanner.days(ofWeekStarting: targetWeekStart, calendar: calendar)

        ForEach(0..<7, id: \.self) { weekday in
            let planned = sessions.filter { $0.weekday == weekday }.sorted { $0.order < $1.order }
            let day = days[weekday]
            let current = existing.filter { calendar.isDate($0.date, inSameDayAs: day) }
            let kept = mode == .add ? current : current.filter(\.isDone)
            let removed = current.count - kept.count
            if !planned.isEmpty || !current.isEmpty {
                Section {
                    ForEach(kept) { session in
                        Label(session.displayTitle, systemImage: session.sport.systemImage)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(planned) { session in
                        TemplateSessionRow(session: session)
                    }
                } header: {
                    Text(day.formatted(.dateTime.weekday(.wide).day().month(.abbreviated)))
                } footer: {
                    if removed > 0 {
                        Text(Self.removedText(removed))
                    }
                }
            }
        }
    }

    private static func removedText(_ count: Int) -> String {
        count == 1 ? "1 planned session will be removed." : "\(count) planned sessions will be removed."
    }

    private var selectedTemplate: WeekTemplate? {
        templates.first { $0.id == selectedID }
    }

    private var targetWeekStart: Date {
        calendar.date(byAdding: .day, value: 7 * weekOffset, to: initialWeekStart) ?? initialWeekStart
    }

    private var weekLabel: String {
        let current = WeekPlanner.weekStart(for: .now, calendar: calendar)
        let offset = (calendar.dateComponents([.day], from: current, to: targetWeekStart).day ?? 0) / 7
        switch offset {
        case 0: return "This Week"
        case 1: return "Next Week"
        case -1: return "Last Week"
        default: return offset > 0 ? "In \(offset) Weeks" : "\(-offset) Weeks Ago"
        }
    }

    private var rangeLabel: String {
        let end = calendar.date(byAdding: .day, value: 6, to: targetWeekStart) ?? targetWeekStart
        return "\(targetWeekStart.formatted(.dateTime.day().month(.abbreviated))) – \(end.formatted(.dateTime.day().month(.abbreviated)))"
    }
}

/// Save the sessions of a week as a new template.
struct SaveWeekTemplateView: View {
    let weekStart: Date

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var name = ""

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    var body: some View {
        let sessions = WeekTemplateActions.weekSessions(weekStart, in: context)

        NavigationStack {
            Form {
                Section {
                    TextField("Name (e.g. Base Week)", text: $name)
                } footer: {
                    Text("Workout content is copied; ticked sets and actual values are not.")
                }

                if sessions.isEmpty {
                    Section {
                        Text("This week has no sessions yet.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    let grouped = Dictionary(grouping: sessions) { calendar.startOfDay(for: $0.date) }
                    ForEach(grouped.keys.sorted(), id: \.self) { day in
                        Section(day.formatted(.dateTime.weekday(.wide))) {
                            ForEach((grouped[day] ?? []).sorted { $0.order < $1.order }) { session in
                                Label(session.displayTitle, systemImage: session.sport.systemImage)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Save Week as Template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let trimmed = name.trimmingCharacters(in: .whitespaces)
                        WeekTemplateActions.saveWeek(startingAt: weekStart, name: trimmed.isEmpty ? defaultName : trimmed, in: context)
                        dismiss()
                    }
                    .disabled(sessions.isEmpty)
                }
            }
        }
    }

    private var defaultName: String {
        "Week of \(weekStart.formatted(.dateTime.day().month(.abbreviated)))"
    }
}
