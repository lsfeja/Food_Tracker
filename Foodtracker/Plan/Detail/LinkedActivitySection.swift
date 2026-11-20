import SwiftData
import SwiftUI

/// Shows the activity linked to a session (actual vs. planned) with link/unlink.
struct LinkedActivitySection: View {
    let session: PlannedSession

    @Environment(\.modelContext) private var context
    @Query private var dayActivities: [ActivityRecord]
    @State private var showPicker = false

    init(session: PlannedSession) {
        self.session = session
        let calendar = BudgetCalculator.weekCalendar
        let start = calendar.startOfDay(for: session.date)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        _dayActivities = Query(
            filter: #Predicate<ActivityRecord> { $0.startDate >= start && $0.startDate < end },
            sort: \ActivityRecord.startDate
        )
    }

    var body: some View {
        if let activity = linkedActivity {
            Section {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(Color.accentColor)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(activity.name)
                            .lineLimit(1)
                        Text("\(activity.source.displayName) · \(activity.startDate.formatted(date: .omitted, time: .shortened))\(session.isLinkManual ? " · linked manually" : "")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                comparisonRow("Duration",
                              actual: Format.duration(minutes: activity.durationSeconds / 60),
                              planned: session.details.plannedMinutes.map { Format.duration(minutes: $0) })
                if activity.distanceMeters > 0 {
                    comparisonRow("Distance",
                                  actual: Format.distance(km: activity.distanceMeters / 1000),
                                  planned: plannedDistance.map { Format.distance(km: $0) })
                }
                if activity.activeCalories > 0 {
                    LabeledContent("Calories", value: "\(Format.kcal(activity.activeCalories)) kcal")
                }
                Button("Unlink Activity", role: .destructive) {
                    withAnimation { TrainingLinker.unlink(session, in: context) }
                }
            } header: {
                Text("Actual")
            }
        } else if !dayActivities.isEmpty {
            Section {
                Button {
                    showPicker = true
                } label: {
                    Label("Link Activity…", systemImage: "link")
                }
            } footer: {
                Text(activityCountText)
            }
            .sheet(isPresented: $showPicker) {
                LinkActivitySheet(session: session, activities: dayActivities)
            }
        }
    }

    private var activityCountText: String {
        dayActivities.count == 1
            ? "1 imported activity on this day."
            : "\(dayActivities.count) imported activities on this day."
    }

    private var linkedActivity: ActivityRecord? {
        guard let key = session.linkedActivityKey else { return nil }
        return dayActivities.first { $0.linkKey == key }
    }

    private var plannedDistance: Double? {
        if case .endurance(let workout) = session.details { return workout.distanceKm }
        return nil
    }

    private func comparisonRow(_ title: String, actual: String, planned: String?) -> some View {
        LabeledContent(title) {
            HStack(spacing: 6) {
                Text(actual)
                    .foregroundStyle(.primary)
                if let planned {
                    Text("plan \(planned)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .monospacedDigit()
        }
    }
}

/// Pick one of the day's activities for a session.
struct LinkActivitySheet: View {
    let session: PlannedSession
    let activities: [ActivityRecord]

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationStack {
            List(activities) { activity in
                Button {
                    TrainingLinker.link(session, to: activity, in: context)
                    dismiss()
                } label: {
                    ActivityPickerRow(activity: activity)
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Link Activity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct ActivityPickerRow: View {
    let activity: ActivityRecord

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: (activity.sportType ?? .custom).systemImage)
                .foregroundStyle(Color.accentColor)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.name)
                    .lineLimit(1)
                Text("\(activity.startDate.formatted(date: .omitted, time: .shortened)) · \(activity.summary)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}
