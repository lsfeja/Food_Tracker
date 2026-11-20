import Foundation
import Testing
@testable import Foodtracker

struct DeepLinkTests {
    @Test func parsesAddFoodModes() {
        #expect(DeepLink(url: URL(string: "foodtracker://add?mode=barcode")!) == .addFood(.barcode))
        #expect(DeepLink(url: URL(string: "foodtracker://add?mode=label")!) == .addFood(.label))
        #expect(DeepLink(url: URL(string: "foodtracker://add")!) == .addFood(.search))
        #expect(DeepLink(url: URL(string: "foodtracker://today")!) == .today)
    }

    @Test func parsesPlanAndSessionLinks() {
        let id = UUID()
        #expect(DeepLink(url: URL(string: "foodtracker://plan")!) == .plan)
        #expect(DeepLink(url: URL(string: "foodtracker://stats")!) == .stats)
        #expect(DeepLink(url: URL(string: "foodtracker://session?id=\(id.uuidString)")!) == .session(id))
        #expect(DeepLink(url: URL(string: "foodtracker://session?id=nope")!) == nil)
        #expect(DeepLink(url: DeepLink.session(id).url) == .session(id))
    }

    @Test func ignoresUnknownLinks() {
        #expect(DeepLink(url: URL(string: "foodtracker://foodtracker?code=abc")!) == nil)
        #expect(DeepLink(url: URL(string: "https://example.com/add")!) == nil)
    }

    @Test func roundTripsThroughURL() {
        for mode in AddFoodMode.allCases {
            let link = DeepLink.addFood(mode)
            #expect(DeepLink(url: link.url) == link)
        }
    }

    @Test func inboxDeliversOnceAndExpires() {
        let defaults = UserDefaults(suiteName: "DeepLinkTests-\(UUID().uuidString)")!
        DeepLinkInbox.post(.addFood(.label), defaults: defaults)
        #expect(DeepLinkInbox.consume(defaults: defaults) == .addFood(.label))
        #expect(DeepLinkInbox.consume(defaults: defaults) == nil)

        DeepLinkInbox.post(.addFood(.barcode), defaults: defaults)
        let later = Date.now.addingTimeInterval(DeepLinkInbox.maxAge + 10)
        #expect(DeepLinkInbox.consume(defaults: defaults, now: later) == nil)
    }
}
