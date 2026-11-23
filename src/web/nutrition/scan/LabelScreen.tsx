import { Camera, Image as ImageIcon, ScanSearch, ScanText } from "lucide-react";
import { useRef, useState } from "react";
import { emptyDraft } from "../../../shared/food";
import { NavBar } from "../../components/NavBar";
import { ProgressBar } from "../../components/ui";
import { readNutritionLabel } from "../../lib/ocr";
import { FlowLeading, useFlow } from "../add/flow";

type Phase = { kind: "ready" } | { kind: "processing"; progress: number } | { kind: "noValues" } | { kind: "failed"; message: string };

/** Photograph a nutrition label → OCR → prefilled food editor for confirmation. */
export default function LabelScreen({ barcode }: { barcode: string | null }) {
  const flow = useFlow();
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const process = async (file: File | undefined) => {
    if (!file) return;
    setPhase({ kind: "processing", progress: 0 });
    try {
      const parsed = await readNutritionLabel(file, (progress) => setPhase({ kind: "processing", progress }));
      if (!parsed.found) {
        setPhase({ kind: "noValues" });
        return;
      }
      flow.replaceTop({
        kind: "newFood",
        draft: emptyDraft({ barcode, kcal: parsed.kcal, protein: parsed.protein, carbs: parsed.carbs, fat: parsed.fat, source: "label" }),
        source: "label",
      });
    } catch (error) {
      setPhase({
        kind: "failed",
        message: navigator.onLine
          ? `The photo couldn't be processed (${error instanceof Error ? error.message : "unknown error"}).`
          : "Text recognition needs a connection the first time (it downloads the OCR engine).",
      });
    }
  };

  return (
    <>
      <NavBar inSheet title="Label Photo" leading={<FlowLeading />} />
      <div className="centered-panel">
        <div className="message">
          {phase.kind === "ready" && (
            <>
              <ScanText size={52} className="accent" />
              <span className="title3">Photograph the nutrition table</span>
              <span className="subheadline secondary">Values per 100 g are read automatically. You can check and correct them before saving.</span>
            </>
          )}
          {phase.kind === "processing" && (
            <div className="stack" style={{ gap: 12, alignItems: "center", width: "70%" }}>
              <span className="secondary">Reading label…</span>
              <ProgressBar progress={phase.progress} height={6} />
            </div>
          )}
          {(phase.kind === "noValues" || phase.kind === "failed") && (
            <>
              <ScanSearch size={44} className="secondary" />
              <span className="title3">{phase.kind === "noValues" ? "No values found" : "Couldn't read the photo"}</span>
              <span className="subheadline secondary">
                {phase.kind === "noValues" ? "Make sure the nutrition table is flat, well lit and fills the photo." : phase.message}
              </span>
            </>
          )}
        </div>
        {phase.kind !== "processing" && (
          <div className="actions">
            <button type="button" className="button" onClick={() => cameraInput.current?.click()}>
              <Camera size={20} /> {phase.kind === "ready" ? "Take Photo" : "Retake Photo"}
            </button>
            <button type="button" className="button secondary-button" onClick={() => libraryInput.current?.click()}>
              <ImageIcon size={20} /> Choose from Library
            </button>
            {phase.kind !== "ready" && (
              <button
                type="button"
                className="link-button"
                onClick={() => flow.replaceTop({ kind: "newFood", draft: emptyDraft({ barcode, source: "label" }), source: "label" })}
              >
                Enter Values Manually
              </button>
            )}
          </div>
        )}
      </div>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void process(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void process(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </>
  );
}
