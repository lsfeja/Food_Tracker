import { type Day } from "./days";
import { type BudgetParams, type SportFactorKey, sportFactors } from "./energyBudget";
import { type CalibrationSettings, DEFAULT_CALIBRATION } from "./calibration";

export interface NutritionTargets {
  /** Baseline (Grundbedarf): daily need incl. everyday movement, without workouts. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BudgetSettings {
  /** Add (cleaned, smoothed) workout calories to the target. */
  activeCaloriesEnabled: boolean;
  /** Goal slider: negative = deficit (lose fat), positive = surplus (build mass), kcal/day. */
  goalKcal: number;
  /** EWMA weight of yesterday's activity (0.2 ≈ 3 days half-life). */
  alpha: number;
  /** Weekly balance: uneaten / extra food moves to the rest of the week. */
  carryEnabled: boolean;
  carryCapKcal: number;
  /** Overrides of the default sport factors. */
  sportFactors: Partial<Record<SportFactorKey, number>>;
  calibration: CalibrationSettings;
}

/** Budget settings valid from `day` (until the next entry). */
export interface BudgetHistoryEntry {
  day: Day;
  baselineKcal: number;
  goalKcal: number;
  alpha: number;
  activeEnabled: boolean;
  carryEnabled: boolean;
  carryCapKcal: number;
  sportFactors: Partial<Record<SportFactorKey, number>>;
}

export interface UserSettings {
  targets: NutritionTargets;
  budget: BudgetSettings;
  timezone: string;
  /** Oldest first; empty = the current settings apply to every day. */
  budgetHistory: BudgetHistoryEntry[];
}

export const defaultSettings = (): UserSettings => ({
  targets: { kcal: 2200, protein: 140, carbs: 220, fat: 70 },
  budget: {
    activeCaloriesEnabled: true,
    goalKcal: 0,
    alpha: 0.2,
    carryEnabled: true,
    carryCapKcal: 300,
    sportFactors: {},
    calibration: { ...DEFAULT_CALIBRATION },
  },
  timezone: "Europe/Berlin",
  budgetHistory: [],
});

/** The history entry the current settings would write. */
export function historyEntry(settings: Pick<UserSettings, "targets" | "budget">, day: Day): BudgetHistoryEntry {
  return {
    day,
    baselineKcal: settings.targets.kcal,
    goalKcal: settings.budget.goalKcal,
    alpha: settings.budget.alpha,
    activeEnabled: settings.budget.activeCaloriesEnabled,
    carryEnabled: settings.budget.carryEnabled,
    carryCapKcal: settings.budget.carryCapKcal,
    sportFactors: settings.budget.sportFactors,
  };
}

const toParams = (e: BudgetHistoryEntry): BudgetParams => ({
  baselineKcal: e.baselineKcal,
  deficitKcal: -e.goalKcal,
  alpha: e.alpha,
  activeEnabled: e.activeEnabled,
  carryEnabled: e.carryEnabled,
  carryCapKcal: e.carryCapKcal,
  sportFactors: sportFactors(e.sportFactors),
});

/**
 * Budget parameters per day: the history entry valid on that day (the oldest one before
 * the history starts); without a history the current settings.
 */
export function budgetParamsFor(settings: Pick<UserSettings, "targets" | "budget" | "budgetHistory">): (day: Day) => BudgetParams {
  const history = [...(settings.budgetHistory ?? [])].sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!history.length) {
    const current = toParams(historyEntry(settings, "1970-01-01"));
    return () => current;
  }
  const params = history.map(toParams);
  return (day) => {
    let index = 0;
    for (let i = 0; i < history.length; i++) if (history[i].day <= day) index = i;
    return params[index];
  };
}
