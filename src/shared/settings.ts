export interface NutritionTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BudgetSettings {
  weeklyModeEnabled: boolean;
  /** 0 = 7 × daily target. */
  weeklyLimitKcal: number;
  activeCaloriesEnabled: boolean;
  /** 50…100 */
  activeCaloriesPercent: number;
}

export interface UserSettings {
  targets: NutritionTargets;
  budget: BudgetSettings;
  timezone: string;
}

export const defaultSettings = (): UserSettings => ({
  targets: { kcal: 2200, protein: 140, carbs: 220, fat: 70 },
  budget: { weeklyModeEnabled: false, weeklyLimitKcal: 0, activeCaloriesEnabled: true, activeCaloriesPercent: 100 },
  timezone: "Europe/Berlin",
});

export function effectiveWeeklyLimit(budget: BudgetSettings, dailyTarget: number): number {
  return budget.weeklyLimitKcal > 0 ? budget.weeklyLimitKcal : dailyTarget * 7;
}
