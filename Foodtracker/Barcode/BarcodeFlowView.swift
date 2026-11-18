import AVFoundation
import SwiftData
import SwiftUI

/// Scan a barcode → look it up locally, then on Open Food Facts → portion screen.
/// Falls back to a label photo or manual entry if the product is unknown.
struct BarcodeFlowView: View {
    @Environment(AddFoodFlow.self) private var flow
    @Environment(AppServices.self) private var services
    @Environment(\.modelContext) private var context

    private enum Phase: Equatable {
        case checkingPermission
        case scanning
        case lookingUp(String)
        case notFound(String)
        case failed(String, message: String)
        case unavailable(String)
    }

    @State private var phase: Phase = .checkingPermission
    @State private var scannerID = UUID()
    @State private var showManualEntry = false
    @State private var manualCode = ""
    @State private var scanCount = 0

    var body: some View {
        content
            .navigationTitle("Scan Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        manualCode = ""
                        showManualEntry = true
                    } label: {
                        Image(systemName: "keyboard")
                    }
                    .accessibilityLabel("Enter barcode manually")
                }
            }
            .alert("Enter Barcode", isPresented: $showManualEntry) {
                TextField("Barcode", text: $manualCode)
                    .keyboardType(.numberPad)
                Button("Look Up") {
                    let code = manualCode.filter(\.isNumber)
                    if !code.isEmpty { lookUp(code) }
                }
                Button("Cancel", role: .cancel) {}
            }
            .sensoryFeedback(.success, trigger: scanCount)
            .task {
                await prepareCamera()
            }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .checkingPermission:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .scanning:
            ZStack(alignment: .bottom) {
                BarcodeScannerView { code in
                    scanCount += 1
                    lookUp(code)
                }
                .id(scannerID)
                .ignoresSafeArea(edges: .bottom)

                Text("Point the camera at a barcode")
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 32)
            }

        case .lookingUp(let code):
            VStack(spacing: 12) {
                ProgressView()
                Text("Looking up \(code)…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .notFound(let code):
            fallback(
                code: code,
                title: "Product not found",
                message: "\(code) isn't in Open Food Facts yet. Photograph the nutrition label or enter the values yourself."
            )

        case .failed(let code, let message):
            fallback(code: code, title: "Lookup failed", message: message, canRetry: true)

        case .unavailable(let message):
            VStack(spacing: 16) {
                ContentUnavailableView("Camera unavailable", systemImage: "camera", description: Text(message))
                Button("Enter Barcode") {
                    manualCode = ""
                    showManualEntry = true
                }
                .buttonStyle(.bordered)
                Button("Create Food Manually") {
                    flow.replaceTop(with: .newFood(FoodDraft(), .manual))
                }
                .padding(.bottom, 32)
            }
        }
    }

    private func fallback(code: String, title: String, message: String, canRetry: Bool = false) -> some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "barcode")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            VStack(spacing: 6) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 32)
            Spacer()
            VStack(spacing: 12) {
                if canRetry {
                    Button {
                        lookUp(code)
                    } label: {
                        Label("Try Again", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                Button {
                    flow.replaceTop(with: .labelScanner(barcode: code))
                } label: {
                    Label("Photograph Label", systemImage: "text.viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                Button {
                    flow.replaceTop(with: .newFood(FoodDraft(barcode: code), .barcode))
                } label: {
                    Label("Enter Manually", systemImage: "square.and.pencil")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button("Scan Another Barcode") {
                    restartScanning()
                }
                .padding(.top, 4)
            }
            .controlSize(.large)
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Logic

    private func prepareCamera() async {
        guard phase == .checkingPermission else { return }
        guard BarcodeScannerView.isSupported else {
            phase = .unavailable("Barcode scanning isn't supported on this device.")
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            if !granted {
                phase = .unavailable("Allow camera access in Settings to scan barcodes.")
                return
            }
        case .denied, .restricted:
            phase = .unavailable("Allow camera access in Settings to scan barcodes.")
            return
        default:
            break
        }
        phase = BarcodeScannerView.isAvailable ? .scanning : .unavailable("The camera is currently unavailable.")
    }

    private func restartScanning() {
        scannerID = UUID()
        phase = .checkingPermission
        Task { await prepareCamera() }
    }

    private func lookUp(_ code: String) {
        if let food = FoodCatalog.food(withBarcode: code, in: context) {
            food.isHidden = false
            flow.replaceTop(with: .portion(food, .barcode))
            return
        }

        phase = .lookingUp(code)
        Task {
            do {
                guard let draft = try await services.foodDatabase.product(forBarcode: code) else {
                    phase = .notFound(code)
                    return
                }
                if draft.isComplete {
                    let food = FoodCatalog.save(draft, in: context)
                    flow.replaceTop(with: .portion(food, .barcode))
                } else {
                    var completed = draft
                    if completed.barcode == nil { completed.barcode = code }
                    flow.replaceTop(with: .newFood(completed, .barcode))
                }
            } catch {
                phase = .failed(code, message: "Couldn't reach Open Food Facts. Check your connection, or photograph the label instead.")
            }
        }
    }
}
