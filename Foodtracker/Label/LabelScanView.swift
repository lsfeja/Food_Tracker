import SwiftUI

/// Nutrition label photo (implemented in a later milestone).
struct LabelScanView: View {
    let barcode: String?

    var body: some View {
        ContentUnavailableView("Label photo", systemImage: "text.viewfinder", description: Text("Coming soon"))
    }
}
