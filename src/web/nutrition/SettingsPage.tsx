import * as Format from "../../shared/format";
import { kcalFromMacros } from "../../shared/nutrients";
import { budgetFor } from "../../shared/budget";
import { addDays, weekStart } from "../../shared/days";
import { inputStart, type WeekSummary } from "../../shared/weeklyBudget";
import { useMe, useSettings, useTotals, useUpdateSettings } from "../api/nutrition";
import { useToday } from "../lib/useToday";
import { BackButton, NavBar } from "../components/NavBar";
import { LabeledRow, NumberSetting, Section, ToggleRow } from "../components/ui";
import { ActivitySettingsSection } from "./ActivitySettingsSection";

/** Targets, weekly budget mode, activity integration. */
export function SettingsPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const me = useMe();
  const { targets, budget } = settings;
  const week = useCurrentWeekBudget();

  return (
    <div className="page">
      <NavBar title="Settings" large leading={<BackButton label="Today" fallback="/" />} />
      <div className="page-content">
        <Section
          header="Daily Targets"
          footer={`Base = what you need per day at rest plus everyday movement, without workouts. Workouts come from Strava. Your macro targets add up to ${Format.kcal(kcalFromMacros(targets))} kcal.`}
        >
          <NumberSetting title="Base" unit="kcal" value={targets.kcal} onChange={(kcal) => update({ targets: { kcal } })} />
          <NumberSetting title="Protein" unit="g" value={targets.protein} onChange={(protein) => update({ targets: { protein } })} />
          <NumberSetting title="Carbohydrates" unit="g" value={targets.carbs} onChange={(carbs) => update({ targets: { carbs } })} />
          <NumberSetting title="Fat" unit="g" value={targets.fat} onChange={(fat) => update({ targets: { fat } })} />
        </Section>

        <GoalSection week={week} />

        <WeeklyBudgetSection week={week} />

        <ActivitySettingsSection />

        <Section
          header="Active Calories"
          footer="Activity trackers often overestimate calories burned. Counting only part of them keeps your budget on the safe side."
        >
          <ToggleRow
            label="Add active calories to budget"
            checked={budget.activeCaloriesEnabled}
            onChange={(activeCaloriesEnabled) => update({ budget: { activeCaloriesEnabled } })}
          />
          {budget.activeCaloriesEnabled && (
            <div className="list-row stack" style={{ alignItems: "stretch", gap: 8 }}>
              <div className="row">
                <span className="grow">Count</span>
                <span className="secondary tabular">{Math.round(budget.activeCaloriesPercent)} %</span>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className="caption" style={{ whiteSpace: "nowrap" }}>50 %</span>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={budget.activeCaloriesPercent}
                  aria-label="Share of active calories"
                  onChange={(event) => update({ budget: { activeCaloriesPercent: Number(event.target.value) } })}
                />
                <span className="caption" style={{ whiteSpace: "nowrap" }}>100 %</span>
              </div>
            </div>
          )}
        </Section>

        <Section footer="Your data is stored in your own Cloudflare D1 database. Access is protected by Cloudflare Access.">
          <LabeledRow label="Account" value={me.data?.email ?? "–"} />
          <LabeledRow label="Version" value={__APP_VERSION__} />
        </Section>
      </div>
    </div>
  );
}

/** This week's budget (plan, limits) for the settings preview. */
function useCurrentWeekBudget(): WeekSummary | null {
  const settings = useSettings();
  const today = useToday();
  const totals = useTotals(inputStart(today), addDays(weekStart(today), 7));
  return totals.data ? budgetFor(today, settings, totals.data, today).week : null;
}

const goalLabel = (goal: number) => (goal < 0 ? "Lose fat" : goal > 0 ? "Build mass" : "Maintain");
const signed = (value: number) => (value > 0 ? `+${Format.kcal(value)}` : value < 0 ? `−${Format.kcal(-value)}` : "±0");

