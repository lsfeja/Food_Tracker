import Testing
@testable import Foodtracker

struct AppGroupTests {
    @Test func identifierIsResolved() {
        #expect(AppGroup.identifier.hasPrefix("group."))
    }
}
