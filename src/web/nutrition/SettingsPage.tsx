import * as Format from "../../shared/format";
import { kcalFromMacros } from "../../shared/nutrients";
import { useMe, useSettings, useUpdateSettings } from "../api/nutrition";
import { BackButton, NavBar } from "../components/NavBar";
import { LabeledRow, NumberSetting, Section, ToggleRow } from "../components/ui";
import { ActivitySettingsSection } from "./ActivitySettingsSection";

/** Targets, weekly budget mode, activity integration. */
export function SettingsPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const me = useMe();
  const { targets, budget } = settings;
  const sevenDays = targets.kcal * 7;

  return (
    <div className="page">
      <NavBar title="Settings" large leading={<BackButton label="Today" fallback="/" />} />
      <div className="page-content">
        <Section header="Daily Targets" footer={`Your macro targets add up to ${Format.kcal(kcalFromMacros(targets))} kcal.`}>
          <NumberSetting title="Calories" unit="kcal" value={targets.kcal} onChange={(kcal) => update({ targets: { kcal } })} />
          <NumberSetting title="Protein" unit="g" value={targets.protein} onChange={(protein) => update({ targets: { protein } })} />
          <NumberSetting title="Carbohydrates" unit="g" value={targets.carbs} onChange={(carbs) => update({ targets: { carbs } })} />
          <NumberSetting title="Fat" unit="g" value={targets.fat} onChange={(fat) => update({ targets: { fat } })} />
        </Section>

        <Section
          header="Weekly Mode"
          footer="Calories you don't eat carry over to the rest of the week (Monday to Sunday), and eating more lowers the following days. The home screen shows your weekly balance."
        >
          <ToggleRow label="Weekly budget" checked={budget.weeklyModeEnabled} onChange={(weeklyModeEnabled) => update({ budget: { weeklyModeEnabled } })} />
          {budget.weeklyModeEnabled && (
            <>
              <NumberSetting
                title="Weekly limit"
                unit="kcal"
                value={budget.weeklyLimitKcal > 0 ? budget.weeklyLimitKcal : sevenDays}
                onChange={(value) => update({ budget: { weeklyLimitKcal: Math.abs(value - sevenDays) < 0.5 ? 0 : value } })}
              />
              {budget.weeklyLimitKcal > 0 && (
                <button type="button" className="list-row action" onClick={() => update({ budget: { weeklyLimitKcal: 0 } })}>
                  Use 7 × daily target ({Format.kcal(sevenDays)} kcal)
                </button>
              )}
            </>
          )}
        </Section>

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
