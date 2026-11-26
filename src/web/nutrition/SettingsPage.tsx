import * as Format from "../../shared/format";
import { kcalFromMacros } from "../../shared/nutrients";
import { budgetFor } from "../../shared/budget";
import { addDays, weekStart } from "../../shared/days";
import { type DayPlan, inputStart, SPORT_FACTOR_KEYS, type SportFactorKey, sportFactors } from "../../shared/energyBudget";
import { Palmtree, Trash2 } from "lucide-react";
import { useState } from "react";
import { useMe, useSetUntracked, useSettings, useTotals, useUntrackedDays, useUpdateSettings } from "../api/nutrition";
import { SwipeRow } from "../components/SwipeRow";
import { formatDay } from "../lib/dates";
import { useToday } from "../lib/useToday";
import { BackButton, NavBar } from "../components/NavBar";
import { LabeledRow, NumberSetting, Section, Segmented, ToggleRow } from "../components/ui";
import { setThemePreference, useThemePreference } from "../lib/theme";
import { ActivitySettingsSection } from "./ActivitySettingsSection";
import { CalibrationSection } from "../calibration/CalibrationViews";

/** Targets, calorie target settings, activity integration. */
export function SettingsPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const me = useMe();
  const { targets, budget } = settings;
  const plan = useTodayPlan();

  return (
    <div className="page">
      <NavBar title="Settings" large leading={<BackButton label="Today" fallback="/" />} />
      <div className="page-content">
        <Section
          header="Daily Targets"
          footer={`Base = what you need per day incl. everyday movement, without workouts. Workouts come from Strava. Your macro targets add up to ${Format.kcal(kcalFromMacros(targets))} kcal.`}
        >
          <NumberSetting title="Base" unit="kcal" value={targets.kcal} onChange={(kcal) => update({ targets: { kcal } })} />
          <NumberSetting title="Protein" unit="g" value={targets.protein} onChange={(protein) => update({ targets: { protein } })} />
          <NumberSetting title="Carbohydrates" unit="g" value={targets.carbs} onChange={(carbs) => update({ targets: { carbs } })} />
          <NumberSetting title="Fat" unit="g" value={targets.fat} onChange={(fat) => update({ targets: { fat } })} />
        </Section>

        <GoalSection plan={plan} />

        <CalorieTargetSection plan={plan} />

        <SportFactorsSection />

        <CalibrationSection />

        <VacationSection />

        <ActivitySettingsSection />

        <Section
          header="Active Calories"
          footer="Workout calories are cleaned (your resting burn during the workout is already in the base, the sport factor corrects Strava's estimate) and smoothed: today's workout counts from tomorrow."
        >
          <ToggleRow
            label="Add workouts to the target"
            checked={budget.activeCaloriesEnabled}
            onChange={(activeCaloriesEnabled) => update({ budget: { activeCaloriesEnabled } })}
          />
        </Section>

        <AppearanceSection />

        <Section footer="Your data is stored in your own Cloudflare D1 database. Access is protected by Cloudflare Access.">
          <LabeledRow label="Account" value={me.data?.email ?? "–"} />
          <LabeledRow label="Version" value={__APP_VERSION__} />
        </Section>
      </div>
    </div>
  );
}

/** Today's target and its parts, for the previews. */
function useTodayPlan(): DayPlan | null {
  const settings = useSettings();
  const today = useToday();
  const totals = useTotals(inputStart(today), addDays(weekStart(today), 7));
  return totals.data ? budgetFor(today, settings, totals.data, today).plan : null;
}

const goalLabel = (goal: number) => (goal < 0 ? "Lose fat" : goal > 0 ? "Build mass" : "Maintain");
const signed = (value: number) => (value > 0 ? `+${Format.kcal(value)}` : value < 0 ? `−${Format.kcal(-value)}` : "±0");
const GOAL_MIN = -1000;
const GOAL_MAX = 750;

/** Deficit/surplus slider: the same amount every day. */
function GoalSection({ plan }: { plan: DayPlan | null }) {
  const settings = useSettings();
  const update = useUpdateSettings();
  const goal = Math.min(Math.max(settings.budget.goalKcal, GOAL_MIN), GOAL_MAX);
  return (
    <Section header="Goal" footer="Deficit to lose fat, surplus to build mass. It applies to every day from today on; past days keep theirs.">
      <div className="list-row stack" style={{ alignItems: "stretch", gap: 8 }}>
        <div className="row">
          <span className="grow">{goalLabel(goal)}</span>
          <span className="semibold tabular">{signed(goal)} kcal/day</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="caption tabular" style={{ whiteSpace: "nowrap" }}>
            {signed(GOAL_MIN)}
          </span>
          <input
            type="range"
            min={GOAL_MIN}
            max={GOAL_MAX}
            step={25}
            value={goal}
            aria-label="Daily deficit or surplus"
            onChange={(event) => update({ budget: { goalKcal: Number(event.target.value) } })}
          />
          <span className="caption tabular" style={{ whiteSpace: "nowrap" }}>
            {signed(GOAL_MAX)}
          </span>
        </div>
        {plan && (
          <span className="footnote secondary tabular">
            Today {Format.kcal(plan.targetBase)} kcal = base {Format.kcal(plan.baseline)} + training {Format.kcal(plan.smoothedActive)} {signed(-plan.deficit)}
            {Math.round(plan.carry) !== 0 && `, plus balance ${signed(plan.carry)}`}
          </span>
        )}
      </div>
    </Section>
  );
}

