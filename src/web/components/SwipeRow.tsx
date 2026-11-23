import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export interface SwipeAction {
  label: string;
  icon?: ReactNode;
  color: "red" | "gray" | "accent" | "blue" | "orange";
  onSelect: () => void;
}

const ACTION_WIDTH = 74;
let closeOpenRow: (() => void) | null = null;

/**
 * Row with trailing swipe actions (iOS `swipeActions`). A full swipe triggers the first
 * action when `fullSwipe` is set. Taps pass through to the content.
 */
export function SwipeRow({
  actions,
  children,
  fullSwipe,
  disabled,
}: {
  actions: SwipeAction[];
  children: ReactNode;
  fullSwipe?: boolean;
  /** Ignore gestures (e.g. while the row is being dragged). */
  disabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; base: number; axis: "x" | "y" | null; id: number } | null>(null);
  const suppressClick = useRef(false);
  const openWidth = actions.length * ACTION_WIDTH;

  const settle = useCallback((value: number) => {
    setAnimating(true);
    setOffset(value);
  }, []);

  const close = useCallback(() => settle(0), [settle]);

  useEffect(() => {
    if (offset === 0) return;
    const onOutside = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [offset, close]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, base: offset, axis: null, id: event.pointerId };
    suppressClick.current = false;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    if (disabled) {
      gesture.current = null;
      return;
    }
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (g.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.axis === "x") {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
        closeOpenRow = close;
      }
    }
    if (g.axis !== "x") return;
    suppressClick.current = true;
    setAnimating(false);
    const width = rowRef.current?.offsetWidth ?? 400;
    const next = Math.min(0, Math.max(g.base + dx, fullSwipe ? -width : -openWidth - 40));
    setOffset(next);
  };

  const onPointerEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== "x") return;
    const width = rowRef.current?.offsetWidth ?? 400;
    if (fullSwipe && offset < -Math.max(width * 0.6, openWidth + 60)) {
      settle(-width);
      window.setTimeout(() => {
        actions[0]?.onSelect();
        setAnimating(false);
        setOffset(0);
      }, 200);
    } else if (offset < -openWidth / 2) {
      settle(-openWidth);
    } else {
      settle(0);
    }
  };

  return (
    <div className="swipe-row" ref={rowRef}>
      <div className="swipe-actions" style={{ width: Math.max(-offset, 0) }} aria-hidden={offset === 0}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`swipe-action ${action.color}`}
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => {
              settle(0);
              action.onSelect();
            }}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      <div
        className={`swipe-content ${animating ? "animating" : ""}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onTransitionEnd={() => setAnimating(false)}
        onClickCapture={(event) => {
          if (suppressClick.current || offset !== 0) {
            event.stopPropagation();
            event.preventDefault();
            suppressClick.current = false;
            if (offset !== 0) close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
