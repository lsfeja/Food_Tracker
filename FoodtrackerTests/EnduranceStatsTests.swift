import Foundation
import Testing
@testable import Foodtracker

struct EnduranceStatsTests {
    let now = day(2025, 11, 19, hour: 12)

    private func activity(_ id: String, _ date: Date, _ sport: StatsSport, km: Double, hours: Double = 1, elevation: Double = 0) -> ActivitySnapshot {
        ActivitySnapshot(
            id: id,
            name: id,
            start: date,
            sport: sport,
            distanceMeters: km * 1000,
            movingSeconds: hours * 3600,
            elevationMeters: elevation,
            isIndoor: sport == .indoorRide
        )
    }

    private var sample: [ActivitySnapshot] {
        [
            activity("r1", day(2025, 3, 10, hour: 8), .ride, km: 80, hours: 3, elevation: 900),
            activity("r2", day(2025, 3, 12, hour: 8), .ride, km: 40, hours: 1.5, elevation: 300),
            activity("z1", day(2025, 1, 15, hour: 18), .indoorRide, km: 30, hours: 1),
            activity("run", day(2025, 6, 1, hour: 7), .run, km: 10, hours: 1),
            activity("old", day(2024, 5, 1, hour: 7), .ride, km: 100, hours: 4),
        ]
    }

    @Test func totalsPerFilterAndYear() {
        let period = StatsPeriod(kind: .year, year: 2025)
        let all = EnduranceStats.report(activities: sample, filter: .all, period: period, now: now, calendar: testCalendar)
        #expect(all.totals.count == 4)
        #expect(all.totals.distanceKm == 160)
        #expect(all.totals.elevationMeters == 1200)

        let cycling = EnduranceStats.report(activities: sample, filter: .cycling, period: period, now: now, calendar: testCalendar)
        #expect(cycling.totals.distanceKm == 150)
        let ride = EnduranceStats.report(activities: sample, filter: .ride, period: period, now: now, calendar: testCalendar)
        #expect(ride.totals.distanceKm == 120)
    }

    @Test func bucketsAndRecords() {
        let report = EnduranceStats.report(activities: sample, filter: .cycling, period: StatsPeriod(kind: .year, year: 2025), now: now, calendar: testCalendar)
        #expect(report.primaryBucket == .week)
        #expect(report.secondary.count == 12)
        #expect(report.secondary[2].totals.distanceKm == 120) // March
        #expect(report.longest?.name == "r1")
        #expect(report.mostElevation?.elevationMeters == 900)
        #expect(report.bestWeek?.start == day(2025, 3, 10))
        #expect(report.bestWeek?.totals.distanceKm == 120)
        #expect(report.bestMonth?.start == day(2025, 3, 1))
    }

    @Test func indoorShareOfCyclingTime() {
        let report = EnduranceStats.report(activities: sample, filter: .all, period: StatsPeriod(kind: .year, year: 2025), now: now, calendar: testCalendar)
        let share = report.indoorShare
        #expect(share?.indoorCount == 1)
        #expect(share?.outdoorCount == 2)
        #expect(share?.indoorFraction == 1.0 / 5.5)

        let runOnly = EnduranceStats.report(activities: sample, filter: .run, period: StatsPeriod(kind: .year, year: 2025), now: now, calendar: testCalendar)
        #expect(runOnly.indoorShare == nil)
    }

    @Test func yearOverYearIsCumulativeAndAligned() {
        let points = EnduranceStats.yearOverYear(sample.filter { $0.sport == .ride }, year: 2025, now: now, calendar: testCalendar)
        let previous = points.filter { $0.year == 2024 }
        let current = points.filter { $0.year == 2025 }
        #expect(previous.count == 366) // 2024 is a leap year
        #expect(previous.last?.distanceKm == 100)
        #expect(previous.first?.date == day(2025, 1, 1))
        #expect(current.last?.date == day(2025, 11, 19))
        #expect(current.last?.distanceKm == 120)
        #expect(current.first(where: { $0.date == day(2025, 3, 10) })?.distanceKm == 80)
    }

    @Test func goalProgressAgainstElapsedYear() {
        // 73 of 365 days elapsed = 20 %.
        let date = day(2025, 3, 15)
        let progress = EnduranceStats.goalProgress(target: 8000, actual: 2000, year: 2025, now: date, calendar: testCalendar)
        #expect(abs(progress.expected - 1600) < 0.001)
        #expect(abs(progress.projected - 10_000) < 0.001)
        #expect(progress.status == .onTrack)
        #expect(progress.fraction == 0.25)

        let behind = EnduranceStats.goalProgress(target: 8000, actual: 1000, year: 2025, now: date, calendar: testCalendar)
        #expect(behind.status == .behind)
        let reached = EnduranceStats.goalProgress(target: 100, actual: 120, year: 2025, now: date, calendar: testCalendar)
        #expect(reached.status == .reached)
        #expect(EnduranceStats.elapsedFraction(ofYear: 2024, now: date, calendar: testCalendar) == 1)
    }

    @Test func weekPeriodUsesDailyBuckets() {
        let report = EnduranceStats.report(activities: sample, filter: .all, period: StatsPeriod(kind: .week, year: 2025), now: now, calendar: testCalendar)
        #expect(report.primaryBucket == .day)
        #expect(report.primary.count == 7)
        #expect(report.secondaryBucket == nil)
        #expect(report.bestWeek == nil)
    }
}
