import WidgetKit

/// Asks WidgetKit to reload all timelines. Call after any change to entries,
/// targets or activity data.
enum WidgetRefresher {
    static func reload() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
