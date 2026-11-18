import Foundation

/// How a `FoodEntry` was logged.
///
/// `ai` is reserved for the planned AI estimation mode (meal photo/description).
enum EntrySource: String, Codable, CaseIterable, Sendable {
    case manual
    case barcode
    case label
    case ai

    var displayName: String {
        switch self {
        case .manual: "Manual"
        case .barcode: "Barcode"
        case .label: "Label photo"
        case .ai: "AI estimate"
        }
    }

    var systemImage: String {
        switch self {
        case .manual: "square.and.pencil"
        case .barcode: "barcode.viewfinder"
        case .label: "text.viewfinder"
        case .ai: "sparkles"
        }
    }
}

/// Where a `Food`'s nutrient data came from.
enum FoodSource: String, Codable, CaseIterable, Sendable {
    case custom
    case openFoodFacts
    case label

    var displayName: String {
        switch self {
        case .custom: "Custom"
        case .openFoodFacts: "Open Food Facts"
        case .label: "Label photo"
        }
    }
}

/// Provider of imported activities. Garmin is planned and not implemented yet.
enum ActivitySourceKind: String, Codable, CaseIterable, Sendable {
    case strava
    case garmin

    var displayName: String {
        switch self {
        case .strava: "Strava"
        case .garmin: "Garmin"
        }
    }
}
