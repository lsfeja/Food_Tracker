import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import * as Format from "../../../shared/format";
import { parseDecimal } from "../../../shared/format";
import type { Intensity } from "../../../shared/workout";

/** Small numeric input bound to `number | null` (empty = null). */
export function OptionalNumber({
  value,
  onChange,
  placeholder,
  maxFraction = 1,
  narrow,
  label,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  maxFraction?: number;
  narrow?: boolean;
  label?: string;
}) {
  const format = (v: number | null) => (v === null ? "" : Format.editable(v, maxFraction));
  const [text, setText] = useState(() => format(value));
  useEffect(() => {
    setText((current) => (parseDecimal(current) === value ? current : format(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text"
      inputMode={maxFraction === 0 ? "numeric" : "decimal"}
      autoComplete="off"
      className={`mini-input ${narrow ? "narrow" : ""}`}
      value={text}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      onFocus={(event) => event.target.select()}
      onChange={(event) => {
        const next = event.target.value.replace(/[^\d.,]/g, "");
        setText(next);
        const parsed = parseDecimal(next);
        onChange(parsed !== null && parsed >= 0 ? (maxFraction === 0 ? Math.round(parsed) : parsed) : null);
      }}
    />
  );
}

export function Stepper({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (value: number) => void; min: number; max: number; step?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus size={18} />
      </button>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus size={18} />
      </button>
    </div>
  );
}

const intensityOptions: { key: string; label: string; value: Intensity | null }[] = [
  { key: "none", label: "None", value: null },
  ...[1, 2, 3, 4, 5].map((z) => ({ key: `zone-${z}`, label: `Zone ${z}`, value: { kind: "zone" as const, value: z } })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => ({ key: `rpe-${r}`, label: `RPE ${r}`, value: { kind: "rpe" as const, value: r } })),
];

/** Zone 1–5 or RPE 1–10. */
export function IntensitySelect({ value, onChange }: { value: Intensity | null; onChange: (value: Intensity | null) => void }) {
  const key = value ? `${value.kind}-${value.value}` : "none";
  return (
    <select
      className="row-select"
      value={key}
      aria-label="Intensity"
      onChange={(event) => onChange(intensityOptions.find((o) => o.key === event.target.value)?.value ?? null)}
    >
      {intensityOptions.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="list-row compact">
      <textarea
        className="text-input"
        rows={3}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onInput={(event) => {
          const el = event.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
      />
    </div>
  );
}
