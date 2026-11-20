import Foundation
import SwiftData

/// Optional yearly endurance goal per sport filter (e.g. 8,000 km cycling in 2026).
/// Shared with the stats widget.
@Model
final class YearlyGoal {
    var year: Int = 0
    var sportRaw: String = StatsSportFilter.all.rawValue
    /// Distance target in km (optional).
    var distanceKm: Double?
    /// Time target in hours (optional).
    var hours: Double?
    var updatedAt: Date = Date.now

    init(year: Int, sport: StatsSportFilter, distanceKm: Double? = nil, hours: Double? = nil) {
        self.year = year
        self.sportRaw = sport.rawValue
        self.distanceKm = distanceKm
        self.hours = hours
    }

    var sport: StatsSportFilter {
        get { StatsSportFilter(rawValue: sportRaw) ?? .all }
        set { sportRaw = newValue.rawValue }
    }
}
