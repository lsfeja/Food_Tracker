import SwiftData
import SwiftUI

/// Manage week templates: create, rename/edit, duplicate, delete.
struct WeekTemplatesView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \WeekTemplate.name) private var templates: [WeekTemplate]

    @State private var showNewAlert = false
    @State private var newName = ""
    @State private var editing: WeekTemplate?

    var body: some View {
        List {
            if templates.isEmpty {
                ContentUnavailableView(
                    "No Week Templates",
                    systemImage: "rectangle.stack",
                    description: Text("Tap + to build one, or use “Save Week as Template” in the Plan menu.")
                )
                .listRowBackground(Color.clear)
            }
            ForEach(templates) { template in
                NavigationLink(value: template) {
                    WeekTemplateRow(template: template)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        WeekTemplateActions.delete(template, in: context)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    Button {
                        WeekTemplateActions.duplicate(template, in: context)
                    } label: {
                        Label("Duplicate", systemImage: "plus.square.on.square")
                    }
                    .tint(.gray)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Week Templates")
        .navigationDestination(for: WeekTemplate.self) { template in
            WeekTemplateEditorView(template: template)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    newName = ""
                    showNewAlert = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("New week template")
            }
        }
        .alert("New Week Template", isPresented: $showNewAlert) {
            TextField("Name (e.g. Base Week)", text: $newName)
            Button("Create") {
                let name = newName.trimmingCharacters(in: .whitespaces)
                editing = WeekTemplateActions.create(name: name.isEmpty ? "New Week" : name, in: context)
            }
            Button("Cancel", role: .cancel) {}
        }
        .navigationDestination(item: $editing) { template in
            WeekTemplateEditorView(template: template)
        }
    }
}

struct WeekTemplateRow: View {
    let template: WeekTemplate

    var body: some View {
        let sessions = template.sessions
        VStack(alignment: .leading, spacing: 4) {
            Text(template.name.isEmpty ? "Untitled" : template.name)
            HStack(spacing: 6) {
                Text(String(sessions.count == 1 ? "1 session" : "\(sessions.count) sessions"))
                ForEach(Array(Set(sessions.map(\.content.sport))).sorted { $0.rawValue < $1.rawValue }, id: \.self) { sport in
                    Image(systemName: sport.systemImage)
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }
}

/// Edit a week template: name and sessions per weekday.
struct WeekTemplateEditorView: View {
    @Bindable var template: WeekTemplate

    @Environment(\.modelContext) private var context
    @State private var sessions: [TemplateSession]
    @State private var addWeekday: AddWeekdayRequest?
    @State private var editingSession: TemplateSession?

    private var calendar: Calendar { BudgetCalculator.weekCalendar }

    init(template: WeekTemplate) {
        _template = Bindable(wrappedValue: template)
        _sessions = State(initialValue: template.sessions)
    }

    var body: some View {
        List {
            Section {
                TextField("Template name", text: $template.name)
                    .font(.headline)
            }

            ForEach(0..<7, id: \.self) { weekday in
                let daySessions = sessions
                    .filter { $0.weekday == weekday }
                    .sorted { $0.order < $1.order }
                Section {
                    ForEach(daySessions) { session in
                        Button {
                            editingSession = session
                        } label: {
                            TemplateSessionRow(session: session)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                remove(session)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                duplicate(session)
                            } label: {
                                Label("Duplicate", systemImage: "plus.square.on.square")
                            }
                            .tint(.gray)
                        }
                        .draggable(session.id.uuidString)
                        .dropDestination(for: String.self) { items, _ in
                            move(items, to: weekday, before: session)
                        }
                    }
                    if daySessions.isEmpty {
                        Text("Rest")
                            .font(.subheadline)
                            .foregroundStyle(.tertiary)
                            .dropDestination(for: String.self) { items, _ in
                                move(items, to: weekday, before: nil)
                            }
                    }
                } header: {
                    HStack {
                        Text(WeekPlanner.weekdayName(weekday, calendar: calendar))
                        Spacer()
                        Button {
                            addWeekday = AddWeekdayRequest(weekday: weekday)
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                                .foregroundStyle(Color.accentColor)
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Add session on \(WeekPlanner.weekdayName(weekday, calendar: calendar))")
                    }
                    .textCase(nil)
                    .dropDestination(for: String.self) { items, _ in
                        move(items, to: weekday, before: nil)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(template.name.isEmpty ? "Week Template" : template.name)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: sessions) { _, newValue in
            template.sessions = newValue
            try? context.save()
        }
        .onDisappear {
            try? context.save()
        }
        .sheet(item: $addWeekday) { request in
            AddSessionSheet(
                title: "Add to \(WeekPlanner.weekdayName(request.weekday, calendar: calendar))",
                onAddContent: { content in append(content, weekday: request.weekday) },
                onAddTemplate: { workout in
                    workout.markUsed()
                    append(workout.content, weekday: request.weekday)
                }
            )
        }
        .sheet(item: $editingSession) { session in
            NavigationStack {
                SessionEditorView(content: session.content, navigationTitle: "Edit Session") { saved in
                    if let index = sessions.firstIndex(where: { $0.id == session.id }) {
                        sessions[index].content = saved.resettingProgress()
                    }
                    editingSession = nil
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { editingSession = nil }
                    }
                }
            }
        }
    }

    // MARK: - Editing

    private func append(_ content: WorkoutContent, weekday: Int) {
        let order = (sessions.filter { $0.weekday == weekday }.map(\.order).max() ?? -1) + 1
        sessions.append(TemplateSession(weekday: weekday, order: order, content: content.resettingProgress()))
    }

    private func remove(_ session: TemplateSession) {
        sessions.removeAll { $0.id == session.id }
        renumber(session.weekday)
    }

    private func duplicate(_ session: TemplateSession) {
        for index in sessions.indices where sessions[index].weekday == session.weekday && sessions[index].order > session.order {
            sessions[index].order += 1
        }
        sessions.append(TemplateSession(weekday: session.weekday, order: session.order + 1, content: session.content))
    }

    private func move(_ items: [String], to weekday: Int, before target: TemplateSession?) -> Bool {
        guard let idString = items.first, let id = UUID(uuidString: idString),
              let index = sessions.firstIndex(where: { $0.id == id })
        else { return false }
        let oldWeekday = sessions[index].weekday
        sessions[index].weekday = weekday

        let dayIDs = sessions
            .filter { $0.weekday == weekday && $0.id != id }
            .sorted { $0.order < $1.order }
            .map(\.id) + [id]
        let ordered = WeekPlanner.reorder(dayIDs, moving: id, before: target?.id)
        for (position, sessionID) in ordered.enumerated() {
            if let sessionIndex = sessions.firstIndex(where: { $0.id == sessionID }) {
                sessions[sessionIndex].order = position
            }
        }
        if oldWeekday != weekday { renumber(oldWeekday) }
        return true
    }

    private func renumber(_ weekday: Int) {
        let ids = sessions.filter { $0.weekday == weekday }.sorted { $0.order < $1.order }.map(\.id)
        for (position, id) in ids.enumerated() {
            if let index = sessions.firstIndex(where: { $0.id == id }) {
                sessions[index].order = position
            }
        }
    }
}

struct AddWeekdayRequest: Identifiable {
    let id = UUID()
    var weekday: Int
}

struct TemplateSessionRow: View {
    let session: TemplateSession

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: session.content.sport.systemImage)
                .foregroundStyle(Color.accentColor)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(session.content.displayTitle)
                    .lineLimit(1)
                let summary = session.content.details.summary
                if !summary.isEmpty {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}
