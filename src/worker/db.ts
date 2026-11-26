import type { ActivityDTO, EntryDTO, FoodDTO, SessionDTO } from "../shared/api";
import type { DayTotals } from "../shared/budget";
import type { Day } from "../shared/days";
import type { EntrySource, FoodSource } from "../shared/food";
import { DEFAULT_CALIBRATION } from "../shared/calibration";
import { SPORT_FACTOR_KEYS, type SportFactorKey } from "../shared/energyBudget";
import type { BudgetHistoryEntry, UserSettings } from "../shared/settings";
import { parseDetails, sportInfo, type SessionStatus, type SportType } from "../shared/workout";

export const newId = () => crypto.randomUUID();

type Row = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const nOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const sOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function settingsFromRow(row: Row | null): UserSettings {
  return {
    targets: {
      kcal: n(row?.target_kcal ?? 2200),
      protein: n(row?.target_protein ?? 140),
      carbs: n(row?.target_carbs ?? 220),
      fat: n(row?.target_fat ?? 70),
    },
    budget: {
      activeCaloriesEnabled: n(row?.active_enabled ?? 1) === 1,
      activeCaloriesPercent: n(row?.active_percent ?? 100),
      restDayActivePct: n(row?.rest_day_active_pct ?? 75),
      maxDailyDeficit: n(row?.max_daily_deficit ?? 700),
      carryOverPct: n(row?.carry_over_pct ?? 70),
      goalKcal: n(row?.goal_kcal ?? 0),
      alpha: n(row?.alpha ?? 0.2),
      carryEnabled: n(row?.carry_enabled ?? 1) === 1,
      carryCapKcal: n(row?.carry_cap_kcal ?? 300),
      sportFactors: parseFactors(row?.sport_factors),
      calibration: {
        intervalDays: n(row?.calib_interval_days ?? DEFAULT_CALIBRATION.intervalDays),
        maxStepKcal: n(row?.calib_max_step_kcal ?? DEFAULT_CALIBRATION.maxStepKcal),
        damping: n(row?.calib_damping ?? DEFAULT_CALIBRATION.damping),
        kcalPerKg: n(row?.kcal_per_kg ?? DEFAULT_CALIBRATION.kcalPerKg),
      },
    },
    timezone: String(row?.timezone ?? "Europe/Berlin"),
    budgetHistory: [],
  };
}

/** Sport factor overrides from JSON (only known keys with valid values). */
export function parseFactors(value: unknown): Partial<Record<SportFactorKey, number>> {
  let raw: Record<string, unknown> = {};
  try {
    raw = typeof value === "string" ? (JSON.parse(value) as Record<string, unknown>) : value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    raw = {};
  }
  const result: Partial<Record<SportFactorKey, number>> = {};
  for (const key of SPORT_FACTOR_KEYS) {
    const v = raw?.[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 2) result[key] = v;
  }
  return result;
}

export const historyFromRow = (r: Row): BudgetHistoryEntry => ({
  day: String(r.day),
  baselineKcal: n(r.baseline_kcal),
  goalKcal: n(r.goal_kcal),
  alpha: n(r.alpha),
  activeEnabled: n(r.active_enabled) === 1,
  carryEnabled: n(r.carry_enabled) === 1,
  carryCapKcal: n(r.carry_cap_kcal),
  sportFactors: parseFactors(r.sport_factors),
});

export async function loadSettings(db: D1Database, userId: string): Promise<UserSettings> {
  const [settings, history] = await db.batch([
    db.prepare("SELECT * FROM settings WHERE user_id = ?").bind(userId),
    db.prepare("SELECT * FROM budget_history WHERE user_id = ? ORDER BY day").bind(userId),
  ]);
  const result = settingsFromRow(((settings.results ?? []) as Row[])[0] ?? null);
  result.budgetHistory = ((history.results ?? []) as Row[]).map(historyFromRow);
  return result;
}

export function foodFromRow(r: Row): FoodDTO {
  return {
    id: String(r.id),
    name: String(r.name),
    brand: sOrNull(r.brand),
    barcode: sOrNull(r.barcode),
    kcal100: n(r.kcal_100g),
    protein100: n(r.protein_100g),
    carbs100: n(r.carbs_100g),
    fat100: n(r.fat_100g),
    servingG: nOrNull(r.serving_g),
    source: String(r.source) as FoodSource,
    lastUsedAt: nOrNull(r.last_used_at),
    useCount: n(r.use_count),
    lastAmountG: nOrNull(r.last_amount_g),
    hidden: n(r.hidden) === 1,
  };
}

