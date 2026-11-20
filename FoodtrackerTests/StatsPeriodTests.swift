import Foundation
import Testing
@testable import Foodtracker

struct StatsPeriodTests {
    // Wednesday, 19 Nov 2025, 15:00 UTC
    let now = day(2025, 11, 19, hour: 15)

    @Test func currentWeekMonthAndYear() {
        let week = StatsPeriod(kind: .week, year: 2025).interval(now: now, calendar: testCalendar)
        #expect(week.start == day(2025, 11, 17))
        #expect(week.end == day(2025, 11, 24))

        let month = StatsPeriod(kind: .month, year: 2025).interval(now: now, calendar: testCalendar)
        #expect(month.start == day(2025, 11, 1))
        #expect(month.end == day(2025, 12, 1))

        let year = StatsPeriod(kind: .year, year: 2025).interval(now: now, calendar: testCalendar)
        #expect(year.start == day(2025, 1, 1))
        #expect(year.end == day(2026, 1, 1))
    }

    @Test func pastYearUsesItsLastWeekAndMonth() {
        let month = StatsPeriod(kind: .month, year: 2023).interval(now: now, calendar: testCalendar)
        #expect(month.start == day(2023, 12, 1))
        let week = StatsPeriod(kind: .week, year: 2023).interval(now: now, calendar: testCalendar)
        #expect(week.start == day(2023, 12, 25))
    }

    @Test func allTimeStartsAtEarliestData() {
        let all = StatsPeriod(kind: .all, year: 2025).interval(now: now, calendar: testCalendar, earliest: day(2019, 3, 4, hour: 9))
        #expect(all.start == day(2019, 3, 4))
        #expect(all.end == day(2025, 11, 20))
    }

    @Test func bucketsCoverInterval() {
        let interval = StatsPeriod(kind: .year, year: 2025).interval(now: now, calendar: testCalendar)
        let months = StatsBuckets.starts(of: .month, in: interval, calendar: testCalendar)
        #expect(months.count == 12)
        #expect(months.first == day(2025, 1, 1))
        let weeks = StatsBuckets.starts(of: .week, in: interval, calendar: testCalendar)
        #expect(weeks.first == day(2024, 12, 30)) // week containing 1 Jan starts Monday 30 Dec
        #expect(weeks.count == 53)
    }
}
