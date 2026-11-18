import Foundation

/// Access to the App Group shared by the app and the widget extension.
///
/// The identifier is injected at build time (`APP_GROUP_ID` in `Config/Base.xcconfig`)
/// through the `AppGroupIdentifier` key in each target's Info.plist.
enum AppGroup {
    static let identifier: String = {
        let value = Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier") as? String
        if let value, !value.isEmpty, !value.contains("$(") {
            return value
        }
        return "group.com.example.foodtracker"
    }()

    /// Container directory of the App Group, or `nil` if the entitlement is missing
    /// (e.g. when signing is not configured yet).
    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }

    /// User defaults shared between app and widgets. Falls back to `.standard`
    /// when the App Group is unavailable so the app still runs.
    static let defaults: UserDefaults = {
        if containerURL != nil, let shared = UserDefaults(suiteName: identifier) {
            return shared
        }
        return .standard
    }()
}
