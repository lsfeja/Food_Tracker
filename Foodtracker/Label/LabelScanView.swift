import PhotosUI
import SwiftUI

/// Photograph a nutrition label → OCR → prefilled food editor for confirmation.
struct LabelScanView: View {
    /// Barcode to attach to the new food (when coming from an unknown barcode).
    let barcode: String?

    @Environment(AddFoodFlow.self) private var flow
    @Environment(AppServices.self) private var services

    private enum Phase: Equatable {
        case ready
        case processing
        case noValues
        case failed(String)
    }

    @State private var phase: Phase = .ready
    @State private var showCamera = false
    @State private var didAutoOpenCamera = false
    @State private var photoItem: PhotosPickerItem?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            switch phase {
            case .ready:
                intro
            case .processing:
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Reading label…")
                        .foregroundStyle(.secondary)
                }
            case .noValues:
                message(
                    title: "No values found",
                    text: "Make sure the nutrition table is flat, well lit and fills the photo."
                )
            case .failed(let text):
                message(title: "Couldn't read the photo", text: text)
            }
            Spacer()
            if phase != .processing {
                actions
            }
        }
        .padding(24)
        .navigationTitle("Label Photo")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                if let image { process(image) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await loadPhoto(item) }
        }
        .task {
            // Open the camera right away; wait for the push/sheet animation to finish.
            guard !didAutoOpenCamera, CameraPicker.isAvailable else { return }
            didAutoOpenCamera = true
            try? await Task.sleep(for: .milliseconds(450))
            showCamera = true
        }
    }

    private var intro: some View {
        VStack(spacing: 12) {
            Image(systemName: "text.viewfinder")
                .font(.system(size: 52))
                .foregroundStyle(Color.accentColor)
            Text("Photograph the nutrition table")
                .font(.title3.weight(.semibold))
            Text("Values per 100 g are read automatically. You can check and correct them before saving.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func message(title: String, text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.magnifyingglass")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.title3.weight(.semibold))
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private var actions: some View {
        VStack(spacing: 12) {
            if CameraPicker.isAvailable {
                Button {
                    showCamera = true
                } label: {
                    Label(phase == .ready ? "Take Photo" : "Retake Photo", systemImage: "camera")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            PhotosPicker(selection: $photoItem, matching: .images) {
                Label("Choose from Library", systemImage: "photo")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            if phase != .ready {
                Button("Enter Values Manually") {
                    flow.replaceTop(with: .newFood(FoodDraft(barcode: barcode, source: .label), .label))
                }
                .padding(.top, 4)
            }
        }
        .controlSize(.large)
    }

    // MARK: - Processing

    private func loadPhoto(_ item: PhotosPickerItem) async {
        photoItem = nil
        phase = .processing
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data)
            else {
                phase = .failed("The selected photo couldn't be loaded.")
                return
            }
            process(image)
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func process(_ image: UIImage) {
        phase = .processing
        let ocr = services.ocr
        Task {
            do {
                let parsed = try await ocr.readNutritionLabel(from: image)
                guard parsed.foundAny else {
                    phase = .noValues
                    return
                }
                let draft = FoodDraft(
                    name: "",
                    barcode: barcode,
                    kcal: parsed.kcal,
                    protein: parsed.protein,
                    carbs: parsed.carbs,
                    fat: parsed.fat,
                    source: .label
                )
                flow.replaceTop(with: .newFood(draft, .label))
            } catch {
                phase = .failed(error.localizedDescription)
            }
        }
    }
}
