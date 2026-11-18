import AppIntents

/// Opens the app directly into the add-food flow (search, barcode or label photo).
///
/// Compiled into both the app and the widget extension. With `openAppWhenRun`, the
/// system launches the app and normally runs `perform()` in the app process; the
/// deep link then reaches `AppRouter` via `DeepLinkInbox`.
struct OpenAddFoodIntent: AppIntent {
    static let title: LocalizedStringResource = "Log Food"
    static let description = IntentDescription("Opens Foodtracker ready to add food, scan a barcode or photograph a nutrition label.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Mode", default: .search)
    var mode: AddFoodMode

    init() {}

    init(mode: AddFoodMode) {
        self.mode = mode
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        DeepLinkInbox.post(.addFood(mode))
        return .result()
    }
}
