import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { parseDecimal } from "../../shared/format";
import * as Format from "../../shared/format";

export function Section({
  header,
  footer,
  children,
  className,
  plain,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No card background (custom content). */
  plain?: boolean;
}) {
  return (
    <section className={`section ${className ?? ""}`}>
      {header && <div className="section-header">{header}</div>}
      {plain ? children : <div className="card">{children}</div>}
      {footer && <div className="section-footer">{footer}</div>}
    </section>
  );
}

/** A list row; becomes a button when `onClick` is set. */
export function Row({
  children,
  onClick,
  chevron,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      {children}
      {chevron && <ChevronRight className="chevron" size={18} strokeWidth={2.5} />}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`list-row ${className ?? ""}`} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }
  return <div className={`list-row ${className ?? ""}`}>{content}</div>;
}

/** Title + value row ("LabeledContent"). */
export function LabeledRow({ label, value, onClick, chevron }: { label: ReactNode; value?: ReactNode; onClick?: () => void; chevron?: boolean }) {
  return (
    <Row onClick={onClick} chevron={chevron}>
      <span className="row-title">{label}</span>
      {value !== undefined && <span className="row-value tabular">{value}</span>}
    </Row>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} />;
}

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="list-row compact">
      <span className="row-title">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`segmented ${className ?? ""}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? "selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Text input for decimals (accepts "," and "."). */
export function DecimalInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  onEnter,
  ariaLabel,
  inputMode = "decimal",
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onEnter?: () => void;
  ariaLabel?: string;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      enterKeyHint={onEnter ? "done" : undefined}
      className={className}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value.replace(/[^\d.,-]/g, ""))}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onEnter) {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

/** "Protein ….. 12 g" */
export function NumberField({
  title,
  value,
  onChange,
  unit,
  placeholder = "0",
  autoFocus,
}: {
  title: ReactNode;
  value: string;
  onChange: (text: string) => void;
  unit?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="list-row field-row compact">
      <span className="field-label">{title}</span>
      <DecimalInput value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} ariaLabel={typeof title === "string" ? title : undefined} />
      {unit && <span className="unit">{unit}</span>}
    </label>
  );
}

/** Number field bound to a positive number; keeps the user's typing while valid. */
export function NumberSetting({
  title,
  value,
  onChange,
  unit,
  maxFraction = 0,
}: {
  title: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  maxFraction?: number;
}) {
  const [text, setText] = useState(() => Format.editable(value, maxFraction));
  useEffect(() => {
    setText((current) => (parseDecimal(current) === value ? current : Format.editable(value, maxFraction)));
  }, [value, maxFraction]);
  return (
    <NumberField
      title={title}
      value={text}
      unit={unit}
      onChange={(next) => {
        setText(next);
        const parsed = parseDecimal(next);
        if (parsed !== null && parsed > 0 && parsed !== value) onChange(parsed);
      }}
    />
  );
}

export function TextRow({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div className="list-row compact">
      <input
        className="text-input"
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={placeholder}
        enterKeyHint={onEnter ? "next" : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
    </div>
  );
}

export function ProgressBar({ progress, height = 9, over }: { progress: number; height?: number; over?: boolean }) {
  const clamped = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;
  return (
    <div className={`progress ${over ?? progress > 1 ? "over" : ""}`} style={{ height }}>
      <div style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="progressbar" aria-label="Loading" />;
}

export function EmptyState({ icon, title, message }: { icon?: ReactNode; title: string; message?: string }) {
  return (
    <div className="empty-state">
      {icon && <div className="tertiary">{icon}</div>}
      <div className="subheadline secondary">{title}</div>
      {message && <div className="footnote tertiary">{message}</div>}
    </div>
  );
}

/** "540 kcal" with a bold number and a small unit. */
export function KcalText({ value, approximate }: { value: number; approximate?: boolean }) {
  return (
    <span className="tabular" style={{ whiteSpace: "nowrap" }}>
      <span className="semibold">
        {approximate ? "~" : ""}
        {Format.kcal(value)}
      </span>{" "}
      <span className="footnote secondary">kcal</span>
    </span>
  );
}
