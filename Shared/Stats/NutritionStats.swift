import Foundation

struct NutritionBucket: Identifiable, Equatable, Sendable {
    var start: Date
    var loggedDays = 0
    var eaten = Nutrients.zero
    /// Raw active calories from activities.
    var activeCalories: Double = 0

    var id: Date { start }
    var average: Nutrients { loggedDays > 0 ? eaten.scaled(by: 1 / Double(loggedDays)) : .zero }
}

struct NutritionReport: Equatable, Sendable {
    var loggedDays = 0
    var average = Nutrients.zero
    var daysWithin = 0
    var daysOver = 0
    var buckets: [NutritionBucket] = []
    var bucket: StatsBucket = .week
    /// Eaten vs. active calories per week (per day in week view).
    var energy: [NutritionBucket] = []
    var energyBucket: StatsBucket = .week
    var targets = NutritionTargets()
}

/// Nutrition statistics from daily totals (pure logic). Only days with food entries
/// count as logged days; days after today are ignored.
enum NutritionStats {
    static func report(
        totalsByDay: [Date: DayTotals],
        settings: UserSettings,
        period: StatsPeriod,
        now: Date,
        calendar: Calendar,
        earliest: Date? = nil
    ) -> NutritionReport {
        let interval = period.interval(now: now, calendar: calendar, earliest: earliest)
        let endOfToday = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now

        var report = NutritionReport()
        report.targets = settings.targets
        report.bucket = averageBucket(for: period.kind)
        report.energyBucket = period.kind == .week ? .day : (period.kind == .all ? .month : .week)

        var averages: [Date: NutritionBucket] = [:]
        var energy: [Date: NutritionBucket] = [:]
        var total = Nutrients.zero

        for (day, totals) in totalsByDay where interval.contains(day) && day < interval.end && day < endOfToday {
            let energyStart = StatsBuckets.start(of: report.energyBucket, containing: day, calendar: calendar)
            energy[energyStart, default: NutritionBucket(start: energyStart)].activeCalories += totals.activeCalories

            guard totals.eaten.kcal > 0 else { continue }
            report.loggedDays += 1
            total += totals.eaten
            energy[energyStart, default: NutritionBucket(start: energyStart)].eaten += totals.eaten

            let start = StatsBuckets.start(of: report.bucket, containing: day, calendar: calendar)
            averages[start, default: NutritionBucket(start: start)].eaten += totals.eaten
            averages[start, default: NutritionBucket(start: start)].loggedDays += 1

            let budget = BudgetCalculator.budget(for: day, settings: settings, totalsByDay: totalsByDay, calendar: calendar)
            if budget.calories.isOver {
                report.daysOver += 1
            } else {
                report.daysWithin += 1
            }
        }

        report.average = report.loggedDays > 0 ? total.scaled(by: 1 / Double(report.loggedDays)) : .zero
        report.buckets = StatsBuckets.starts(of: report.bucket, in: interval, calendar: calendar).map {
            averages[$0] ?? NutritionBucket(start: $0)
        }
        report.energy = StatsBuckets.starts(of: report.energyBucket, in: interval, calendar: calendar).map {
            energy[$0] ?? NutritionBucket(start: $0)
        }
        return report
    }

    static func averageBucket(for kind: StatsPeriodKind) -> StatsBucket {
        switch kind {
        case .week: .day
        case .month: .week
        case .year, .all: .month
        }
    }
}
