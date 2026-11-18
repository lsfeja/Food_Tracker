import Foundation

/// Keys for settings stored in `AppGroup.defaults` (shared with widgets).
///
/// Views bind to these with `@AppStorage(SettingsKey.x, store: AppGroup.defaults)`.
/// Always use `SettingsDefault` for the default values so views, widgets and
/// calculators agree.
enum SettingsKey {
    static let targetKcal = "targetKcal"
    static let targetProtein = "targetProtein"
    static let targetCarbs = "targetCarbs"
    static let targetFat = "targetFat"
    static let weeklyModeEnabled = "weeklyModeEnabled"
    /// 0 means "7 × daily calorie target".
    static let weeklyLimitKcal = "weeklyLimitKcal"
    static let activeCaloriesEnabled = "activeCaloriesEnabled"
    /// 50…100
    static let activeCaloriesPercent = "activeCaloriesPercent"
}

enum SettingsDefault {
    static let targetKcal: Double = 2200
    static let targetProtein: Double = 140
    static let targetCarbs: Double = 220
    static let targetFat: Double = 70
    static let weeklyModeEnabled = false
    static let weeklyLimitKcal: Double = 0
    static let activeCaloriesEnabled = true
    static let activeCaloriesPercent: Double = 100
}

/// Daily nutrition targets.
struct NutritionTargets: Equatable, Sendable {
    var kcal: Double = SettingsDefault.targetKcal
    var protein: Double = SettingsDefault.targetProtein
    var carbs: Double = SettingsDefault.targetCarbs
    var fat: Double = SettingsDefault.targetFat
}

/// How the calorie budget is computed.
struct BudgetSettings: Equatable, Sendable {
    var weeklyModeEnabled: Bool = SettingsDefault.weeklyModeEnabled
    /// Custom weekly limit. 0 means "7 × daily target".
    var weeklyLimitKcal: Double = SettingsDefault.weeklyLimitKcal
    var activeCaloriesEnabled: Bool = SettingsDefault.activeCaloriesEnabled
    var activeCaloriesPercent: Double = SettingsDefault.activeCaloriesPercent

    func effectiveWeeklyLimit(dailyTarget: Double) -> Double {
        weeklyLimitKcal > 0 ? weeklyLimitKcal : dailyTarget * 7
    }
}

/// Snapshot of all settings relevant for budget calculations.
struct UserSettings: Equatable, Sendable {
    var targets = NutritionTargets()
    var budget = BudgetSettings()

    static func load(from defaults: UserDefaults = AppGroup.defaults) -> UserSettings {
        func double(_ key: String, _ fallback: Double) -> Double {
            (defaults.object(forKey: key) as? NSNumber)?.doubleValue ?? fallback
        }
        func bool(_ key: String, _ fallback: Bool) -> Bool {
            (defaults.object(forKey: key) as? NSNumber)?.boolValue ?? fallback
        }
        return UserSettings(
            targets: NutritionTargets(
                kcal: double(SettingsKey.targetKcal, SettingsDefault.targetKcal),
                protein: double(SettingsKey.targetProtein, SettingsDefault.targetProtein),
                carbs: double(SettingsKey.targetCarbs, SettingsDefault.targetCarbs),
                fat: double(SettingsKey.targetFat, SettingsDefault.targetFat)
            ),
            budget: BudgetSettings(
                weeklyModeEnabled: bool(SettingsKey.weeklyModeEnabled, SettingsDefault.weeklyModeEnabled),
                weeklyLimitKcal: double(SettingsKey.weeklyLimitKcal, SettingsDefault.weeklyLimitKcal),
                activeCaloriesEnabled: bool(SettingsKey.activeCaloriesEnabled, SettingsDefault.activeCaloriesEnabled),
                activeCaloriesPercent: double(SettingsKey.activeCaloriesPercent, SettingsDefault.activeCaloriesPercent)
            )
        )
    }
}