/** Smoothing of workouts and the weekly balance. */
function CalorieTargetSection({ plan }: { plan: DayPlan | null }) {
  const settings = useSettings();
  const update = useUpdateSettings();
  const { budget } = settings;
  return (
    <Section
      header="Calorie Target"
      footer="Target = base + training (smoothed) − deficit + balance. Workouts count from the next day, smoothed over a few days (smoothing = weight of yesterday; 0.2 ≈ 3 days half-life). Weekly balance: food below or above your plan on the days before is spread over the rest of the week (Mon–Sun), up to the limit per day. Days without entries and vacation days don't count; nothing carries over into the next week."
    >
      <LabeledRow label="Training today (smoothed)" value={plan ? `${Format.kcal(plan.smoothedActive)} kcal` : "–"} />
      <LabeledRow label="Target today" value={plan ? `${Format.kcal(plan.target)} kcal` : "–"} />
      <NumberSetting title="Smoothing" value={budget.alpha} maxFraction={2} onChange={(alpha) => update({ budget: { alpha: Math.min(Math.max(alpha, 0.05), 0.9) } })} />
      <ToggleRow label="Weekly balance" checked={budget.carryEnabled} onChange={(carryEnabled) => update({ budget: { carryEnabled } })} />
      {budget.carryEnabled && (
        <NumberSetting title="Balance limit per day" unit="kcal" value={budget.carryCapKcal} onChange={(carryCapKcal) => update({ budget: { carryCapKcal: Math.min(carryCapKcal, 1500) } })} />
      )}
    </Section>
  );
}

const factorLabels: Record<SportFactorKey, string> = {
  virtualRide: "Virtual ride",
  ridePower: "Ride with power meter",
  ride: "Ride without power meter",
  run: "Run",
  trailRun: "Trail run",
  weightTraining: "Weight training",
  other: "Other sports",
};

/** Share of a workout's calories that counts, per sport. */
function SportFactorsSection() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const overrides = settings.budget.sportFactors;
  const factors = sportFactors(overrides);
  return (
    <Section
      header="Sport Factors"
      footer="Share of a workout's calories that counts, after subtracting your resting burn during it. Power-based rides are exact; Strava's estimates are rougher without power data and for strength training."
    >
      {SPORT_FACTOR_KEYS.map((key) => (
        <NumberSetting
          key={key}
          title={factorLabels[key]}
          value={factors[key]}
          maxFraction={2}
          onChange={(value) => update({ budget: { sportFactors: { ...overrides, [key]: Math.min(value, 2) } } })}
        />
      ))}
    </Section>
  );
}

/** Vacation days: not tracked (no budget, no balance, not in the average). */
function VacationSection() {
  const days = useUntrackedDays();
  const setUntracked = useSetUntracked();
  const today = useToday();
  const [adding, setAdding] = useState("");
  const list = days.data ?? [];
  const upcoming = list.filter((d) => d >= today);
  const recent = list.filter((d) => d < today && d >= addDays(today, -30)).reverse();
  const row = (day: string) => (
    <SwipeRow key={day} fullSwipe actions={[{ label: "Remove", icon: <Trash2 size={18} />, color: "red", onSelect: () => setUntracked.mutate({ day, untracked: false }) }]}>
      <div className="list-row">
        <Palmtree size={18} className="accent" />
        <span className="grow">{formatDay(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        {day === today && <span className="footnote secondary">today</span>}
      </div>
    </SwipeRow>
  );
  return (
    <Section
      header="Vacation Days"
      footer="Days marked here (or with the switch on a day) aren't tracked: no target, not in the weekly balance or the calibration. Their workouts still count (training load and stats). Swipe to remove."
    >
      {upcoming.map(row)}
      {recent.map(row)}
      <label className="list-row field-row compact">
        <span className="field-label action" style={{ color: "var(--accent)" }}>
          Add day
        </span>
        <input
          type="date"
          value={adding}
          aria-label="Add vacation day"
          onChange={(event) => {
            const value = event.target.value;
            setAdding(value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              setUntracked.mutate({ day: value, untracked: true });
              setAdding("");
            }
          }}
        />
      </label>
    </Section>
  );
}

/** Light/dark: follow the system or choose one (per device). */
function AppearanceSection() {
  const preference = useThemePreference();
  return (
    <Section header="Appearance" footer="System follows the light/dark setting of this device. The choice is saved on this device.">
      <div className="list-row compact">
        <Segmented
          className="grow"
          value={preference}
          onChange={setThemePreference}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
    </Section>
  );
}
