import Foundation
import Observation

/// Screens inside the add-food sheet.
enum AddFoodRoute: Hashable {
    /// Enter the amount for a food and log it.
    case portion(Food, EntrySource)
    /// Create a new food (optionally prefilled), then continue to `.portion`.
    case newFood(FoodDraft, EntrySource)
    /// Edit an existing food's per-100 g values.
    case editFood(Food)
    /// Log calories/macros directly without a food.
    case quickAdd
    case barcodeScanner
    case labelScanner(barcode: String?)
}

/// Navigation state of the add-food sheet, shared with its screens via the environment.
@MainActor
@Observable
final class AddFoodFlow {
    var path: [AddFoodRoute]
    /// Day new entries are logged to.
    let day: Date
    var onFinish: () -> Void = {}

    init(day: Date, initialMode: AddFoodMode) {
        self.day = day
        switch initialMode {
        case .search: path = []
        case .barcode: path = [.barcodeScanner]
        case .label: path = [.labelScanner(barcode: nil)]
        }
    }

    func push(_ route: AddFoodRoute) {
        path.append(route)
    }

    /// Replaces the current screen, e.g. scanner → portion, so "Back" skips the scanner.
    func replaceTop(with route: AddFoodRoute) {
        if path.isEmpty {
            path = [route]
        } else {
            path[path.count - 1] = route
        }
    }

    func pop() {
        if !path.isEmpty { path.removeLast() }
    }

    /// Closes the sheet after logging.
    func finish() {
        onFinish()
    }
}
