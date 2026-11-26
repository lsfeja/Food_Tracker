import { budgetRange, type BudgetSettingsInput, type DayTotals, emptyTotals } from "./budget";
import { addDays, type Day, weekDays, weekStart } from "./days";
import type { Nutrients } from "./nutrients";

export interface DayStat {
  day: Day;
  eaten: Nutrients;
  activeCalories: number;
  /** Tagesziel of the day (0 on vacation days). */
  budget: number;
  /** Part of the target from the weekly balance (+ uneaten earlier, − eaten more). */
  carry: number;
  untracked: boolean;
  hasData: boolean;
}

export interface WeekStat {
  start: Day;
  eatenKcal: number;
  /** Σ target_base of the logged days (what the eaten kcal compare with). */
  budget: number;
  /** Σ target_base of all tracked days of the week (estimates after today). */
  weekTarget: number;
  loggedDays: number;
  averagePerLoggedDay: number;
}

/** `count` days ending with `today`, oldest first. `totals` must reach back to `inputStart`. */
export function dayStats(today: Day, count: number, totals: Record<Day, DayTotals>, settings: BudgetSettingsInput): DayStat[] {
  const first = addDays(today, -count + 1);
  const budget = budgetRange(settings, totals, today, first, today);
  return Array.from({ length: count }, (_, index) => addDays(first, index)).map((day) => {
    const dayTotals = totals[day] ?? emptyTotals();
    const plan = budget.days[day];
    return {
      day,
      eaten: dayTotals.eaten,
      activeCalories: dayTotals.activeCalories,
      budget: plan?.target ?? 0,
      carry: plan?.carry ?? 0,
      untracked: Boolean(dayTotals.untracked),
      hasData: dayTotals.eaten.kcal > 0 || dayTotals.activeCalories > 0,
    };
  });
}

/** `count` Monday-based weeks ending with the week of `today`, oldest first. */
export function weekStats(today: Day, count: number, totals: Record<Day, DayTotals>, settings: BudgetSettingsInput): WeekStat[] {
  const current = weekStart(today);
  const first = addDays(current, -7 * (count - 1));
  const budget = budgetRange(settings, totals, today, first, today);
  return Array.from({ length: count }, (_, index) => addDays(first, 7 * index)).map((start) => {
    let eaten = 0;
    let logged = 0;
    let loggedTarget = 0;
    for (const day of weekDays(start)) {
      const plan = budget.days[day];
      if (!plan || plan.untracked || !plan.logged || day > today) continue;
      eaten += plan.eaten;
      loggedTarget += plan.targetBase;
      logged++;
    }
    return {
      start,
      eatenKcal: eaten,
      budget: loggedTarget,
      weekTarget: budget.weeks[start]?.targetBase ?? 0,
      loggedDays: logged,
      averagePerLoggedDay: logged > 0 ? eaten / logged : 0,
    };
  });
}
