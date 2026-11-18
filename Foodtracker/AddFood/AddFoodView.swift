import SwiftUI

/// Add-food sheet (implemented in the next milestone).
struct AddFoodView: View {
    let request: AppRouter.AddFoodRequest
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ContentUnavailableView("Add Food", systemImage: request.mode.systemImage)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
    }
}
