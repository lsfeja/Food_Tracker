import { ChevronLeft } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * iOS-style navigation bar. With `large`, the big title scrolls with the page and the
 * small title fades in once it is gone. Inside sheets use `inSheet` (no sticky/scroll).
 */
export function NavBar({
  title,
  large,
  leading,
  trailing,
  inSheet,
  flat,
  bottom,
}: {
  title: ReactNode;
  large?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  inSheet?: boolean;
  flat?: boolean;
  /** Extra content pinned under the bar (e.g. the Plan week strip). */
  bottom?: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (inSheet) return;
    const threshold = large ? 40 : 2;
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [large, inSheet]);

  const classes = ["navbar", large && !inSheet ? "large" : "inline", scrolled ? "scrolled" : "", flat ? "flat" : ""].join(" ");
  return (
    <>
      <header className={classes}>
        <div className="navbar-bar">
          <div className="navbar-leading">{leading}</div>
          <div className="navbar-title">{title}</div>
          <div className="navbar-trailing">{trailing}</div>
        </div>
        {bottom}
      </header>
      {large && !inSheet && <h1 className="large-title">{title}</h1>}
    </>
  );
}

export function BarButton({
  children,
  onClick,
  prominent,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  prominent?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button type="button" className={`bar-button ${prominent ? "prominent" : ""}`} onClick={onClick} disabled={disabled} aria-label={label}>
      {children}
    </button>
  );
}

/** "‹ Back": goes back in history, or to `fallback` when the page was opened directly. */
export function BackButton({ label = "Back", fallback, onClick }: { label?: string; fallback?: string; onClick?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button
      type="button"
      className="bar-button back"
      onClick={() => {
        if (onClick) onClick();
        else if (location.key !== "default" && window.history.length > 1) navigate(-1);
        else navigate(fallback ?? "/", { replace: true });
      }}
    >
      <ChevronLeft size={28} strokeWidth={2.2} style={{ marginRight: -2 }} />
      <span className="truncate">{label}</span>
    </button>
  );
}
