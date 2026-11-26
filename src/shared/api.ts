/** Data transfer types shared by the Worker API and the web client. */
import type { DayTotals } from "./budget";
import type { Day } from "./days";
import type { EntrySource, FoodSource } from "./food";
import type { TemplateSession } from "./weekPlanner";
import type { SessionStatus, SportType, WorkoutDetails } from "./workout";

export interface FoodDTO {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  servingG: number | null;
  source: FoodSource;
  lastUsedAt: number | null;
  useCount: number;
  lastAmountG: number | null;
  hidden: boolean;
}

export interface EntryDTO {
  id: string;
  day: Day;
  loggedAt: number;
  name: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: EntrySource;
  isEstimated: boolean;
  note: string | null;
  foodId: string | null;
}

export interface ActivityDTO {
  id: string;
  /** "<source>:<externalId>" */
  key: string;
  source: string;
  name: string;
  type: string;
  startAt: number;
  day: Day;
  durationS: number;
  distanceM: number;
  elevationM: number;
  isIndoor: boolean;
  activeKcal: number;
  kcalEstimated: boolean;
}

export interface DayDTO {
  day: Day;
  entries: EntryDTO[];
  activities: ActivityDTO[];
  /** Per-day totals from `inputStart(day)` to the end of the week (weekly budget). */
  totals: Record<Day, DayTotals>;
}

/** Body weight of one day (one value per day). */
export interface WeightDTO {
  day: Day;
  weightKg: number;
  /** Body fat in % (null = not measured). */
  bodyFatPct: number | null;
  /** Left out of averages, trend and calibration (still shown). */
  excluded: boolean;
}

export interface SessionDTO {
  id: string;
  day: Day;
  position: number;
  sport: SportType;
  title: string;
  status: SessionStatus;
  details: WorkoutDetails;
  completedAt: number | null;
  linkedActivityKey: string | null;
  linkManual: boolean;
  autoLinkSuppressed: boolean;
  completedByLink: boolean;
  templateId: string | null;
}

export interface PlanWeekDTO {
  sessions: SessionDTO[];
  activities: ActivityDTO[];
}

export interface WorkoutTemplateDTO {
  id: string;
  name: string;
  sport: SportType;
  details: WorkoutDetails;
  updatedAt: number;
  lastUsedAt: number | null;
  useCount: number;
}

export interface WeekTemplateDTO {
  id: string;
  name: string;
  sessions: TemplateSession[];
  updatedAt: number;
}

export interface GoalDTO {
  year: number;
  sport: string;
  distanceKm: number | null;
  hours: number | null;
}

export interface BackfillDTO {
  status: "idle" | "running" | "paused" | "completed" | "failed";
  importedCount: number;
  expectedTotal: number | null;
  oldestAt: number | null;
  pausedUntil: number | null;
  lastError: string | null;
}

export interface StravaStatusDTO {
  configured: boolean;
  connected: boolean;
  athleteName: string | null;
  lastSyncAt: number | null;
  lastError: string | null;
  backfill: BackfillDTO;
}

/** Stats tab snapshots (reports are computed on the client). */
export interface StatsActivityDTO {
  key: string;
  name: string;
  startAt: number;
  day: string;
  type: string;
  isIndoor: boolean;
  distanceM: number;
  movingS: number;
  elevationM: number;
}

export interface StatsSessionDTO {
  day: string;
  sport: SportType;
  status: SessionStatus;
  plannedMinutes: number | null;
  linkedActivityKey: string | null;
}
