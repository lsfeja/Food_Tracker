import { useRef } from "react";

/**
 * Long press (≈ 0.45 s without moving) for touch and mouse. Spread `handlers` on the element
 * and call `consumed()` in its click handler to skip the click that follows a long press.
 */
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  return {
    handlers: {
      onPointerDown: (event: React.PointerEvent) => {
        fired.current = false;
        start.current = { x: event.clientX, y: event.clientY };
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onLongPress();
        }, ms);
      },
      onPointerMove: (event: React.PointerEvent) => {
        if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    },
    consumed: () => {
      const value = fired.current;
      fired.current = false;
      return value;
    },
  };
}
