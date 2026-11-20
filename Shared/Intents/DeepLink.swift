import Foundation

/// In-app destinations reachable from widgets, controls, intents and URLs.
///
/// URL format: `foodtracker://today`, `foodtracker://add?mode=search|barcode|label`,
/// `foodtracker://plan`, `foodtracker://session?id=<UUID>`.
/// (`foodtracker://foodtracker` is reserved for the Strava OAuth callback.)
enum DeepLink: Equatable, Sendable {
    case today
    case addFood(AddFoodMode)
    case plan
    case session(UUID)

    static let scheme = "foodtracker"

    init?(url: URL) {
        guard url.scheme?.lowercased() == Self.scheme else { return nil }
        switch url.host?.lowercased() {
        case "today":
            self = .today
        case "add":
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let modeValue = components?.queryItems?.first(where: { $0.name == "mode" })?.value
            self = .addFood(modeValue.flatMap(AddFoodMode.init(rawValue:)) ?? .search)
        case "plan":
            self = .plan
        case "session":
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            guard let idValue = components?.queryItems?.first(where: { $0.name == "id" })?.value,
                  let id = UUID(uuidString: idValue)
            else { return nil }
            self = .session(id)
        default:
            return nil
        }
    }

    var url: URL {
        switch self {
        case .today:
            URL(string: "\(Self.scheme)://today")!
        case .addFood(let mode):
            URL(string: "\(Self.scheme)://add?mode=\(mode.rawValue)")!
        case .plan:
            URL(string: "\(Self.scheme)://plan")!
        case .session(let id):
            URL(string: "\(Self.scheme)://session?id=\(id.uuidString)")!
        }
    }
}

/// Hands deep links from App Intents to the app.
///
/// An intent with `openAppWhenRun` normally runs inside the app process; then the
/// notification reaches `AppRouter` immediately. If it runs in the widget extension,
/// the app picks up the pending link from the shared defaults when it becomes active.
enum DeepLinkInbox {
    static let didPostNotification = Notification.Name("DeepLinkInbox.didPost")
    /// Links older than this are ignored (e.g. if the app was opened much later).
    static let maxAge: TimeInterval = 120

    private static let urlKey = "pendingDeepLinkURL"
    private static let dateKey = "pendingDeepLinkDate"

    static func post(_ link: DeepLink, defaults: UserDefaults = AppGroup.defaults) {
        defaults.set(link.url.absoluteString, forKey: urlKey)
        defaults.set(Date.now.timeIntervalSince1970, forKey: dateKey)
        NotificationCenter.default.post(name: didPostNotification, object: nil)
    }

    static func consume(defaults: UserDefaults = AppGroup.defaults, now: Date = .now) -> DeepLink? {
        guard let string = defaults.string(forKey: urlKey) else { return nil }
        let postedAt = defaults.double(forKey: dateKey)
        defaults.removeObject(forKey: urlKey)
        defaults.removeObject(forKey: dateKey)
        guard now.timeIntervalSince1970 - postedAt <= maxAge, let url = URL(string: string) else { return nil }
        return DeepLink(url: url)
    }
}
