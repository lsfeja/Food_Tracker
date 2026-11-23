import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

let lockCount = 0;

function useScrollLock() {
  useEffect(() => {
    lockCount += 1;
    document.body.classList.add("scroll-locked");
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.classList.remove("scroll-locked");
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
