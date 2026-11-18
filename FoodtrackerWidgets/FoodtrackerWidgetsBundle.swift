import SwiftUI
import WidgetKit

@main
struct FoodtrackerWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        AddFoodControl()
    }
}
