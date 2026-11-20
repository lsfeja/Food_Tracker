import Foundation
import SwiftData
import Testing
@testable import Foodtracker

struct WorkoutDetailsTests {
    private var pushDay: WorkoutDetails {
        .strength(StrengthWorkout(exercises: [
            ExerciseEntry(name: "Bench Press", sets: [
                ExerciseSet(plannedReps: 8, plannedWeight: 80, actualReps: 8, actualWeight: 80, isDone: true),
                ExerciseSet(plannedReps: 8, plannedWeight: 80),
            ]),
            ExerciseEntry(name: "Dips", sets: [ExerciseSet(plannedReps: 12)]),
        ]))
    }

    @Test func roundTripsThroughJSON() throws {
        let content = WorkoutContent(sport: .strength, title: "Push", details: pushDay)
        let data = try JSONEncoder().encode(content)
        let decoded = try JSONDecoder().decode(WorkoutContent.self, from: data)
        #expect(decoded == content)
    }

    @Test func decodesMissingFieldsLeniently() throws {
        let json = #"{"exercises":[{"name":"Squat","sets":[{"plannedReps":5}]}]}"#
        let workout = try JSONDecoder().decode(StrengthWorkout.self, from: Data(json.utf8))
        #expect(workout.exercises.first?.name == "Squat")
        #expect(workout.exercises.first?.sets.first?.plannedReps == 5)
        #expect(workout.exercises.first?.sets.first?.isDone == false)
        #expect(workout.notes == "")
    }

    @Test func summarizesStrength() {
        #expect(pushDay.summary == "2 exercises · 1/3 sets")
        #expect(pushDay.resettingProgress().summary == "2 exercises · 3 sets")
    }

    @Test func resettingProgressClearsActuals() {
        let reset = pushDay.resettingProgress().strengthWorkout
        let first = reset.exercises[0].sets[0]
        #expect(first.isDone == false)
        #expect(first.actualReps == nil)
        #expect(first.plannedWeight == 80)
    }

    @Test func summarizesIntervals() {
        let workout = EnduranceWorkout(blocks: [
            IntervalBlock(repeats: 1, steps: [IntervalStep(label: "Warm-up", durationMinutes: 15, intensity: .zone(1))]),
            IntervalBlock(repeats: 5, steps: [
                IntervalStep(durationMinutes: 4, intensity: .zone(4)),
                IntervalStep(durationMinutes: 3, intensity: .zone(1)),
            ]),
            IntervalBlock(repeats: 1, steps: [IntervalStep(label: "Cool-down", durationMinutes: 10, intensity: .zone(1))]),
        ])
        #expect(workout.totalMinutes == 60)
        #expect(workout.structureSummary == "15′ Z1 · 5×(4′ Z4 / 3′ Z1) · 10′ Z1")
        #expect(WorkoutDetails.endurance(workout).summary == "1 h · 5×(4′ Z4 / 3′ Z1)")
    }

    @Test func summarizesEnduranceBasics() {
        let ride = WorkoutDetails.endurance(EnduranceWorkout(durationMinutes: 90, intensity: .zone(2)))
        #expect(ride.summary == "1 h 30 min · Z2")
        let run = WorkoutDetails.endurance(EnduranceWorkout(distanceKm: 10, intensity: .rpe(4)))
        #expect(run.summary == "10 km · RPE 4")
    }

    @Test func changingSportAdaptsDetails() {
        var content = WorkoutContent(sport: .yoga, details: .general(GeneralWorkout(durationMinutes: 45, notes: "Flow")))
        content.changeSport(to: .run)
        #expect(content.details.enduranceWorkout.durationMinutes == 45)
        #expect(content.details.notes == "Flow")
        content.changeSport(to: .ride)
        #expect(content.details.category == .endurance)
        #expect(content.displayTitle == "Ride")
    }
}

@MainActor
struct TrainingModelTests {
    @Test func plannedSessionStoresContent() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = container.mainContext
        let content = WorkoutContent(sport: .run, title: "Easy Run 10 km", details: .endurance(EnduranceWorkout(distanceKm: 10)))
        let session = PlannedSession(date: day(2025, 11, 18), order: 0, content: content)
        context.insert(session)
        try context.save()

        let fetched = try #require(try TrainingStore(context: context, calendar: testCalendar).sessions(on: day(2025, 11, 18)).first)
        #expect(fetched.content == content)
        #expect(fetched.status == .planned)
        fetched.setDone(true)
        #expect(fetched.isDone)
    }

    @Test func templatesStoreContentWithoutProgress() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let details = WorkoutDetails.strength(StrengthWorkout(exercises: [
            ExerciseEntry(name: "Row", sets: [ExerciseSet(plannedReps: 10, actualReps: 9, isDone: true)]),
        ]))
        let template = WorkoutTemplate(content: WorkoutContent(sport: .strength, title: "Pull Day", details: details))
        container.mainContext.insert(template)
        #expect(template.name == "Pull Day")
        #expect(template.details.strengthWorkout.exercises[0].sets[0].isDone == false)

        let week = WeekTemplate(name: "Base Week", sessions: [
            TemplateSession(weekday: 0, order: 0, content: template.content),
        ])
        container.mainContext.insert(week)
        #expect(week.sessions.count == 1)
        #expect(week.sessions[0].content.title == "Pull Day")
    }
}

