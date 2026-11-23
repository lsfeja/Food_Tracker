import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

let lockCount = 0;
let savedScrollY = 0;

/**
 * Freezes the page behind overlays. iOS/iPadOS ignore `overflow: hidden` on the body and
 * scroll the whole page when the keyboard opens for an input inside a fixed overlay,
 * which drags the overlay away. Pinning the body with `position: fixed` prevents that.
 */
export function useScrollLock() {
  useEffect(() => {
    lockCount += 1;
    if (lockCount === 1) {
      savedScrollY = window.scrollY;
      const body = document.body;
      body.classList.add("scroll-locked");
      body.style.top = `-${savedScrollY}px`;
    }
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        const body = document.body;
        body.classList.remove("scroll-locked");
        body.style.top = "";
        window.scrollTo(0, savedScrollY);
      }
    };
  }, []);
}

/**
 * Keeps overlays inside the area that is actually visible: above the on-screen keyboard
 * and at the visual viewport's offset (CSS variables --vv-height / --vv-top).
 */
let viewportListeners = 0;

function updateViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  if (!vv) return;
  root.setProperty("--vv-height", `${vv.height}px`);
  root.setProperty("--vv-top", `${vv.offsetTop}px`);
}

export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    viewportListeners += 1;
    updateViewport();
    vv.addEventListener("resize", updateViewport);
    vv.addEventListener("scroll", updateViewport);
    return () => {
      vv.removeEventListener("resize", updateViewport);
      vv.removeEventListener("scroll", updateViewport);
      viewportListeners -= 1;
      if (viewportListeners === 0) {
        document.documentElement.style.removeProperty("--vv-height");
        document.documentElement.style.removeProperty("--vv-top");
      }
    };
  }, []);
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
}

/** Modal card sliding up from the bottom (iOS sheet). Put a NavBar (inSheet) and SheetScroll inside. */
export function Sheet({ onClose, children, full, label }: { onClose: () => void; children: ReactNode; full?: boolean; label?: string }) {
  useScrollLock();
  useVisualViewport();
  useEscape(onClose);
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${full ? "full" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </>,
    document.body,
  );
}

export function SheetScroll({ children }: { children: ReactNode }) {
  return <div className="sheet-scroll">{children}</div>;
}

export function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="sheet-footer">{children}</div>;
}

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}

/** Bottom action sheet / confirmation dialog. */
export function ActionSheet({ title, actions, onClose }: { title?: string; actions: SheetAction[]; onClose: () => void }) {
  useScrollLock();
  useVisualViewport();
  useEscape(onClose);
  return createPortal(
    <>
      <div className="sheet-backdrop dialog-backdrop" onClick={onClose} />
      <div className="action-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="action-sheet-group">
          {title && <div className="action-sheet-title">{title}</div>}
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.destructive ? "destructive" : ""}
              onClick={() => {
                onClose();
                action.onSelect();
              }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
        <button type="button" className="cancel" onClick={onClose} autoFocus>
          Cancel
        </button>
      </div>
    </>,
    document.body,
  );
}
