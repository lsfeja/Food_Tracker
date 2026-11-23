import { type ReactNode, useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";

const TRIGGER = 64;

/** Pull down at the top of the page to refresh (standalone PWAs have no browser reload). */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef({ startY: null as number | null, pull: 0, refreshing: false });
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    const s = state.current;
    const locked = () => document.body.classList.contains("scroll-locked");
    const onStart = (event: TouchEvent) => {
      s.startY = window.scrollY <= 0 && !s.refreshing && !locked() ? event.touches[0].clientY : null;
    };
    const onMove = (event: TouchEvent) => {
      if (s.startY === null) return;
      const dy = event.touches[0].clientY - s.startY;
      s.pull = dy > 0 && window.scrollY <= 0 ? Math.min(dy * 0.5, 96) : 0;
      setPull(s.pull);
    };
    const onEnd = async () => {
      if (s.startY === null) return;
      s.startY = null;
      if (s.pull >= TRIGGER) {
        s.refreshing = true;
        setRefreshing(true);
        setPull(44);
        try {
          await refresh.current();
        } finally {
          s.refreshing = false;
          s.pull = 0;
          setRefreshing(false);
          setPull(0);
        }
      } else {
        s.pull = 0;
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <>
      <div className="ptr" style={{ height: pull, alignItems: "center", opacity: refreshing ? 1 : Math.min(pull / TRIGGER, 1) }}>
        {(pull > 8 || refreshing) && <Spinner />}
      </div>
      {children}
    </>
  );
}
