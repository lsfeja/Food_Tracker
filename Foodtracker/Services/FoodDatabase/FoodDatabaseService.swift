import Foundation

/// Looks up packaged foods online. Results are drafts; saving them is up to the caller.
protocol FoodDatabaseService: Sendable {
    /// Returns `nil` if the product is unknown.
    func product(forBarcode barcode: String) async throws -> FoodDraft?
    /// Text search. Only returns drafts with a name and calories.
    func search(_ query: String) async throws -> [FoodDraft]
}

enum FoodDatabaseError: LocalizedError {
    case badStatus(Int)

    var errorDescription: String? {
        switch self {
        case .badStatus(let code):
            "The food database returned an error (HTTP \(code)). Please try again later."
        }
    }
}

/// Open Food Facts (https://world.openfoodfacts.org). Free, no API key.
/// Requires a descriptive User-Agent. Search is rate limited (≈10 requests/min), so
/// it only runs when the user explicitly asks for it.
struct OpenFoodFactsService: FoodDatabaseService {
    var session: URLSession = .shared

    static let userAgent = "Foodtracker/1.0 (iOS; private use)"
    static let fields = "code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,serving_quantity"

    func product(forBarcode barcode: String) async throws -> FoodDraft? {
        let digits = barcode.filter(\.isNumber)
        guard !digits.isEmpty,
              var components = URLComponents(string: "https://world.openfoodfacts.org/api/v2/product/\(digits)")
        else { return nil }
        components.queryItems = [URLQueryItem(name: "fields", value: Self.fields)]
        guard let url = components.url else { return nil }

        let (data, response) = try await session.data(for: request(url))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 200
        if status == 404 { return nil }
        guard (200..<300).contains(status) else { throw FoodDatabaseError.badStatus(status) }

        let decoded = try JSONDecoder().decode(OFFProductResponse.self, from: data)
        guard decoded.status != 0, let product = decoded.product else { return nil }
        return product.draft(fallbackBarcode: digits)
    }

    func search(_ query: String) async throws -> [FoodDraft] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              var components = URLComponents(string: "https://world.openfoodfacts.org/cgi/search.pl")
        else { return [] }
        components.queryItems = [
            URLQueryItem(name: "search_terms", value: trimmed),
            URLQueryItem(name: "search_simple", value: "1"),
            URLQueryItem(name: "action", value: "process"),
            URLQueryItem(name: "json", value: "1"),
            URLQueryItem(name: "page_size", value: "25"),
            URLQueryItem(name: "fields", value: Self.fields),
        ]
        guard let url = components.url else { return [] }

        let (data, response) = try await session.data(for: request(url))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 200
        guard (200..<300).contains(status) else { throw FoodDatabaseError.badStatus(status) }

        let decoded = try JSONDecoder().decode(OFFSearchResponse.self, from: data)
        return decoded.products
            .compactMap { $0.draft(fallbackBarcode: nil) }
            .filter(\.isComplete)
    }

    private func request(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }
}

// MARK: - DTOs

struct OFFProductResponse: Decodable {
    let status: Int?
    let product: OFFProduct?

    private enum CodingKeys: String, CodingKey { case status, product }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = (try? container.decode(LossyDouble.self, forKey: .status))?.value.map { Int($0) }
        product = try? container.decode(OFFProduct.self, forKey: .product)
    }
}

struct OFFSearchResponse: Decodable {
    let products: [OFFProduct]

    private enum CodingKeys: String, CodingKey { case products }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        products = (try? container.decode([OFFProduct].self, forKey: .products)) ?? []
    }
}

/// One product. Decoding is lenient: OFF data is crowd-sourced and numbers are
/// sometimes encoded as strings.
struct OFFProduct: Decodable {
    var code: String?
    var productName: String?
    var productNameDE: String?
    var productNameEN: String?
    var genericName: String?
    var brands: String?
    var nutriments: [String: LossyDouble] = [:]
    var servingQuantity: Double?

    private enum CodingKeys: String, CodingKey {
        case code
        case productName = "product_name"
        case productNameDE = "product_name_de"
        case productNameEN = "product_name_en"
        case genericName = "generic_name"
        case brands
        case nutriments
        case servingQuantity = "serving_quantity"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let string = try? container.decode(String.self, forKey: .code) {
            code = string
        } else if let number = try? container.decode(Int64.self, forKey: .code) {
            code = String(number)
        }
        productName = try? container.decode(String.self, forKey: .productName)
        productNameDE = try? container.decode(String.self, forKey: .productNameDE)
        productNameEN = try? container.decode(String.self, forKey: .productNameEN)
        genericName = try? container.decode(String.self, forKey: .genericName)
        brands = try? container.decode(String.self, forKey: .brands)
        nutriments = (try? container.decode([String: LossyDouble].self, forKey: .nutriments)) ?? [:]
        servingQuantity = (try? container.decode(LossyDouble.self, forKey: .servingQuantity))?.value
    }

    private func nutriment(_ key: String) -> Double? {
        guard let value = nutriments[key]?.value, value.isFinite, value >= 0 else { return nil }
        return value
    }

    /// Calories per 100 g, falling back to kJ (÷ 4.184) when kcal is missing.
    var kcalPer100g: Double? {
        if let kcal = nutriment("energy-kcal_100g") { return kcal }
        if let kj = nutriment("energy-kj_100g") ?? nutriment("energy_100g") { return (kj / 4.184).rounded() }
        return nil
    }

    var displayName: String? {
        [productName, productNameDE, productNameEN, genericName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    func draft(fallbackBarcode: String?) -> FoodDraft? {
        let name = displayName
        let kcal = kcalPer100g
        // Nothing useful at all.
        if name == nil && kcal == nil { return nil }
        let brand = brands?
            .split(separator: ",")
            .first
            .map { $0.trimmingCharacters(in: .whitespaces) }
        return FoodDraft(
            name: name ?? "",
            brand: (brand?.isEmpty ?? true) ? nil : brand,
            barcode: code ?? fallbackBarcode,
            kcal: kcal,
            protein: nutriment("proteins_100g"),
            carbs: nutriment("carbohydrates_100g"),
            fat: nutriment("fat_100g"),
            servingGrams: servingQuantity.flatMap { $0 > 0 ? $0 : nil },
            source: .openFoodFacts
        )
    }
}

/// Decodes a number that may be encoded as a JSON number or a string; anything else → nil.
struct LossyDouble: Decodable {
    let value: Double?

    init(_ value: Double?) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let number = try? container.decode(Double.self) {
            value = number
        } else if let string = try? container.decode(String.self) {
            value = DecimalParser.parse(string)
        } else {
            value = nil
        }
    }
}
