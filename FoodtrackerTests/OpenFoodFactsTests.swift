import Foundation
import Testing
@testable import Foodtracker

struct OpenFoodFactsTests {
    @Test func decodesCompleteProduct() throws {
        let json = """
        {
          "code": "4000417025005",
          "status": 1,
          "status_verbose": "product found",
          "product": {
            "code": "4000417025005",
            "product_name": "Vollmilch Schokolade",
            "brands": "Ritter Sport, Alfred Ritter",
            "serving_quantity": "16.7",
            "nutriments": {
              "energy-kcal_100g": 567,
              "energy-kcal_unit": "kcal",
              "proteins_100g": 8.1,
              "carbohydrates_100g": "52",
              "fat_100g": 36,
              "nova-group": 4
            }
          }
        }
        """
        let response = try JSONDecoder().decode(OFFProductResponse.self, from: Data(json.utf8))
        let draft = try #require(response.product?.draft(fallbackBarcode: nil))
        #expect(draft.name == "Vollmilch Schokolade")
        #expect(draft.brand == "Ritter Sport")
        #expect(draft.barcode == "4000417025005")
        #expect(draft.kcal == 567)
        #expect(draft.protein == 8.1)
        #expect(draft.carbs == 52)
        #expect(draft.fat == 36)
        #expect(draft.servingGrams == 16.7)
        #expect(draft.source == .openFoodFacts)
        #expect(draft.isComplete)
    }

    @Test func fallsBackToKilojoules() throws {
        let json = """
        {"status": 1, "product": {"product_name": "Brot", "nutriments": {"energy_100g": 1046}}}
        """
        let response = try JSONDecoder().decode(OFFProductResponse.self, from: Data(json.utf8))
        let draft = try #require(response.product?.draft(fallbackBarcode: "123"))
        #expect(draft.kcal == 250)
        #expect(draft.barcode == "123")
        #expect(draft.protein == nil)
    }

    @Test func incompleteProductIsNotComplete() throws {
        let json = """
        {"status": 1, "product": {"product_name": "Mystery", "nutriments": {}}}
        """
        let response = try JSONDecoder().decode(OFFProductResponse.self, from: Data(json.utf8))
        let draft = try #require(response.product?.draft(fallbackBarcode: "1"))
        #expect(draft.isComplete == false)
    }

    @Test func notFoundResponseHasNoProduct() throws {
        let json = """
        {"code": "0000", "status": 0, "status_verbose": "product not found"}
        """
        let response = try JSONDecoder().decode(OFFProductResponse.self, from: Data(json.utf8))
        #expect(response.status == 0)
        #expect(response.product == nil)
    }

    @Test func searchSkipsUnusableProducts() throws {
        let json = """
        {"count": 3, "products": [
          {"code": "1", "product_name": "Skyr", "nutriments": {"energy-kcal_100g": 63, "proteins_100g": 11}},
          {"code": "2", "product_name": "", "nutriments": {}},
          {"code": "3", "product_name": "No energy", "nutriments": {"fat_100g": 3}}
        ]}
        """
        let response = try JSONDecoder().decode(OFFSearchResponse.self, from: Data(json.utf8))
        let drafts = response.products.compactMap { $0.draft(fallbackBarcode: nil) }.filter(\.isComplete)
        #expect(drafts.map(\.name) == ["Skyr"])
    }

    @Test func barcodeVariantsMatchUPCAndEAN() {
        #expect(FoodCatalog.barcodeVariants("012345678905") == ["012345678905", "0012345678905"])
        #expect(FoodCatalog.barcodeVariants("0012345678905") == ["0012345678905", "012345678905"])
        #expect(FoodCatalog.barcodeVariants("abc") == [])
    }
}
