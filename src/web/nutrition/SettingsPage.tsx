import * as Format from "../../shared/format";
import { kcalFromMacros } from "../../shared/nutrients";
import { budgetFor } from "../../shared/budget";
import { addDays, weekStart } from "../../shared/days";
import { inputStart } from "../../shared/weeklyBudget";
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

        <WeeklyBudgetSection />

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

/** Weekly budget: current plan (from the 4-week average) and its limits. */
function WeeklyBudgetSection() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const today = useToday();
  const totals = useTotals(inputStart(today), addDays(weekStart(today), 7));
  const week = totals.data ? budgetFor(today, settings, totals.data, today).week : null;
  const p = week?.params;
  const { budget } = settings;
  return (
    <Section
      header="Weekly Budget"
      footer="Your week is planned with base + your average active calories of the last 4 weeks. Workouts above the average add to the rest of the week (at least 3 days), days with less activity and food above the target are taken from the following days. Food you don't eat carries over, even into the next week. Cuts that don't fit into the week move to the next week by the share below."
    >
      <LabeledRow label="Ø active (4 weeks)" value={p ? `${Format.kcal(p.average)} kcal/day` : "–"} />
      <LabeledRow label="Daily target" value={p ? `${Format.kcal(p.standard)} kcal` : "–"} />
      <LabeledRow label="Weekly plan" value={week ? `${Format.kcal(week.plan)} kcal` : "–"} />
      <LabeledRow label="Lowest day · rest day" value={p ? `${Format.kcal(p.floor)} · ${Format.kcal(p.restMinimum)} kcal` : "–"} />
      <NumberSetting
        title="Rest-day minimum (% of Ø active)"
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
