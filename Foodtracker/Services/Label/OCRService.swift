import ImageIO
import UIKit
import Vision

/// On-device text recognition (Apple Vision) tuned for German and English labels.
struct OCRService: Sendable {
    enum OCRError: LocalizedError {
        case invalidImage

        var errorDescription: String? {
            "The photo couldn't be read. Please try again."
        }
    }

    /// Recognizes text lines with their positions.
    func recognizeText(in image: UIImage) async throws -> [TextFragment] {
        let prepared = image.preparedForOCR()
        guard let cgImage = prepared.cgImage else { throw OCRError.invalidImage }

        return try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["de-DE", "en-US"]
            request.usesLanguageCorrection = true

            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
            try handler.perform([request])

            return (request.results ?? []).compactMap { observation -> TextFragment? in
                guard let candidate = observation.topCandidates(1).first else { return nil }
                let box = observation.boundingBox
                return TextFragment(
                    text: candidate.string,
                    minX: Double(box.minX),
                    minY: Double(box.minY),
                    width: Double(box.width),
                    height: Double(box.height)
                )
            }
        }.value
    }

    /// Recognizes text and extracts per-100 g values.
    func readNutritionLabel(from image: UIImage) async throws -> ParsedNutrition {
        let fragments = try await recognizeText(in: image)
        return NutritionLabelParser.parse(fragments: fragments)
    }
}

extension UIImage {
    /// Upright (orientation `.up`) copy, downscaled so the longer side is at most
    /// `maxDimension` pixels. Keeps OCR fast and its coordinates upright.
    func preparedForOCR(maxDimension: CGFloat = 2400) -> UIImage {
        let pixelWidth = size.width * scale
        let pixelHeight = size.height * scale
        let largest = max(pixelWidth, pixelHeight)
        let factor = largest > maxDimension ? maxDimension / largest : 1
        let target = CGSize(width: (pixelWidth * factor).rounded(), height: (pixelHeight * factor).rounded())

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
