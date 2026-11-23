import { useState } from "react";
import { createPortal } from "react-dom";
import { useScrollLock, useVisualViewport } from "./Sheet";

/** iOS-style alert with one text field. */
export function PromptDialog({
  title,
  message,
  placeholder,
  confirmLabel,
  inputMode,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel: string;
  inputMode?: "numeric" | "text";
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  useScrollLock();
  useVisualViewport();
  const submit = () => {
    if (!value.trim()) return;
    onClose();
    onConfirm(value.trim());
  };
  return createPortal(
    <>
      <div className="sheet-backdrop dialog-backdrop" onClick={onClose} />
      <div className="alert" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="alert-body">
          <span className="headline">{title}</span>
          {message && <span className="footnote">{message}</span>}
          <input
            autoFocus
            type="text"
            inputMode={inputMode}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(inputMode === "numeric" ? event.target.value.replace(/\D/g, "") : event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
        </div>
        <div className="alert-buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