struct ActivityMatcherTests {
    let morning = day(2025, 11, 18, hour: 7)
    let evening = day(2025, 11, 18, hour: 18)

    @Test func matchesSameSportGroup() {
        let run = UUID()
        let ride = UUID()
        let result = ActivityMatcher.match(
            sessions: [
                .init(id: run, sport: .run, order: 0),
                .init(id: ride, sport: .indoorRide, order: 1),
            ],
            activities: [
                .init(key: "strava:2", sport: .ride, start: evening),
                .init(key: "strava:1", sport: .run, start: morning),
            ]
        )
        #expect(result.links == [run: "strava:1", ride: "strava:2"])
        #expect(result.unlinks.isEmpty)
    }

    @Test func eachActivityLinksOnce() {
        let first = UUID()
        let second = UUID()
        let result = ActivityMatcher.match(
            sessions: [.init(id: second, sport: .run, order: 1), .init(id: first, sport: .run, order: 0)],
            activities: [.init(key: "strava:1", sport: .run, start: morning)]
        )
        #expect(result.links == [first: "strava:1"])
    }

    @Test func keepsExistingLinksAndRemovesStaleOnes() {
        let kept = UUID()
        let stale = UUID()
        let result = ActivityMatcher.match(
            sessions: [
                .init(id: kept, sport: .run, order: 0, linkedKey: "strava:1"),
                .init(id: stale, sport: .swim, order: 1, linkedKey: "strava:deleted"),
            ],
            activities: [.init(key: "strava:1", sport: .run, start: morning)]
        )
        #expect(result.links.isEmpty)
        #expect(result.unlinks == [stale])
    }

    @Test func respectsSuppressionSkipAndUnmatchableSports() {
        let suppressed = UUID()
        let skipped = UUID()
        let rest = UUID()
        let result = ActivityMatcher.match(
            sessions: [
                .init(id: suppressed, sport: .run, order: 0, autoLinkSuppressed: true),
                .init(id: skipped, sport: .run, order: 1, isSkipped: true),
                .init(id: rest, sport: .rest, order: 2),
            ],
            activities: [.init(key: "strava:1", sport: .run, start: morning)]
        )
        #expect(result.isEmpty)
    }

    @Test func listsUnplannedActivities() {
        let activities: [ActivityMatcher.Activity] = [
            .init(key: "strava:2", sport: .ride, start: evening),
            .init(key: "strava:1", sport: .run, start: morning),
        ]
        let unplanned = ActivityMatcher.unplanned(activities, linkedKeys: ["strava:1"])
        #expect(unplanned.map(\.key) == ["strava:2"])
    }

    @Test func mapsStravaSportTypes() {
        #expect(SportType.fromActivityType("VirtualRide") == .indoorRide)
        #expect(SportType.fromActivityType("GravelRide") == .ride)
        #expect(SportType.fromActivityType("TrailRun") == .run)
        #expect(SportType.fromActivityType("WeightTraining") == .strength)
        #expect(SportType.fromActivityType("Kitesurf") == nil)
    }
}

struct WeekPlannerTests {
    let monday = day(2025, 11, 17)

    @Test func weekdayIndexStartsMonday() {
        #expect(WeekPlanner.weekdayIndex(of: monday, calendar: testCalendar) == 0)
        #expect(WeekPlanner.weekdayIndex(of: day(2025, 11, 23), calendar: testCalendar) == 6)
    }

    @Test func instantiatesTemplateAfterExistingSessions() {
        let template = [
            TemplateSession(weekday: 2, order: 1, content: WorkoutContent(sport: .run, title: "Tempo")),
            TemplateSession(weekday: 0, order: 0, content: WorkoutContent(sport: .strength, title: "Push")),
            TemplateSession(weekday: 2, order: 0, content: WorkoutContent(sport: .strength, title: "Pull")),
        ]
        let wednesday = day(2025, 11, 19)
        let items = WeekPlanner.instantiate(template, weekStart: monday, nextOrder: [wednesday: 2], calendar: testCalendar)
        #expect(items.map(\.content.title) == ["Push", "Pull", "Tempo"])
        #expect(items.map(\.date) == [monday, wednesday, wednesday])
        #expect(items.map(\.order) == [0, 2, 3])
    }

