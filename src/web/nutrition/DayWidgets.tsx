import { Barcode, Bike, Dumbbell, Flame, Footprints, Mountain, ScanText, Sparkles, Waves } from "lucide-react";
import type { ActivityDTO, EntryDTO } from "../../shared/api";
import type { CalorieBudget } from "../../shared/budget";
import { addDays, type Day } from "../../shared/days";
import type { DayPlan, WeekSummary } from "../../shared/energyBudget";
import type { EntrySource } from "../../shared/food";
import * as Format from "../../shared/format";
import { KcalText, ProgressBar } from "../components/ui";
import { formatTime, weekdayShort } from "../lib/dates";

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

/** Weekly budget: what's left this week, the plan and how far activity filled it up. */
/** The week: plan (target without balance) vs. eaten per day, the sums and the balance. */
export function WeekView({ plans, week, day, today }: { plans: DayPlan[]; week: WeekSummary; day: Day; today: Day }) {
  const current = plans.find((p) => p.day === day);
  const finished = (p: DayPlan) => !p.untracked && p.logged && p.day < today;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <span className="subheadline secondary">{day >= week.start && today <= addDays(week.start, 6) ? "This week" : "Week"}</span>
      <div className="week-row caption secondary">
        <span />
        <span className="num">Plan</span>
        <span className="num">Eaten</span>
        <span className="num">±</span>
      </div>
      <div className="stack" style={{ gap: 5 }}>
        {plans.map((p) => (
          <div key={p.day} className={`week-row footnote ${p.day === day ? "semibold" : ""} ${p.projected ? "tertiary" : ""}`}>
            <span>{weekdayShort(p.day)}</span>
            {p.untracked ? (
              <span className="secondary" style={{ gridColumn: "2 / 5", textAlign: "right" }}>
                Vacation
              </span>
            ) : (
              <>
                <span className="num">{`${p.projected ? "~" : ""}${Format.kcal(p.targetBase)}`}</span>
                <span className="num">{p.logged ? Format.kcal(p.eaten) : "–"}</span>
                <span className="num" style={{ color: finished(p) && p.eaten > p.target ? "var(--orange)" : undefined }}>
                  {finished(p) ? Format.signedKcal(p.eaten - p.targetBase) : ""}
                </span>
              </>
            )}
          </div>
        ))}
        <div className="week-row footnote semibold week-total">
          <span>Week</span>
          <span className="num">{Format.kcal(week.targetBase)}</span>
          <span className="num">{Format.kcal(week.eaten)}</span>
          <span className="num">{Math.abs(week.balance) >= 1 ? Format.signedKcal(-week.balance) : ""}</span>
        </div>
      </div>
      <span className="caption secondary">Plan = target without the weekly balance · ± = eaten − plan</span>
      {current && Math.round(current.carry) !== 0 && (
        <span className="footnote" style={{ color: current.carry > 0 ? "var(--accent)" : "var(--orange)" }}>
          {current.carry > 0
            ? `${Format.signedKcal(current.carry)} kcal from uneaten calories earlier this week`
            : `${Format.signedKcal(current.carry)} kcal for food above plan earlier this week`}
        </span>
      )}
      {current?.capped && (
        <span className="caption secondary">
          Balance limited to ±{Format.kcal(Math.abs(current.carry))} kcal per day (open: {Format.signedKcal(current.carryRaw)} kcal/day).
        </span>
      )}
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
