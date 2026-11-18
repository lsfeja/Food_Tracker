import SwiftData
import SwiftUI

/// The add-food sheet: search/recent foods at the root, other screens pushed on top.
struct AddFoodView: View {
    @State private var flow: AddFoodFlow
    @Environment(\.dismiss) private var dismiss

    init(request: AppRouter.AddFoodRequest) {
        _flow = State(initialValue: AddFoodFlow(day: request.day, initialMode: request.mode))
    }

    var body: some View {
        @Bindable var flow = flow

        NavigationStack(path: $flow.path) {
            FoodSearchView()
                .navigationDestination(for: AddFoodRoute.self) { route in
                    destination(for: route)
                }
        }
        .environment(flow)
        .onAppear {
            flow.onFinish = { dismiss() }
        }
    }

    @ViewBuilder
    private func destination(for route: AddFoodRoute) -> some View {
        switch route {
        case .portion(let food, let source):
            PortionView(food: food, source: source)
        case .newFood(let draft, let source):
            FoodEditorView(mode: .create(draft, source))
        case .editFood(let food):
            FoodEditorView(mode: .edit(food))
        case .quickAdd:
            QuickAddView()
        case .barcodeScanner:
            BarcodeFlowView()
        case .labelScanner(let barcode):
            LabelScanView(barcode: barcode)
        }
    }
}
