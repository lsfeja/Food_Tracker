import type { BudgetConfig } from "./weeklyBudget";

export interface NutritionTargets {
  /** Grundumsatz: daily need at rest plus everyday movement, without workouts. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BudgetSettings {
  activeCaloriesEnabled: boolean;
  /** 50…100: share of Strava kcal that counts. */
  activeCaloriesPercent: number;
  /** Rest-day minimum: base + this % of the 4-week active average. */
  restDayActivePct: number;
  /** A day's target never drops further below base + average. */
  maxDailyDeficit: number;
  /** Share of cuts that don't fit into the week and move to the next one. */
  carryOverPct: number;
  /** Goal slider: negative = deficit (lose fat), positive = surplus (build mass), kcal/day. */
  goalKcal: number;
}

export interface UserSettings {
  targets: NutritionTargets;
  budget: BudgetSettings;
  timezone: string;
}

export const defaultSettings = (): UserSettings => ({
  targets: { kcal: 2200, protein: 140, carbs: 220, fat: 70 },
  budget: { activeCaloriesEnabled: true, activeCaloriesPercent: 100, restDayActivePct: 75, maxDailyDeficit: 700, carryOverPct: 70, goalKcal: 0 },
  timezone: "Europe/Berlin",
});

export function budgetConfig(settings: Pick<UserSettings, "targets" | "budget">): BudgetConfig {
  return {
    baseKcal: settings.targets.kcal,
    goalKcal: settings.budget.goalKcal ?? 0,
    activeEnabled: settings.budget.activeCaloriesEnabled,
    activePercent: settings.budget.activeCaloriesPercent,
    restDayActivePct: settings.budget.restDayActivePct,
    maxDailyDeficit: settings.budget.maxDailyDeficit,
    carryOverPct: settings.budget.carryOverPct,
  };
}
