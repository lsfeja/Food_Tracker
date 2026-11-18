import AppIntents

/// Siri / Spotlight / Action button shortcut.
struct FoodtrackerShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenAddFoodIntent(),
            phrases: [
                "Log food in \(.applicationName)",
                "Add food in \(.applicationName)",
            ],
            shortTitle: "Log Food",
            systemImageName: "plus.circle"
        )
    }
}