    @Test func convertsWeekToTemplate() {
        let items = [
            WeekPlanner.Item(date: day(2025, 11, 19), order: 5, content: WorkoutContent(sport: .run, title: "B")),
            WeekPlanner.Item(date: day(2025, 11, 19), order: 2, content: WorkoutContent(sport: .run, title: "A")),
            WeekPlanner.Item(date: day(2025, 11, 23), order: 0, content: WorkoutContent(sport: .yoga, title: "C")),
        ]
        let sessions = WeekPlanner.templateSessions(from: items, calendar: testCalendar)
        #expect(sessions.map(\.content.title) == ["A", "B", "C"])
        #expect(sessions.map(\.weekday) == [2, 2, 6])
        #expect(sessions.map(\.order) == [0, 1, 0])
    }

    @Test func reordersIDs() {
        #expect(WeekPlanner.reorder([1, 2, 3], moving: 3, before: 1) == [3, 1, 2])
        #expect(WeekPlanner.reorder([1, 2, 3], moving: 1, before: nil) == [2, 3, 1])
    }
}

struct ExerciseHistoryTests {
    private func record(_ date: Date, _ exercises: [ExerciseEntry], id: UUID = UUID()) -> ExerciseHistory.Record {
        ExerciseHistory.Record(sessionID: id, date: date, workout: StrengthWorkout(exercises: exercises))
    }

    @Test func findsLastDonePerformanceByName() {
        let current = UUID()
        let records = [
            record(day(2025, 11, 10), [ExerciseEntry(name: "Bench Press", sets: [
                ExerciseSet(plannedReps: 8, plannedWeight: 75, isDone: true),
            ])]),
            record(day(2025, 11, 14), [ExerciseEntry(name: "bench  press", sets: [
                ExerciseSet(plannedReps: 8, plannedWeight: 80, isDone: true),
                ExerciseSet(plannedReps: 8, plannedWeight: 80, actualReps: 6, isDone: true),
                ExerciseSet(plannedReps: 8, plannedWeight: 80),
            ])]),
            record(day(2025, 11, 18), [ExerciseEntry(name: "Bench Press", sets: [
                ExerciseSet(plannedReps: 8, plannedWeight: 82.5, isDone: true),
            ])], id: current),
        ]
        let last = ExerciseHistory.lastPerformance(of: "Bench Press", onOrBefore: day(2025, 11, 18), excluding: current, in: records)
        #expect(last?.date == day(2025, 11, 14))
        #expect(last?.sets.count == 2)
        #expect(last?.summary == "8 @ 80 · 6 @ 80 kg")
    }

    @Test func ignoresSessionsWithoutDoneSets() {
        let records = [record(day(2025, 11, 10), [ExerciseEntry(name: "Squat", sets: [ExerciseSet(plannedReps: 5)])])]
        #expect(ExerciseHistory.lastPerformance(of: "Squat", onOrBefore: day(2025, 11, 18), excluding: nil, in: records) == nil)
    }

    @Test func summarizesUniformSets() {
        let sets = Array(repeating: ExerciseSet(plannedReps: 8, plannedWeight: 80, isDone: true), count: 3)
        #expect(ExerciseHistory.summary(of: sets) == "3 × 8 @ 80 kg")
        #expect(ExerciseHistory.summary(of: [ExerciseSet(plannedReps: 12), ExerciseSet(plannedReps: 12)]) == "2 × 12")
    }

    @Test func listsKnownNamesOncePreferringRecentSpelling() {
        let records = [
            record(day(2025, 11, 10), [ExerciseEntry(name: "bench press"), ExerciseEntry(name: "Dips")]),
            record(day(2025, 11, 14), [ExerciseEntry(name: "Bench Press")]),
        ]
        #expect(ExerciseHistory.knownNames(in: records) == ["Bench Press", "Dips"])
    }
}

@MainActor
struct WeekTemplateActionTests {
    @Test func savesAndAppliesWeekTemplates() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = container.mainContext
        let calendar = BudgetCalculator.weekCalendar
        let weekStart = WeekPlanner.weekStart(for: .now, calendar: calendar)
        let wednesday = calendar.date(byAdding: .day, value: 2, to: weekStart)!

        let done = PlanActions.addSession(WorkoutContent(sport: .run, title: "Done run"), on: weekStart, in: context)
        done.setDone(true)
        PlanActions.addSession(WorkoutContent(sport: .strength, title: "Push"), on: wednesday, in: context)

        let template = WeekTemplateActions.saveWeek(startingAt: weekStart, name: "Base", in: context)
        #expect(template.sessions.map(\.weekday) == [0, 2])

        let nextWeek = WeekPlanner.weekStart(for: .now, offset: 1, calendar: calendar)
        WeekTemplateActions.apply(template, toWeekStarting: nextWeek, mode: .add, in: context)
        #expect(WeekTemplateActions.weekSessions(nextWeek, in: context).count == 2)

