import { foundAny, parseLabel, type ParsedNutrition, type TextFragment } from "../../shared/labelParser";

/** Scales the photo down (OCR speed) and applies EXIF orientation via <img>. */
async function prepareImage(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    // Phone photos are scaled down for speed; small images are enlarged (Tesseract
    // reads digits more reliably with larger glyphs).
    const longSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longSide > 2200 ? 2200 / longSide : longSide < 1600 ? 1600 / longSide : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");
    context.filter = "grayscale(1) contrast(1.15)";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Reads a nutrition table with Tesseract.js (German + English). The OCR engine and
 * language data are downloaded on first use and cached by the browser.
 */
export async function readNutritionLabel(file: Blob, onProgress?: (fraction: number) => void): Promise<ParsedNutrition & { found: boolean }> {
  const [{ createWorker, PSM }, canvas] = await Promise.all([import("tesseract.js"), prepareImage(file)]);
  const worker = await createWorker(["deu", "eng"], 1, {
    // Self-hosted (scripts/copy-ocr-assets.mjs) instead of the default CDN.
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === "recognizing text") onProgress?.(message.progress);
    },
  });
  try {
    // Sparse text: nutrition tables are columns of short words and numbers.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    const fragments: TextFragment[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            const text = word.text.trim();
            if (!text || word.confidence < 20) continue;
            const { x0, y0, x1, y1 } = word.bbox;
            fragments.push({ text, x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
          }
        }
      }
    }
    const parsed = parseLabel(fragments);
    return { ...parsed, found: foundAny(parsed) };
  } finally {
    void worker.terminate();
  }
}
