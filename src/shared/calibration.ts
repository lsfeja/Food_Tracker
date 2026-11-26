/**
 * Calibration of the baseline over body weight (spec section 6). Every `intervalDays`:
 * compare the weight change the logged food and activity predict with the measured trend
 * and move the baseline by half the difference (at most ±100 kcal), after confirmation.
 */
import { addDays, type Day, diffDays } from "./days";
import { type BudgetDayInput, type BudgetParams, dayActive } from "./energyBudget";
import { slopePerDay } from "./weight";

export interface CalibrationSettings {
  intervalDays: number;
  /** Largest change per calibration. */
  maxStepKcal: number;
  /** Share of the measured difference that is applied. */
  damping: number;
  kcalPerKg: number;
}

export const DEFAULT_CALIBRATION: CalibrationSettings = { intervalDays: 14, maxStepKcal: 100, damping: 0.5, kcalPerKg: 7700 };

/** Requirements for 14 days (scaled for other intervals): weigh-ins and fully logged days. */
export const MIN_WEIGH_INS_PER_14 = 10;
export const MIN_TRACKED_PER_14 = 12;

export interface WeighIn {
  day: Day;
  weightKg: number;
  excluded?: boolean;
}

export interface CalibrationCheck {
  /** First and last day of the window (the days before today). */
  from: Day;
  to: Day;
  trackedDays: number;
  weighIns: number;
  minTrackedDays: number;
  minWeighIns: number;
  /** Why no proposal is possible (empty = ready). */
  reasons: string[];
  /** Σ (eaten − (baseline + A)) over the tracked days. */
  energyBalance: number;
  expectedKg: number;
  measuredKg: number | null;
  /** Positive = need lower than assumed. */
  errorPerDay: number | null;
  adjustment: number;
  oldBaseline: number;
  newBaseline: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Window = the `intervalDays` finished days before `today`. Tracked days: with food
 * entries and not on vacation. Weight trend: least-squares slope of the weigh-ins from the
 * first window day to today (excluded ones ignored) × interval.
 */
export function calibrationCheck(
  inputs: Record<Day, BudgetDayInput>,
  weights: WeighIn[],
  today: Day,
  paramsFor: (day: Day) => BudgetParams,
  settings: CalibrationSettings,
): CalibrationCheck {
  const interval = Math.max(1, Math.round(settings.intervalDays));
  const from = addDays(today, -interval);
  const to = addDays(today, -1);
  const minTrackedDays = Math.round((MIN_TRACKED_PER_14 / 14) * interval);
  const minWeighIns = Math.round((MIN_WEIGH_INS_PER_14 / 14) * interval);

  let energyBalance = 0;
  let trackedDays = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const input = inputs[day];
    if (!input || input.untracked || input.eaten <= 0) continue;
    const params = paramsFor(day);
    energyBalance += input.eaten - (params.baselineKcal + dayActive(input, params));
    trackedDays++;
  }

  const points = weights.filter((w) => !w.excluded && w.day >= from && w.day <= today);
  const reasons: string[] = [];
  if (points.length < minWeighIns) reasons.push(`Only ${points.length} weigh-ins in the last ${interval} days (needs ${minWeighIns}).`);
  if (trackedDays < minTrackedDays) reasons.push(`Only ${trackedDays} of ${interval} days logged (needs ${minTrackedDays}).`);

  const slope = slopePerDay(points);
  const measuredKg = slope === null ? null : slope * diffDays(from, today);
  const expectedKg = energyBalance / settings.kcalPerKg;
  if (measuredKg === null && reasons.length === 0) reasons.push("Not enough weigh-ins on different days.");

  const oldBaseline = paramsFor(today).baselineKcal;
  let errorPerDay: number | null = null;
  let adjustment = 0;
  if (reasons.length === 0 && measuredKg !== null) {
    errorPerDay = ((measuredKg - expectedKg) * settings.kcalPerKg) / trackedDays;
    adjustment = Math.round(clamp(-errorPerDay * settings.damping, -settings.maxStepKcal, settings.maxStepKcal));
  }
  return {
    from,
    to,
    trackedDays,
    weighIns: points.length,
    minTrackedDays,
    minWeighIns,
    reasons,
    energyBalance,
    expectedKg,
    measuredKg,
    errorPerDay,
    adjustment,
    oldBaseline,
    newBaseline: oldBaseline + adjustment,
  };
}

/** Due `intervalDays` after the last decision (accepted or declined); at once without one. */
export function calibrationDue(lastDecision: Day | null, today: Day, intervalDays: number): boolean {
  return lastDecision === null || diffDays(lastDecision, today) >= intervalDays;
}

export const nextCalibration = (lastDecision: Day | null, today: Day, intervalDays: number): Day =>
  lastDecision === null ? today : addDays(lastDecision, intervalDays) > today ? addDays(lastDecision, intervalDays) : today;

const signedKg = (kg: number) => `${kg > 0 ? "+" : kg < 0 ? "−" : "±"}${Math.abs(kg).toFixed(2)}`;

/** One sentence for the proposal and the log. */
export function describeCalibration(check: CalibrationCheck): string {
  if (check.measuredKg === null) return check.reasons.join(" ");
  const days = diffDays(check.from, addDays(check.to, 1));
  const trend = `Weight trend ${signedKg(check.measuredKg)} kg in ${days} days, expected ${signedKg(check.expectedKg)} kg from food and training`;
  if (check.adjustment < 0) return `${trend}: your real need seems lower than your base.`;
  if (check.adjustment > 0) return `${trend}: your real need seems higher than your base.`;
  return `${trend}: your base fits.`;
}

/** The numbers behind a proposal, for the log. */
export const calibrationDetails = (check: CalibrationCheck) => ({
  from: check.from,
  to: check.to,
  trackedDays: check.trackedDays,
  weighIns: check.weighIns,
  energyBalance: Math.round(check.energyBalance),
  expectedKg: Number(check.expectedKg.toFixed(3)),
  measuredKg: check.measuredKg === null ? null : Number(check.measuredKg.toFixed(3)),
  errorPerDay: check.errorPerDay === null ? null : Math.round(check.errorPerDay),
});