        // Replace in the current week keeps the completed run, swaps the rest.
        WeekTemplateActions.apply(template, toWeekStarting: weekStart, mode: .replace, in: context)
        let current = WeekTemplateActions.weekSessions(weekStart, in: context)
        #expect(current.count == 3)
        #expect(current.filter(\.isDone).map(\.title) == ["Done run"])
        let mondayOrders = current.filter { calendar.isDate($0.date, inSameDayAs: weekStart) }.map(\.order).sorted()
        #expect(mondayOrders == [0, 1])
    }

    @Test func movesSessionsBetweenDays() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = container.mainContext
        let calendar = BudgetCalculator.weekCalendar
        let monday = WeekPlanner.weekStart(for: .now, calendar: calendar)
        let tuesday = calendar.date(byAdding: .day, value: 1, to: monday)!

        let first = PlanActions.addSession(WorkoutContent(sport: .run, title: "A"), on: monday, in: context)
        let second = PlanActions.addSession(WorkoutContent(sport: .run, title: "B"), on: monday, in: context)
        let other = PlanActions.addSession(WorkoutContent(sport: .yoga, title: "C"), on: tuesday, in: context)

        PlanActions.move(first, to: tuesday, before: other, in: context)
        #expect(calendar.isDate(first.date, inSameDayAs: tuesday))
        #expect(first.order == 0)
        #expect(other.order == 1)
        #expect(second.order == 0)

        let copy = PlanActions.duplicate(other, in: context)
        #expect(copy.order == 2)
        #expect(copy.title == "C")
    }
}

@MainActor
struct TrainingLinkerTests {
    private func activity(_ id: String, type: String, at date: Date) -> ActivityRecord {
        ActivityRecord(
            source: .strava,
            externalID: id,
            name: "\(type) \(id)",
            activityType: type,
            startDate: date,
            durationSeconds: 3600,
            distanceMeters: 10_000,
            activeCalories: 600,
            caloriesEstimated: false,
            detailsComplete: true
        )
    }

    @Test func linksMatchingActivityAndMarksDone() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = container.mainContext
        let calendar = BudgetCalculator.weekCalendar
        let today = calendar.startOfDay(for: .now)

        let run = PlanActions.addSession(WorkoutContent(sport: .run, title: "Easy Run"), on: today, in: context)
        let gym = PlanActions.addSession(WorkoutContent(sport: .strength, title: "Push"), on: today, in: context)
        let stravaRun = activity("1", type: "Run", at: today.addingTimeInterval(7 * 3600))
        context.insert(stravaRun)
        try context.save()

        #expect(TrainingLinker.autoLink(days: [today], in: context))
        #expect(run.linkedActivityKey == "strava:1")
        #expect(run.isDone)
        #expect(run.completedByLink)
        #expect(gym.linkedActivityKey == nil)

        // Unlinking reverts the status and stops auto-matching for this session.
        TrainingLinker.unlink(run, in: context)
        #expect(run.status == .planned)
        #expect(TrainingLinker.autoLink(days: [today], in: context) == false)
        #expect(run.linkedActivityKey == nil)

        // Manual link works regardless of suppression.
        TrainingLinker.link(run, to: stravaRun, in: context)
        #expect(run.linkedActivityKey == "strava:1")
        #expect(run.isLinkManual)
    }

    @Test func removesLinkWhenActivityDisappears() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = container.mainContext
        let today = BudgetCalculator.weekCalendar.startOfDay(for: .now)

        let ride = PlanActions.addSession(WorkoutContent(sport: .indoorRide), on: today, in: context)
        let zwift = activity("9", type: "VirtualRide", at: today.addingTimeInterval(18 * 3600))
        context.insert(zwift)
        try context.save()
        TrainingLinker.autoLink(days: [today], in: context)
        #expect(ride.isDone)

        context.delete(zwift)
        try context.save()
        TrainingLinker.autoLink(days: [today], in: context)
        #expect(ride.linkedActivityKey == nil)
        #expect(ride.status == .planned)
    }

    @Test func createsCompletedSessionFromUnplannedActivity() throws {
        let container = try SharedModelContainer.make(inMemory: true)
        let context = container.mainContext
        let today = BudgetCalculator.weekCalendar.startOfDay(for: .now)
        let swim = activity("5", type: "Swim", at: today.addingTimeInterval(6 * 3600))
        context.insert(swim)

        let session = TrainingLinker.createSession(from: swim, in: context)
        #expect(session.sport == .swim)
        #expect(session.isDone)
        #expect(session.linkedActivityKey == "strava:5")
        #expect(session.details.enduranceWorkout.durationMinutes == 60)
        #expect(session.details.enduranceWorkout.distanceKm == 10)
    }
}