/** Deficit/surplus slider, limited by the lowest allowed day. */
function GoalSection({ week }: { week: WeekSummary | null }) {
  const settings = useSettings();
  const update = useUpdateSettings();
  const goal = settings.budget.goalKcal;
  const p = week?.params;
  const min = p ? Math.ceil(p.goalRange.min / 25) * 25 : -700;
  const max = p ? p.goalRange.max : 750;
  const value = Math.min(Math.max(goal, min), max);
  // What the budget actually uses (the floor may allow a few kcal more than the slider step).
  const effective = p ? Math.round(p.goal) : value;
  return (
    <Section
      header="Goal"
      footer={
        p && goal < min
          ? `Limited to ${signed(effective)} kcal/day: no day may drop below ${Format.kcal(p.floor)} kcal (base + 25 % of your active average, at most ${Format.kcal(settings.budget.maxDailyDeficit)} below base + average).`
          : "Deficit to lose fat, surplus to build mass. The deficit is limited so that no day drops below the lowest day of your weekly budget."
      }
    >
      <div className="list-row stack" style={{ alignItems: "stretch", gap: 8 }}>
        <div className="row">
          <span className="grow">{goalLabel(effective)}</span>
          <span className="semibold tabular">{signed(effective)} kcal/day</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="caption tabular" style={{ whiteSpace: "nowrap" }}>
            {signed(min)}
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={25}
            value={value}
            aria-label="Daily deficit or surplus"
            onChange={(event) => update({ budget: { goalKcal: Number(event.target.value) } })}
          />
          <span className="caption tabular" style={{ whiteSpace: "nowrap" }}>
            {signed(max)}
          </span>
        </div>
        {p && (
          <span className="footnote secondary tabular">
            Daily target {Format.kcal(p.standard)} kcal = base {Format.kcal(settings.targets.kcal)} + Ø active {Format.kcal(p.average)} {signed(p.goal)}
          </span>
        )}
      </div>
    </Section>
  );
}

/** Weekly budget: current plan (from the 4-week average) and its limits. */
function WeeklyBudgetSection({ week }: { week: WeekSummary | null }) {
  const settings = useSettings();
  const update = useUpdateSettings();
  const p = week?.params;
  const { budget } = settings;
  return (
    <Section
      header="Weekly Budget"
      footer="Your week is planned with base + your average active calories of the last 4 weeks. Rest days (from the Plan tab) get at least base + the rest-day minimum in % of that average. Workouts above the average add to the rest of the week (at least 3 days), days with less activity and food above the target are taken from the following days. Food you don't eat carries over, even into the next week. Cuts that don't fit into the week move to the next week by the share below."
    >
      <LabeledRow label="Ø active (4 weeks)" value={p ? `${Format.kcal(p.average)} kcal/day` : "–"} />
      <LabeledRow label="Daily target" value={p ? `${Format.kcal(p.standard)} kcal` : "–"} />
      <LabeledRow label="Weekly plan" value={week ? `${Format.kcal(week.plan)} kcal` : "–"} />
      <LabeledRow label="Lowest day · rest day" value={p ? `${Format.kcal(p.floor)} · ${Format.kcal(p.restMinimum)} kcal` : "–"} />
      <NumberSetting
        title="Rest-day minimum"
        unit="%"
        value={budget.restDayActivePct}
        onChange={(restDayActivePct) => update({ budget: { restDayActivePct: Math.min(restDayActivePct, 100) } })}
      />
      <NumberSetting title="Max deficit per day" unit="kcal" value={budget.maxDailyDeficit} onChange={(maxDailyDeficit) => update({ budget: { maxDailyDeficit } })} />
      <NumberSetting
        title="Cuts carried to next week"
        unit="%"
        value={budget.carryOverPct}
        onChange={(carryOverPct) => update({ budget: { carryOverPct: Math.min(carryOverPct, 100) } })}
      />
    </Section>
  );
}
