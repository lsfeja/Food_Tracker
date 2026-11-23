import { budgetRange, type DayTotals, emptyTotals } from "./budget";
import { addDays, type Day, weekStart } from "./days";
import type { Nutrients } from "./nutrients";
import type { UserSettings } from "./settings";

export interface DayStat {
  day: Day;
  eaten: Nutrients;
  activeCalories: number;
  /** Tagesziel of the day (0 on vacation days). */
  budget: number;
  untracked: boolean;
  hasData: boolean;
}

export interface WeekStat {
  start: Day;
  eatenKcal: number;
  /** Sum of the day targets of the week. */
  budget: number;
  /** Weekly plan (standard target × tracked days). */
  plan: number;
  loggedDays: number;
  averagePerLoggedDay: number;
}

/** `count` days ending with `today`, oldest first. `totals` must reach back to `inputStart`. */
export function dayStats(today: Day, count: number, totals: Record<Day, DayTotals>, settings: UserSettings): DayStat[] {
  const first = addDays(today, -count + 1);
  const budget = budgetRange(settings, totals, today, first, today);
  return Array.from({ length: count }, (_, index) => addDays(first, index)).map((day) => {
    const dayTotals = totals[day] ?? emptyTotals();
    return {
      day,
      eaten: dayTotals.eaten,
      activeCalories: dayTotals.activeCalories,
      budget: budget.days[day]?.target ?? 0,
      untracked: Boolean(dayTotals.untracked),
      hasData: dayTotals.eaten.kcal > 0 || dayTotals.activeCalories > 0,
    };
  });
}

/** `count` Monday-based weeks ending with the week of `today`, oldest first. */
export function weekStats(today: Day, count: number, totals: Record<Day, DayTotals>, settings: UserSettings): WeekStat[] {
  const current = weekStart(today);
  const first = addDays(current, -7 * (count - 1));
  const budget = budgetRange(settings, totals, today, first, today);
  return Array.from({ length: count }, (_, index) => addDays(first, 7 * index)).map((start) => {
    let eaten = 0;
    let logged = 0;
    for (let offset = 0; offset < 7; offset++) {
      const dayTotals = totals[addDays(start, offset)];
      if (!dayTotals || dayTotals.untracked) continue;
      eaten += dayTotals.eaten.kcal;
      if (dayTotals.eaten.kcal > 0) logged++;
    }
    const week = budget.weeks[start];
    return {
      start,
      eatenKcal: eaten,
      budget: week?.total ?? 0,
      plan: week?.plan ?? 0,
      loggedDays: logged,
      averagePerLoggedDay: logged > 0 ? eaten / logged : 0,
    };
  });
}
