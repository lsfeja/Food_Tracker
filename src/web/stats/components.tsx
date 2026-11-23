import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Rounded card used throughout the Stats tab. */
export function StatsCard({ title, icon: Icon, trailing, children }: { title: string; icon?: LucideIcon; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section className="stats-card">
      <div className="stats-card-header">
        {Icon && <Icon size={18} />}
        <span className="headline grow">{title}</span>
        {trailing && <span className="footnote secondary">{trailing}</span>}
      </div>
      {children}
    </section>
  );
}

/** Big number with a caption, for metric grids. */
export function MetricTile({ title, value, unit, detail }: { title: string; value: string; unit?: string; detail?: string }) {
  return (
    <div className="metric-tile">
      <span className="caption secondary">{title}</span>
      <span>
        <span className="value">{value}</span>
        {unit && <span className="footnote secondary"> {unit}</span>}
      </span>
      {detail && <span className="caption secondary truncate">{detail}</span>}
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="metric-grid">{children}</div>;
}

export function ChipPicker<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="chips compact" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`chip ${option.value === value ? "selected" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function EmptyStatsCard({ title, message, icon }: { title: string; message: string; icon?: LucideIcon }) {
  return (
    <StatsCard title={title} icon={icon}>
      <span className="subheadline secondary">{message}</span>
    </StatsCard>
  );
}

/** Series colors per sport: green/blue family (like the iOS app). */
export function sportPalette(dark: boolean): string[] {
  return dark
    ? ["#30d158", "#63e6e2", "#40c8e0", "#64d2ff", "#5e5ce6", "#98989d", "#ac8e68", "#bf5af2", "#ff375f"]
    : ["#28ad5a", "#00c7be", "#30b0c7", "#32ade6", "#5856d6", "#8e8e93", "#a2845e", "#af52de", "#ff2d55"];
}
