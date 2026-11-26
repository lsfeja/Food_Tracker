import { Scale } from "lucide-react";
import { calibrationDetails, describeCalibration } from "../../shared/calibration";
import * as Format from "../../shared/format";
import { useDecideCalibration } from "../api/calibration";
import { useSettings, useUpdateSettings } from "../api/nutrition";
import { LabeledRow, NumberSetting, Section } from "../components/ui";
import { formatDay } from "../lib/dates";
import { type CalibrationState, useCalibration } from "./useCalibration";

const date = (day: string) => formatDay(day, { day: "numeric", month: "short" });

/** Proposal card (Today): shown when a calibration is due and possible. */
export function CalibrationCard() {
  const state = useCalibration();
  const decide = useDecideCalibration();
  const { check } = state;
  if (!state.due || !check || check.reasons.length > 0) return null;
  const { adjustment } = check;
  const submit = (decision: "accepted" | "declined") =>
    decide.mutate({ day: state.today, decision, adjustment, reason: describeCalibration(check), details: calibrationDetails(check) });
  return (
    <Section header="Calibration">
      <div className="stack" style={{ gap: 8, padding: "12px 16px" }}>
        <div className="row" style={{ gap: 8 }}>
          <Scale size={20} className="accent" style={{ flex: "none" }} />
          <span className="headline grow">
            {adjustment === 0 ? `Your base fits: ${Format.kcal(check.oldBaseline)} kcal` : `Base ${Format.kcal(check.oldBaseline)} → ${Format.kcal(check.newBaseline)} kcal`}
          </span>
          {adjustment !== 0 && <span className="semibold tabular">{Format.signedKcal(adjustment)}</span>}
        </div>
        <span className="footnote secondary">{describeCalibration(check)}</span>
        <span className="caption secondary tabular">
          {check.trackedDays} days logged · {check.weighIns} weigh-ins · {date(check.from)} – {date(check.to)}
        </span>
        <div className="row" style={{ gap: 10, marginTop: 4 }}>
          <button type="button" className="button small" disabled={decide.isPending} onClick={() => submit("accepted")}>
            {adjustment === 0 ? "OK" : "Apply"}
          </button>
          {adjustment !== 0 && (
            <button type="button" className="button small secondary-button" disabled={decide.isPending} onClick={() => submit("declined")}>
              Not now
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Status line: ready, waiting for data (with the reasons) or the next check. */
export function calibrationStatus(state: CalibrationState): { label: string; reasons: string[] } {
  if (state.loading || !state.check) return { label: "–", reasons: [] };
  if (!state.due) return { label: `Next check ${date(state.next)}`, reasons: [] };
  if (state.check.reasons.length) return { label: "Due · waiting for data", reasons: state.check.reasons };
  return { label: state.check.adjustment === 0 ? "Ready · base fits" : `Ready · ${Format.signedKcal(state.check.adjustment)} kcal`, reasons: [] };
}

/** Settings: status, parameters and the log of decisions. */
export function CalibrationSection() {
  const state = useCalibration();
  const settings = useSettings();
  const update = useUpdateSettings();
  const cal = settings.budget.calibration;
  const status = calibrationStatus(state);
  const set = (patch: Partial<typeof cal>) => update({ budget: { calibration: { ...cal, ...patch } } });
  return (
    <>
      <CalibrationCard />
      <Section
        header="Calibration"
        footer={
          <>
            {status.reasons.map((reason) => (
              <span key={reason} style={{ display: "block", color: "var(--orange)" }}>
                {reason}
              </span>
            ))}
            Every {cal.intervalDays} days the app compares your weight trend with what your logged food and training predict and suggests a new base: {Math.round(cal.damping * 100)} % of the difference, at most ±{Format.kcal(cal.maxStepKcal)} kcal. Needs 10 weigh-ins and 12 logged days in 14 (excluded weigh-ins and vacation days don't count).
          </>
        }
      >
        <LabeledRow label="Status" value={status.label} />
        <NumberSetting title="Every" unit="days" value={cal.intervalDays} onChange={(intervalDays) => set({ intervalDays: Math.min(Math.max(Math.round(intervalDays), 7), 60) })} />
        <NumberSetting title="Max. change" unit="kcal" value={cal.maxStepKcal} onChange={(maxStepKcal) => set({ maxStepKcal: Math.min(maxStepKcal, 500) })} />
        <NumberSetting title="Damping" value={cal.damping} maxFraction={2} onChange={(damping) => set({ damping: Math.min(damping, 1) })} />
        <NumberSetting title="Energy per kg" unit="kcal" value={cal.kcalPerKg} onChange={(kcalPerKg) => set({ kcalPerKg: Math.min(Math.max(kcalPerKg, 5000), 10000) })} />
      </Section>
      {state.log.length > 0 && (
        <Section header="Calibration Log">
          {state.log.slice(0, 12).map((entry) => (
            <div key={entry.id} className="list-row">
              <div className="grow stack" style={{ gap: 3, minWidth: 0 }}>
                <span>
                  {formatDay(entry.day, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                  {entry.decision === "accepted" ? (entry.adjustment === 0 ? "kept" : "applied") : "declined"}
                </span>
                <span className="caption secondary">{entry.reason}</span>
              </div>
              <span className="row-value tabular" style={{ textDecoration: entry.decision === "declined" ? "line-through" : undefined }}>
                {Format.kcal(entry.oldBaseline)} → {Format.kcal(entry.newBaseline)}
              </span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

/** Weight page: where the next calibration stands. */
export function CalibrationStatusRow() {
  const state = useCalibration();
  const status = calibrationStatus(state);
  return (
    <Section header="Calibration" footer={status.reasons.length ? status.reasons.join(" ") : "The base is checked against your weight trend every 14 days (Settings)."}>
      <LabeledRow label="Status" value={status.label} />
    </Section>
  );
}
