import AppIntents

/// Which add-food screen to open (used by deep links, App Intents and the Control).
enum AddFoodMode: String, AppEnum, CaseIterable, Codable, Sendable {
    case search
    case barcode
    case label

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Add Food Mode"

    static let caseDisplayRepresentations: [AddFoodMode: DisplayRepresentation] = [
        .search: DisplayRepresentation(title: "Add Food", image: .init(systemName: "plus.circle")),
        .barcode: DisplayRepresentation(title: "Scan Barcode", image: .init(systemName: "barcode.viewfinder")),
        .label: DisplayRepresentation(title: "Photograph Label", image: .init(systemName: "text.viewfinder")),
    ]

    var title: String {
        switch self {
        case .search: "Add Food"
        case .barcode: "Scan Barcode"
        case .label: "Photograph Label"
        }
    }

    var systemImage: String {
        switch self {
        case .search: "plus.circle"
        case .barcode: "barcode.viewfinder"
        case .label: "text.viewfinder"
        }
    }
}
