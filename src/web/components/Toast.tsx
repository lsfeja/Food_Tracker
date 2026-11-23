import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
}

const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, action?: ToastAction) => {
    counter.current += 1;
    setToast({ id: counter.current, message, action });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), toast.action ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.id} onClick={() => setToast(null)}>
          <span className="grow">{toast.message}</span>
          {toast.action && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** Shows a short message at the bottom (errors, undo). */
export const useToast = () => useContext(ToastContext);
