import type { IScannerControls } from "@zxing/browser";
import type { DecodeHintType as HintType } from "@zxing/library";
import { Barcode, Camera, Keyboard, RotateCw, ScanText, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyDraft, isDraftComplete } from "../../../shared/food";
import { errorMessage } from "../../api/client";
import { draftToFoodInput, offApi, useSaveFood } from "../../api/nutrition";
import { BarButton, NavBar } from "../../components/NavBar";
import { PromptDialog } from "../../components/PromptDialog";
import { Spinner } from "../../components/ui";
import { FlowLeading, useFlow } from "../add/flow";

type Phase =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "lookingUp"; code: string }
  | { kind: "notFound"; code: string }
  | { kind: "failed"; code: string; message: string }
  | { kind: "unavailable"; message: string };

/**
 * Scan a barcode → look it up in your foods, then on Open Food Facts → portion screen.
 * Falls back to a label photo or manual entry if the product is unknown.
 */
export default function BarcodeScreen() {
  const flow = useFlow();
  const save = useSaveFood();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [manual, setManual] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const lookUp = useCallback(
    async (code: string) => {
      setPhase({ kind: "lookingUp", code });
      try {
        const local = await offApi.localByBarcode(code);
        if (local) {
          flow.replaceTop({ kind: "portion", food: local, source: "barcode" });
          return;
        }
        const draft = await offApi.product(code);
        if (!draft) {
          setPhase({ kind: "notFound", code });
        } else if (isDraftComplete(draft)) {
          const food = await save.mutateAsync({ food: draftToFoodInput({ ...draft, barcode: draft.barcode ?? code }) });
          flow.replaceTop({ kind: "portion", food, source: "barcode" });
        } else {
          flow.replaceTop({ kind: "newFood", draft: { ...draft, barcode: draft.barcode ?? code }, source: "barcode" });
        }
      } catch (error) {
        setPhase({ kind: "failed", code, message: `${errorMessage(error)} Try again, or photograph the label instead.` });
      }
    },
    [flow, save],
  );

  // Camera + ZXing decoder; restarted via `attempt`.
  useEffect(() => {
    if (phase.kind !== "starting") return;
    let controls: IScannerControls | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase({ kind: "unavailable", message: "This browser can't access the camera. The app must be opened via HTTPS." });
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map<HintType, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        if (cancelled || !videoRef.current) return;
        setPhase({ kind: "scanning" });
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          videoRef.current,
          (result, _error, scanner) => {
            if (!result || cancelled) return;
            const code = result.getText().replace(/\D/g, "");
            if (!code) return;
            scanner.stop();
            navigator.vibrate?.(15);
            void lookUp(code);
          },
        );
        controlsRef.current = controls;
        if (cancelled) controls.stop();
      } catch (error) {
        const name = (error as { name?: string })?.name;
        setPhase({
          kind: "unavailable",
          message:
            name === "NotAllowedError"
              ? "Allow camera access for this app (Settings › Safari › Camera, or the site settings) to scan barcodes."
              : "The camera is currently unavailable.",
        });
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const restart = () => {
    setPhase({ kind: "starting" });
    setAttempt((n) => n + 1);
  };

  const showCamera = phase.kind === "starting" || phase.kind === "scanning";

  // Release the camera as soon as the preview is gone (e.g. manual barcode entry).
  useEffect(() => {
    if (!showCamera) {
      controlsRef.current?.stop();
      controlsRef.current = null;
    }
  }, [showCamera]);

  return (
    <>
      <NavBar
        inSheet
        title="Scan Barcode"
        leading={<FlowLeading />}
        trailing={
          <BarButton onClick={() => setManual(true)} label="Enter barcode manually">
            <Keyboard size={24} />
          </BarButton>
        }
      />
      {showCamera ? (
        <div className="scanner">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="scanner-frame" />
          <div className="scanner-hint">{phase.kind === "starting" ? "Starting camera…" : "Point the camera at a barcode"}</div>
        </div>
      ) : phase.kind === "lookingUp" ? (
        <div className="centered-panel">
          <div className="message">
            <Spinner />
            <span className="subheadline secondary tabular">Looking up {phase.code}…</span>
          </div>
        </div>
      ) : phase.kind === "unavailable" ? (
        <div className="centered-panel">
          <div className="message">
            <Camera size={44} className="secondary" />
            <span className="title3">Camera unavailable</span>
            <span className="subheadline secondary">{phase.message}</span>
          </div>
          <div className="actions">
            <button type="button" className="button" onClick={() => setManual(true)}>
              Enter Barcode
            </button>
            <button type="button" className="button secondary-button" onClick={restart}>
              <RotateCw size={18} /> Try Camera Again
            </button>
            <button type="button" className="link-button" onClick={() => flow.replaceTop({ kind: "newFood", draft: emptyDraft(), source: "manual" })}>
              Create Food Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="centered-panel">
          <div className="message">
            <Barcode size={44} className="secondary" />
            <span className="title3">{phase.kind === "notFound" ? "Product not found" : "Lookup failed"}</span>
            <span className="subheadline secondary">
              {phase.kind === "notFound"
                ? `${phase.code} isn't in Open Food Facts yet. Photograph the nutrition label or enter the values yourself.`
                : phase.message}
            </span>
          </div>
          <div className="actions">
            {phase.kind === "failed" && (
              <button type="button" className="button secondary-button" onClick={() => void lookUp(phase.code)}>
                <RotateCw size={18} /> Try Again
              </button>
            )}
            <button type="button" className="button" onClick={() => flow.replaceTop({ kind: "label", barcode: phase.code })}>
              <ScanText size={20} /> Photograph Label
            </button>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => flow.replaceTop({ kind: "newFood", draft: emptyDraft({ barcode: phase.code }), source: "barcode" })}
            >
              <SquarePen size={20} /> Enter Manually
            </button>
            <button type="button" className="link-button" onClick={restart}>
              Scan Another Barcode
            </button>
          </div>
        </div>
      )}
      {manual && (
        <PromptDialog
          title="Enter Barcode"
          placeholder="Barcode"
          inputMode="numeric"
          confirmLabel="Look Up"
          onClose={() => setManual(false)}
          onConfirm={(code) => void lookUp(code)}
        />
      )}
    </>
  );
}
