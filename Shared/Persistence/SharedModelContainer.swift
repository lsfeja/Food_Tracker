import Foundation
import SwiftData

/// The SwiftData container shared by the app and the widget extension.
///
/// The store lives in the App Group container so widgets can read it. If the App
/// Group is unavailable (signing not configured yet), it falls back to the app's
/// own container so the app still works, but widgets will then show no data.
enum SharedModelContainer {
    static let schema = Schema([Food.self, FoodEntry.self, ActivityRecord.self])

    /// Process-wide container (app and widget extension each get their own instance).
    static let shared: ModelContainer = {
        do {
            return try make()
        } catch {
            fatalError("Could not create the SwiftData container: \(error)")
        }
    }()

    static func make(inMemory: Bool = false) throws -> ModelContainer {
        let configuration: ModelConfiguration
        if inMemory {
            configuration = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: true,
                allowsSave: true,
                groupContainer: .none,
                cloudKitDatabase: .none
            )
        } else if AppGroup.containerURL != nil {
            configuration = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: false,
                allowsSave: true,
                groupContainer: .identifier(AppGroup.identifier),
                cloudKitDatabase: .none
            )
        } else {
            configuration = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: false,
                allowsSave: true,
                groupContainer: .none,
                cloudKitDatabase: .none
            )
        }
        return try ModelContainer(for: schema, configurations: [configuration])
    }
}
