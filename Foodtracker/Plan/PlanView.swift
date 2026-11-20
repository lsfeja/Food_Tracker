import SwiftData
import SwiftUI

/// Plan tab: training calendar for one week, as a to-do list grouped by day.
struct PlanView: View {
    enum Mode: String {
        case week
        case day
    }

    @Environment(AppRouter.self) private var router
    @Environment(\.modelContext) private var context

    @AppStorage("plan.mode") private var modeRaw = Mode.week.rawValue
    @State private var weekOffset = 0
    @State private var selectedDay = Calendar.current.startOfDay(for: .now)
    @State private var swipeEdge: Edge = .trailing
    @State private var addRequest: AddSessionRequest?

    private var calendar: Calendar { BudgetCalculator.weekCalendar }
    private var mode: Mode { Mode(rawValue: modeRaw) ?? .week }

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.planPath) {
            PlanWeekContent(
                weekStart: weekStart,
                mode: mode,
                selectedDay: $selectedDay,
                onSwipe: changeWeek(by:),
                onAdd: { day in addRequest = AddSessionRequest(day: day) }
            )
            .id(weekStart)
            .transition(.push(from: swipeEdge))
            .navigationTitle(weekTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .navigationDestination(for: PlanRoute.self) { route in
                destination(for: route)
            }
        }
        .sheet(item: $addRequest) { request in
            AddSessionSheet(
                title: "Add to \(request.day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))",
                onAddContent: { content in PlanActions.addSession(content, on: request.day, in: context) },
                onAddTemplate: { template in LibraryActions.schedule(template, on: request.day, in: context) }
            )
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            if !isShowingToday {
                Button("Today") { goToToday() }
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                withAnimation(.snappy) { modeRaw = (mode == .week ? Mode.day : Mode.week).rawValue }
            } label: {
                Image(systemName: mode == .week ? "list.bullet.below.rectangle" : "calendar.day.timeline.left")
            }
            .accessibilityLabel(mode == .week ? "Show day" : "Show week")

            PlanMenu(weekStart: weekStart)
        }
    }

    @ViewBuilder
    private func destination(for route: PlanRoute) -> some View {
        switch route {
        case .session(let id):
            SessionDetailLoader(sessionID: id)
        case .library:
            WorkoutLibraryView()
        case .weekTemplates:
            WeekTemplatesView()
        }
    }

    // MARK: - Week navigation

    private var weekStart: Date {
        WeekPlanner.weekStart(for: .now, offset: weekOffset, calendar: calendar)
    }

    private var isShowingToday: Bool {
        weekOffset == 0 && (mode == .week || calendar.isDateInToday(selectedDay))
    }

    private var weekTitle: String {
        switch weekOffset {
        case 0: return "This Week"
        case 1: return "Next Week"
        case -1: return "Last Week"
        default:
            let end = calendar.date(byAdding: .day, value: 6, to: weekStart) ?? weekStart
            return "\(weekStart.formatted(.dateTime.day().month(.abbreviated))) – \(end.formatted(.dateTime.day().month(.abbreviated)))"
        }
    }

    private func changeWeek(by delta: Int) {
        swipeEdge = delta > 0 ? .trailing : .leading
        withAnimation(.snappy) {
            weekOffset += delta
            // Keep the same weekday selected in day mode.
            selectedDay = calendar.date(byAdding: .day, value: 7 * delta, to: selectedDay) ?? selectedDay
        }
    }

    private func goToToday() {
        swipeEdge = weekOffset > 0 ? .leading : .trailing
        withAnimation(.snappy) {
            weekOffset = 0
            selectedDay = calendar.startOfDay(for: .now)
        }
    }
}

struct AddSessionRequest: Identifiable {
    let id = UUID()
    var day: Date
}

/// Library and week-template actions.
private struct PlanMenu: View {
    let weekStart: Date
    @Environment(AppRouter.self) private var router
    @State private var showLoadTemplate = false
    @State private var showSaveTemplate = false

    var body: some View {
        Menu {
            Button {
                router.planPath.append(.library)
            } label: {
                Label("Workout Library", systemImage: "books.vertical")
            }
            Section("Week Templates") {
                Button {
                    showLoadTemplate = true
                } label: {
                    Label("Load Template into Week…", systemImage: "square.and.arrow.down")
                }
                Button {
                    showSaveTemplate = true
                } label: {
                    Label("Save Week as Template…", systemImage: "square.and.arrow.up")
                }
                Button {
                    router.planPath.append(.weekTemplates)
                } label: {
                    Label("Manage Templates", systemImage: "rectangle.stack")
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .accessibilityLabel("More")
        .sheet(isPresented: $showLoadTemplate) {
            LoadWeekTemplateView(initialWeekStart: weekStart)
        }
        .sheet(isPresented: $showSaveTemplate) {
            SaveWeekTemplateView(weekStart: weekStart)
        }
    }
}
