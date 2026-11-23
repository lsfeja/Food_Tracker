import { Barcode, Bike, Dumbbell, Flame, Footprints, Mountain, ScanText, Sparkles, Waves } from "lucide-react";
import type { ActivityDTO, EntryDTO } from "../../shared/api";
import type { CalorieBudget, WeeklyBalance } from "../../shared/budget";
import type { EntrySource } from "../../shared/food";
import * as Format from "../../shared/format";
import { ProgressBar } from "../components/ui";
import { KcalText } from "../components/ui";
import { formatTime } from "../lib/dates";

/** Large ring: eaten vs. budget with the remaining calories in the center. */
export function CalorieRing({ budget, size = 210, lineWidth = 18 }: { budget: CalorieBudget; size?: number; lineWidth?: number }) {
  const radius = (size - lineWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Number.isFinite(budget.progress) ? Math.min(Math.max(budget.progress, 0), 1) : 0;
  const color = budget.isOver ? "var(--orange)" : "var(--accent)";
  return (
    <div
      style={{ position: "relative", width: size, height: size }}
      role="img"
      aria-label={budget.isOver ? `${Format.kcal(-budget.remaining)} kilocalories over budget` : `${Format.kcal(budget.remaining)} kilocalories left`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fill-2)" strokeWidth={lineWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.2s" }}
          opacity={progress > 0 ? 1 : 0}
        />
      </svg>
      <div style={{ position: "absolute", inset: lineWidth * 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="rounded-font tabular" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1.1 }}>
          {Format.kcal(Math.abs(budget.remaining))}
        </div>
        <div className="subheadline" style={{ color: budget.isOver ? "var(--orange)" : "var(--label-2)" }}>
          {budget.isOver ? "kcal over" : "kcal left"}
        </div>
      </div>
    </div>
  );
}

/** Progress of one macronutrient against its target. Fat is rendered smaller. */
export function MacroBar({ title, value, target, secondary }: { title: string; value: number; target: number; secondary?: boolean }) {
  return (
    <div className="stack" style={{ gap: secondary ? 4 : 6 }} aria-label={`${title}: ${Format.grams(value)} of ${Format.grams(target)} grams`}>
      <div className="row" style={{ alignItems: "baseline" }}>
        <span className={`${secondary ? "footnote" : "subheadline"} secondary grow`}>{title}</span>
        <span className="tabular">
          <span className={secondary ? "footnote semibold" : "semibold"}>{Format.grams(value)}</span>
          <span className={`${secondary ? "footnote" : "subheadline"} secondary`}> / {Format.grams(target)} g</span>
        </span>
      </div>
      <ProgressBar progress={target > 0 ? value / target : 0} height={secondary ? 5 : 9} over={false} />
    </div>
  );
}

export function WeeklyBalanceView({ balance }: { balance: WeeklyBalance }) {
  const over = balance.remaining < 0;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <span className="subheadline secondary grow">This week</span>
        <span className="footnote secondary">{balance.daysRemaining === 1 ? "last day" : `${balance.daysRemaining} days left`}</span>
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: 4 }}>
        <span className="title2 tabular">{Format.kcal(Math.abs(balance.remaining))}</span>
        <span className="subheadline" style={{ color: over ? "var(--orange)" : "var(--label-2)" }}>
          {over ? "kcal over" : "kcal left"}
        </span>
        <span className="spacer" />
        <span className="footnote secondary tabular">of {Format.kcal(balance.total)}</span>
      </div>
      <ProgressBar progress={balance.total > 0 ? balance.eaten / balance.total : 0} height={6} over={over} />
    </div>
  );
}

const sourceIcon: Partial<Record<EntrySource, { icon: typeof Barcode; label: string }>> = {
  barcode: { icon: Barcode, label: "Barcode" },
  label: { icon: ScanText, label: "Label photo" },
  ai: { icon: Sparkles, label: "AI estimate" },
};

export function EntryRowContent({ entry }: { entry: EntryDTO }) {
  const source = sourceIcon[entry.source];
  const time = formatTime(entry.loggedAt);
  return (
    <>
      <div className="grow stack" style={{ gap: 3 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="truncate">{entry.name}</span>
          {source && <source.icon size={14} className="secondary" aria-label={source.label} style={{ flex: "none" }} />}
        </div>
        <span className="footnote secondary tabular truncate">{entry.grams ? `${Format.grams(entry.grams)} g · ${time}` : time}</span>
      </div>
      <div className="stack" style={{ gap: 3, alignItems: "flex-end", flex: "none" }}>
        <KcalText value={entry.kcal} approximate={entry.isEstimated} />
        <span className="caption secondary tabular">
          P {Format.grams(entry.protein)} · C {Format.grams(entry.carbs)} · F {Format.grams(entry.fat)}
        </span>
      </div>
    </>
  );
}

export function activityIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("ride") || t.includes("cycl")) return Bike;
  if (t.includes("run")) return Footprints;
  if (t.includes("swim")) return Waves;
  if (t.includes("walk") || t.includes("hike")) return Mountain;
  if (t.includes("weight") || t.includes("workout") || t.includes("crossfit")) return Dumbbell;
  return Flame;
}

export function ActivityRowContent({ activity }: { activity: ActivityDTO }) {
  const Icon = activityIcon(activity.type);
  return (
    <>
      <span className="row-icon">
        <Icon size={20} />
      </span>
      <div className="grow stack" style={{ gap: 2 }}>
        <span className="truncate">{activity.name}</span>
        <span className="footnote secondary">Strava · {Format.duration(activity.durationS / 60)}</span>
      </div>
      <KcalText value={activity.activeKcal} approximate={activity.kcalEstimated} />
    </>
  );
}