export function entryFromRow(r: Row): EntryDTO {
  return {
    id: String(r.id),
    day: String(r.day),
    loggedAt: n(r.logged_at),
    name: String(r.name),
    grams: nOrNull(r.grams),
    kcal: n(r.kcal),
    protein: n(r.protein),
    carbs: n(r.carbs),
    fat: n(r.fat),
    source: String(r.source) as EntrySource,
    isEstimated: n(r.is_estimated) === 1,
    note: sOrNull(r.note),
    foodId: sOrNull(r.food_id),
  };
}

export function activityFromRow(r: Row): ActivityDTO {
  return {
    id: String(r.id),
    key: `${r.source}:${r.external_id}`,
    source: String(r.source),
    name: String(r.name),
    type: String(r.type),
    startAt: n(r.start_at),
    day: String(r.day),
    durationS: n(r.duration_s),
    distanceM: n(r.distance_m),
    elevationM: n(r.elevation_m),
    isIndoor: n(r.is_indoor) === 1,
    activeKcal: n(r.active_kcal),
    kcalEstimated: n(r.kcal_estimated) === 1,
  };
}

export function sessionFromRow(r: Row): SessionDTO {
  const sport = String(r.sport) as SportType;
  const category = sportInfo[sport]?.category ?? "other";
  return {
    id: String(r.id),
    day: String(r.day),
    position: n(r.position),
    sport: sportInfo[sport] ? sport : "custom",
    title: String(r.title ?? ""),
    status: String(r.status) as SessionStatus,
    details: parseDetails(String(r.details ?? "{}"), category),
    completedAt: nOrNull(r.completed_at),
    linkedActivityKey: sOrNull(r.linked_activity_key),
    linkManual: n(r.link_manual) === 1,
    autoLinkSuppressed: n(r.auto_link_suppressed) === 1,
    completedByLink: n(r.completed_by_link) === 1,
    templateId: sOrNull(r.template_id),
  };
}

/** Per-day eaten nutrients, activities (for the cleaned active kcal), planned rest days and vacation days for [from, to). */
export async function totalsBetween(db: D1Database, userId: string, from: Day, to: Day): Promise<Record<Day, DayTotals>> {
  const [entries, activities, restDays, untracked] = await db.batch([
    db
      .prepare(
        "SELECT day, SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs, SUM(fat) AS fat FROM food_entries WHERE user_id = ? AND day >= ? AND day < ? GROUP BY day",
      )
      .bind(userId, from, to),
    db.prepare("SELECT day, active_kcal, duration_s, type, has_power FROM activities WHERE user_id = ? AND day >= ? AND day < ? ORDER BY start_at").bind(userId, from, to),
    db.prepare("SELECT DISTINCT day FROM planned_sessions WHERE user_id = ? AND sport = 'rest' AND day >= ? AND day < ?").bind(userId, from, to),
    db.prepare("SELECT day FROM untracked_days WHERE user_id = ? AND day >= ? AND day < ?").bind(userId, from, to),
  ]);
  const result: Record<Day, DayTotals> = {};
  for (const r of (entries.results ?? []) as Row[]) {
    result[String(r.day)] = { eaten: { kcal: n(r.kcal), protein: n(r.protein), carbs: n(r.carbs), fat: n(r.fat) }, activeCalories: 0 };
  }
  for (const r of (activities.results ?? []) as Row[]) {
    const day = String(r.day);
    const totals = (result[day] ??= { eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, activeCalories: 0 });
    totals.activeCalories += n(r.active_kcal);
    (totals.activities ??= []).push({ kcal: n(r.active_kcal), movingS: n(r.duration_s), sport: String(r.type ?? ""), hasPower: n(r.has_power) === 1 });
  }
  for (const r of (restDays.results ?? []) as Row[]) {
    const day = String(r.day);
    result[day] ??= { eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, activeCalories: 0 };
    result[day].restDay = true;
  }
  for (const r of (untracked.results ?? []) as Row[]) {
    const day = String(r.day);
    result[day] ??= { eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, activeCalories: 0 };
    result[day].untracked = true;
  }
  return result;
}
