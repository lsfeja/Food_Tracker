import Foundation

/// Fixed calendar for deterministic date math in tests (Monday-based weeks, UTC).
let testCalendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    calendar.firstWeekday = 2
    calendar.minimumDaysInFirstWeek = 4
    return calendar
}()

/// Start of a day in `testCalendar`.
func day(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0) -> Date {
    testCalendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
}
