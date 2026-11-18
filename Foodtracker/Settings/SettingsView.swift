import SwiftUI

/// Targets, weekly budget mode, activity integration.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    @AppStorage(SettingsKey.targetKcal, store: AppGroup.defaults) private var targetKcal = SettingsDefault.targetKcal
    @AppStorage(SettingsKey.targetProtein, store: AppGroup.defaults) private var targetProtein = SettingsDefault.targetProtein
    @AppStorage(SettingsKey.targetCarbs, store: AppGroup.defaults) private var targetCarbs = SettingsDefault.targetCarbs
    @AppStorage(SettingsKey.targetFat, store: AppGroup.defaults) private var targetFat = SettingsDefault.targetFat
    @AppStorage(SettingsKey.weeklyModeEnabled, store: AppGroup.defaults) private var weeklyModeEnabled = SettingsDefault.weeklyModeEnabled
    @AppStorage(SettingsKey.weeklyLimitKcal, store: AppGroup.defaults) private var weeklyLimitKcal = SettingsDefault.weeklyLimitKcal
    @AppStorage(SettingsKey.activeCaloriesEnabled, store: AppGroup.defaults) private var activeCaloriesEnabled = SettingsDefault.activeCaloriesEnabled
    @AppStorage(SettingsKey.activeCaloriesPercent, store: AppGroup.defaults) private var activeCaloriesPercent = SettingsDefault.activeCaloriesPercent

    var body: some View {
        NavigationStack {
            Form {
                targetsSection
                weeklySection
                ActivitySettingsSection()
                activeCaloriesSection
                aboutSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .onDisappear {
            WidgetRefresher.reload()
        }
    }

    // MARK: - Sections

    private var targetsSection: some View {
        Section {
            TargetField(title: "Calories", value: $targetKcal, unit: "kcal")
            TargetField(title: "Protein", value: $targetProtein, unit: "g")
            TargetField(title: "Carbohydrates", value: $targetCarbs, unit: "g")
            TargetField(title: "Fat", value: $targetFat, unit: "g")
        } header: {
            Text("Daily Targets")
        } footer: {
            let macroKcal = Nutrients(protein: targetProtein, carbs: targetCarbs, fat: targetFat).kcalFromMacros
            Text("Your macro targets add up to \(Format.kcal(macroKcal)) kcal.")
        }
    }

    private var weeklySection: some View {
        Section {
            Toggle("Weekly budget", isOn: $weeklyModeEnabled)
            if weeklyModeEnabled {
                TargetField(title: "Weekly limit", value: weeklyLimitBinding, unit: "kcal")
                if weeklyLimitKcal > 0 {
                    Button("Use 7 × daily target (\(Format.kcal(targetKcal * 7)) kcal)") {
                        weeklyLimitKcal = 0
                    }
                }
            }
        } header: {
            Text("Weekly Mode")
        } footer: {
            Text("Calories you don't eat carry over to the rest of the week (Monday to Sunday), and eating more lowers the following days. The home screen shows your weekly balance.")
        }
    }

    private var activeCaloriesSection: some View {
        Section {
            Toggle("Add active calories to budget", isOn: $activeCaloriesEnabled)
            if activeCaloriesEnabled {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Count")
                        Spacer()
                        Text("\(Int(activeCaloriesPercent)) %")
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    Slider(value: $activeCaloriesPercent, in: 50...100, step: 5) {
                        Text("Share of active calories")
                    } minimumValueLabel: {
                        Text("50 %").font(.caption)
                    } maximumValueLabel: {
                        Text("100 %").font(.caption)
                    }
                }
            }
        } header: {
            Text("Active Calories")
        } footer: {
            Text("Activity trackers often overestimate calories burned. Counting only part of them keeps your budget on the safe side.")
        }
    }

    private var aboutSection: some View {
        Section {
            LabeledContent("Version", value: appVersion)
        } footer: {
            Text("All data is stored on this iPhone. No account required.")
        }
    }

    // MARK: - Helpers

    /// Shows 7 × daily target while no custom limit is set.
    private var weeklyLimitBinding: Binding<Double> {
        Binding(
            get: { weeklyLimitKcal > 0 ? weeklyLimitKcal : targetKcal * 7 },
            set: { newValue in
                weeklyLimitKcal = abs(newValue - targetKcal * 7) < 0.5 ? 0 : newValue
            }
        )
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "–"
        return "\(version) (\(build))"
    }
}

/// Number field bound to a positive `Double` setting.
struct TargetField: View {
    let title: String
    @Binding var value: Double
    let unit: String

    @State private var text = ""

    var body: some View {
        NumberField(title: title, text: $text, unit: unit)
            .onAppear {
                text = Format.editable(value, maxFractionDigits: 0)
            }
            .onChange(of: text) { _, newValue in
                if let parsed = DecimalParser.parse(newValue), parsed > 0, parsed != value {
                    value = parsed
                }
            }
            .onChange(of: value) { _, newValue in
                // Reflect external changes (e.g. "reset") without fighting the user's typing.
                if DecimalParser.parse(text) != newValue {
                    text = Format.editable(newValue, maxFractionDigits: 0)
                }
            }
    }
}
