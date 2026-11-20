import Foundation
import Testing
@testable import Foodtracker

struct StrengthStatsTests {
    let now = day(2025, 11, 19, hour: 12)

    private func session(_ date: Date, _ exercises: [ExerciseEntry], done: Bool = true, id: UUID = UUID()) -> StrengthSessionSnapshot {
        StrengthSessionSnapshot(id: id, date: date, isDone: done, workout: StrengthWorkout(exercises: exercises))
    }

    private func bench(_ sets: [(Int, Double, Bool)]) -> ExerciseEntry {
        ExerciseEntry(name: "Bench Press", sets: sets.map { ExerciseSet(plannedReps: $0.0, plannedWeight: $0.1, isDone: $0.2) })
    }

    @Test func epleyOneRepMax() {
        #expect(StrengthStats.oneRepMax(weight: 100, reps: 1) == 100)
        #expect(StrengthStats.oneRepMax(weight: 90, reps: 6) == 108)
        #expect(StrengthStats.oneRepMax(weight: 60, reps: 30) == 120)
    }

    @Test func onlyDoneSetsCountWithActualValues() {
        let exercise = ExerciseEntry(name: "Squat", sets: [
            ExerciseSet(plannedReps: 5, plannedWeight: 100, actualReps: 4, actualWeight: 102.5, isDone: true),
            ExerciseSet(plannedReps: 5, plannedWeight: 100, isDone: false),
            ExerciseSet(plannedReps: 10, isDone: true),
        ])
        let sets = StrengthStats.performedSets(exercise)
        #expect(sets == [PerformedSet(reps: 4, weight: 102.5), PerformedSet(reps: 10, weight: nil)])
        #expect(sets[0].volume == 410)
        #expect(sets[1].estimatedOneRepMax == nil)
    }

    @Test func summarizesExercisesAndRecords() {
        let sessions = [
            session(day(2025, 11, 3), [bench([(8, 80, true), (8, 80, true)])]),
            session(day(2025, 11, 10), [bench([(5, 90, true), (8, 82.5, true)])]),
            session(day(2025, 11, 17), [ExerciseEntry(name: "bench press", sets: [ExerciseSet(plannedReps: 3, plannedWeight: 90, isDone: true)])]),
        ]
        let summaries = StrengthStats.exerciseSummaries(sessions)
        #expect(summaries.count == 1)
        let bench = summaries[0]
        #expect(bench.name == "bench press") // most recent spelling
        #expect(bench.history.count == 3)
        #expect(bench.maxWeight == DatedValue(value: 90, date: day(2025, 11, 10))) // earliest of the ties
        #expect(bench.bestOneRepMax?.value == 105) // 90 × (1 + 5/30)
        #expect(bench.totalVolume == 1280 + 450 + 660 + 270)

        let records = StrengthStats.records(from: summaries)
        #expect(records.map(\.kind) == [.maxWeight, .oneRepMax])
    }

    @Test func reportsPeriodTotalsAndWeeklyBuckets() {
        let sessions = [
            session(day(2025, 11, 3), [bench([(10, 50, true)])]),
            session(day(2025, 11, 5), [bench([(10, 50, true), (10, 50, false)])]),
            session(day(2025, 11, 12), [bench([(10, 60, false)])], done: false), // nothing ticked: ignored
            session(day(2024, 11, 5), [bench([(10, 40, true)])]),
        ]
        let report = StrengthStats.report(sessions: sessions, period: StatsPeriod(kind: .month, year: 2025), now: now, calendar: testCalendar)
        #expect(report.sessionCount == 2)
        #expect(report.setCount == 2)
        #expect(report.volume == 1000)
        #expect(report.bucket == .day)
        #expect(report.buckets.count == 30)
        #expect(report.exercises.count == 1)

        let year = StrengthStats.report(sessions: sessions, period: StatsPeriod(kind: .year, year: 2025), now: now, calendar: testCalendar)
        #expect(year.bucket == .week)
        #expect(year.buckets.first { $0.start == day(2025, 11, 3) }?.sessions == 2)
    }

    @Test func detectsNewRecordsAgainstHistoryOnly() {
        let earlier = session(day(2025, 11, 3), [bench([(8, 80, true)])])
        let today = session(day(2025, 11, 10), [
            bench([(3, 85, true)]),
            ExerciseEntry(name: "Leg Press", sets: [ExerciseSet(plannedReps: 10, plannedWeight: 200, isDone: true)]),
        ])
        let records = StrengthStats.newRecords(in: today, previous: [earlier, today])
        // 85 kg > 80 kg is a weight PR; 1RM 93.5 < 101.3 is not. Leg press is new, not a PR.
        #expect(records.map(\.kind) == [.maxWeight])
        #expect(records.first?.value == 85)
    }
}

extension StrengthStatsTests {
    @Test func roundsToPlaces() {
        #expect(101.3333.rounded(toPlaces: 1) == 101.3)
        #expect(Format.volume(12_400) == 12.4.formatted(.number.precision(.fractionLength(0...1))))
        #expect(Format.volumeUnit(9_999) == "kg")
    }
}
