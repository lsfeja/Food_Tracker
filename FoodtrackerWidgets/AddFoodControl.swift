import AppIntents
import SwiftUI
import WidgetKit

/// Lock Screen / Control Center button that opens Foodtracker into the add-food flow.
/// The user picks what it opens (add food, barcode scanner, label photo) when adding it.
struct AddFoodControl: ControlWidget {
    static let kind = "AddFoodControl"

    var body: some ControlWidgetConfiguration {
        AppIntentControlConfiguration(kind: Self.kind, provider: Provider()) { mode in
            ControlWidgetButton(action: OpenAddFoodIntent(mode: mode)) {
                Label(mode.title, systemImage: mode.systemImage)
            }
        }
        .displayName("Log Food")
        .description("Open Foodtracker to add food, scan a barcode or photograph a label.")
        .promptsForUserConfiguration()
    }

    struct Provider: AppIntentControlValueProvider {
        func previewValue(configuration: AddFoodControlConfiguration) -> AddFoodMode {
            configuration.mode
        }

        func currentValue(configuration: AddFoodControlConfiguration) async throws -> AddFoodMode {
            configuration.mode
        }
    }
}

/// Configuration of the control: which add-food screen it opens.
struct AddFoodControlConfiguration: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Log Food"

    @Parameter(title: "Opens", default: .search)
    var mode: AddFoodMode

    init() {}

    func perform() async throws -> some IntentResult {
        .result()
    }
}
