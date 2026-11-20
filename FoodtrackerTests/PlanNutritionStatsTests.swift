import Foundation
import Testing
@testable import Foodtracker

struct PlanStatsTests {
    // Wednesday 19 Nov 2025
    let now = day(2025, 11, 19, hour: 12)

    @Test func adherenceCountsOnlyPastWorkouts() {
        let sessions = [
            PlanSessionSnapshot(date: day(2025, 11, 17), sport: .run, status: .done, plannedMinutes: 45),
            PlanSessionSnapshot(date: day(2025, 11, 18), sport: .strength, status: .planned),
            PlanSessionSnapshot(date: day(2025, 11, 18), sport: .yoga, status: .skipped, plannedMinutes: 30),
            PlanSessionSnapshot(date: day(2025, 11, 19), sport: .rest, status: .planned),
            PlanSessionSnapshot(date: day(2025, 11, 21), sport: .ride, status: .planned, plannedMinutes: 90),
        ]
        let report = PlanStats.report(sessions: sessions, activities: [], period: StatsPeriod(kind: .week, year: 2025), now: now, calendar: testCalendar)
        #expect(report.plannedToDate == 3)
        #expect(report.completed == 1)
        #expect(report.skipped == 1)
        #expect(report.rate == 1.0 / 3.0)
        #expect(report.adherence.count == 7)
        #expect(report.adherence[4].planned == 1) // Friday's ride counts as planned in the chart
        #expect(report.adherence[4].completed == 0)
    }

    @Test func trainingTimeUsesLinkedActivitiesPlannedDurationAndUnplanned() {
        let sessions = [
            PlanSessionSnapshot(date: day(2025, 11, 17), sport: .run, status: .done, plannedMinutes: 45, linkedActivityKey: "strava:1"),
            PlanSessionSnapshot(date: day(2025, 11, 18), sport: .yoga, status: .done, plannedMinutes: 30),
            PlanSessionSnapshot(date: day(2025, 11, 18), sport: .strength, status: .done),
        ]
        let activities = [
            ActivitySnapshot(id: "strava:1", start: day(2025, 11, 17, hour: 7), sport: .run, movingSeconds: 50 * 60, activityType: "Run"),
            ActivitySnapshot(id: "strava:2", start: day(2025, 11, 19, hour: 18), sport: .indoorRide, movingSeconds: 60 * 60, activityType: "VirtualRide"),
        ]
        let report = PlanStats.report(sessions: sessions, activities: activities, period: StatsPeriod(kind: .week, year: 2025), now: now, calendar: testCalendar)
        let bySport = Dictionary(uniqueKeysWithValues: report.totals.map { ($0.sport, $0.minutes) })
        #expect(bySport[.run] == 50) // actual, not planned
        #expect(bySport[.yoga] == 30)
        #expect(bySport[.indoorRide] == 60) // unplanned activity
        #expect(bySport[.strength] == nil) // no duration known
        #expect(report.totalMinutes == 140)
        #expect(report.totals.first?.sport == .indoorRide)
    }
}

struct NutritionStatsTests {
    let now = day(2025, 11, 19, hour: 12)
    let settings = UserSettings(
        targets: NutritionTargets(kcal: 2000, protein: 150, carbs: 200, fat: 70),
        budget: BudgetSettings(weeklyModeEnabled: false, weeklyLimitKcal: 0, activeCaloriesEnabled: true, activeCaloriesPercent: 100)
    )

    @Test func averagesWithinAndOverTargetAndEnergy() {
        let totals: [Date: DayTotals] = [
            day(2025, 11, 17): DayTotals(eaten: Nutrients(kcal: 1800, protein: 120, carbs: 200, fat: 60), activeCalories: 0),
            day(2025, 11, 18): DayTotals(eaten: Nutrients(kcal: 2400, protein: 160, carbs: 260, fat: 80), activeCalories: 500),
            day(2025, 11, 16): DayTotals(eaten: Nutrients(kcal: 2300, protein: 100, carbs: 250, fat: 90), activeCalories: 0),
            day(2025, 11, 19): DayTotals(eaten: .zero, activeCalories: 300), // not logged yet
            day(2025, 11, 20): DayTotals(eaten: Nutrients(kcal: 999), activeCalories: 0), // future
        ]
        let report = NutritionStats.report(totalsByDay: totals, settings: settings, period: StatsPeriod(kind: .week, year: 2025), now: now, calendar: testCalendar)
        #expect(report.loggedDays == 2)
        #expect(report.average.kcal == 2100)
        #expect(report.average.protein == 140)
        #expect(report.daysWithin == 2) // 2,400 ≤ 2,000 + 500 active
        #expect(report.daysOver == 0)
        #expect(report.buckets.count == 7)
        #expect(report.energy.count == 7)
        #expect(report.energy[1].eaten.kcal == 2400)
        #expect(report.energy[1].activeCalories == 500)
        #expect(report.energy[2].activeCalories == 300)
    }

    @Test func monthUsesWeeklyAverages() {
        let totals: [Date: DayTotals] = [
            day(2025, 11, 3): DayTotals(eaten: Nutrients(kcal: 2500)),
            day(2025, 11, 4): DayTotals(eaten: Nutrients(kcal: 1500)),
        ]
        let report = NutritionStats.report(totalsByDay: totals, settings: settings, period: StatsPeriod(kind: .month, year: 2025), now: now, calendar: testCalendar)
        #expect(report.bucket == .week)
        #expect(report.daysOver == 1)
        #expect(report.daysWithin == 1)
        #expect(report.buckets.first { $0.start == day(2025, 11, 3) }?.average.kcal == 2000)
    }
}
