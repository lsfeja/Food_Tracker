import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import type { DayDTO, EntryDTO, FoodDTO } from "../../shared/api";
import type { DayTotals } from "../../shared/budget";
import type { Day } from "../../shared/days";
import type { EntrySource, FoodDraft } from "../../shared/food";
import { localToday } from "../../shared/days";
import { defaultSettings, historyEntry, type UserSettings } from "../../shared/settings";
import { useToast } from "../components/Toast";
import { api, errorMessage } from "./client";

export const keys = {
  me: ["me"] as const,
  settings: ["settings"] as const,
  day: (day: Day) => ["day", day] as const,
  foods: ["foods"] as const,
  totals: (from: Day, to: Day) => ["totals", from, to] as const,
  untracked: ["untracked"] as const,
};

/** Everything derived from entries or activities. */
export function invalidateNutrition(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ["day"] });
  void client.invalidateQueries({ queryKey: ["totals"] });
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<{ email: string }>("/me"), staleTime: Infinity });
}

export function useSettingsQuery() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api.get<UserSettings>("/settings") });
}

/** Fills fields a cached copy from an older app version may lack. */
function withDefaults(data: UserSettings | undefined): UserSettings {
  const defaults = defaultSettings();
  if (!data) return defaults;
  return {
    ...defaults,
    ...data,
    targets: { ...defaults.targets, ...data.targets },
    budget: { ...defaults.budget, ...data.budget, calibration: { ...defaults.budget.calibration, ...data.budget?.calibration } },
    budgetHistory: data.budgetHistory ?? [],
  };
}

/** Settings with defaults while loading. */
export function useSettings(): UserSettings {
  const data = useSettingsQuery().data;
  return useMemo(() => withDefaults(data), [data]);
}

export interface SettingsPatch {
  targets?: Partial<UserSettings["targets"]>;
  budget?: Partial<UserSettings["budget"]>;
  timezone?: string;
}

/** Applies a patch immediately (cache) and saves it debounced. */
export function useUpdateSettings() {
  const client = useQueryClient();
  const toast = useToast();
  const timer = useRef<number | undefined>(undefined);
  const version = useRef(0);

  return useCallback(
    (patch: SettingsPatch) => {
      const current = withDefaults(client.getQueryData<UserSettings>(keys.settings));
      const day = localToday();
      const next: UserSettings = {
        ...current,
        targets: { ...current.targets, ...patch.targets },
        budget: { ...current.budget, ...patch.budget },
        timezone: patch.timezone ?? current.timezone,
      };
      // Like the server: budget values apply from today on, past days keep theirs.
      const before = historyEntry(current, "1970-01-01");
      const after = historyEntry(next, day);
      if (JSON.stringify({ ...before, day: "" }) !== JSON.stringify({ ...after, day: "" })) {
        const history = current.budgetHistory.length ? current.budgetHistory : [before];
        next.budgetHistory = [...history.filter((e) => e.day !== day), after].sort((a, b) => (a.day < b.day ? -1 : 1));
      }
      client.setQueryData(keys.settings, next);
      version.current += 1;
      const saved = version.current;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => {
        try {
          const result = await api.put<UserSettings>("/settings", { targets: next.targets, budget: next.budget, timezone: next.timezone, day });
          if (saved === version.current) client.setQueryData(keys.settings, result);
        } catch (error) {
          toast(errorMessage(error));
          void client.invalidateQueries({ queryKey: keys.settings });
        }
      }, 500);
    },
    [client, toast],
  );
}

export function useDay(day: Day) {
  return useQuery({ queryKey: keys.day(day), queryFn: () => api.get<DayDTO>(`/day/${day}`) });
}

export function useFoods() {
  return useQuery({ queryKey: keys.foods, queryFn: () => api.get<FoodDTO[]>("/foods") });
}

export function useTotals(from: Day, to: Day) {
  return useQuery({ queryKey: keys.totals(from, to), queryFn: () => api.get<Record<Day, DayTotals>>(`/totals?from=${from}&to=${to}`) });
}

export type LogEntryInput =
  | { day: Day; loggedAt: number; source: EntrySource; foodId: string; grams: number }
  | { day: Day; loggedAt: number; source: EntrySource; name: string; kcal: number; protein: number; carbs: number; fat: number; isEstimated?: boolean };

export function useLogEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LogEntryInput) => api.post<EntryDTO>("/entries", input),
    onSuccess: (_entry, input) => {
      invalidateNutrition(client);
      if ("foodId" in input) void client.invalidateQueries({ queryKey: keys.foods });
    },
  });
}

export interface EntryPatch {
  name?: string;
  grams?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  day?: Day;
  loggedAt?: number;
}

export function useUpdateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntryPatch }) => api.patch<EntryDTO>(`/entries/${id}`, patch),
    onSuccess: () => invalidateNutrition(client),
  });
}

/** Deletes optimistically (restores the list if the request fails). */
export function useDeleteEntry() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (entry: EntryDTO) => api.delete(`/entries/${entry.id}`),
    onMutate: async (entry) => {
      await client.cancelQueries({ queryKey: keys.day(entry.day) });
      const previous = client.getQueryData<DayDTO>(keys.day(entry.day));
      if (previous) client.setQueryData<DayDTO>(keys.day(entry.day), { ...previous, entries: previous.entries.filter((e) => e.id !== entry.id) });
      return { previous };
    },
    onError: (error, entry, context) => {
      if (context?.previous) client.setQueryData(keys.day(entry.day), context.previous);
      toast(errorMessage(error));
    },
    onSettled: () => invalidateNutrition(client),
  });
}

export interface FoodInput {
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingGrams: number | null;
  source: FoodDraft["source"];
}

export function useSaveFood() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, food }: { id?: string; food: FoodInput }) => (id ? api.put<FoodDTO>(`/foods/${id}`, food) : api.post<FoodDTO>("/foods", food)),
    onSuccess: (food) => {
      client.setQueryData<FoodDTO[]>(keys.foods, (list) => (list ? [...list.filter((f) => f.id !== food.id), food] : list));
      void client.invalidateQueries({ queryKey: keys.foods });
    },
  });
}

export function useHideFood() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (food: FoodDTO) => api.delete(`/foods/${food.id}`),
    onMutate: (food) => {
      client.setQueryData<FoodDTO[]>(keys.foods, (list) => list?.filter((f) => f.id !== food.id));
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: () => client.invalidateQueries({ queryKey: keys.foods }),
  });
}

/** Saves an Open Food Facts / label draft as a food (reuses an existing barcode). */
export function draftToFoodInput(draft: FoodDraft): FoodInput {
  return {
    name: draft.name.trim(),
    brand: draft.brand,
    barcode: draft.barcode,
    kcal: draft.kcal ?? 0,
    protein: draft.protein ?? 0,
    carbs: draft.carbs ?? 0,
    fat: draft.fat ?? 0,
    servingGrams: draft.servingGrams,
    source: draft.source,
  };
}

export const offApi = {
  product: (barcode: string) => api.get<FoodDraft | null>(`/off/product/${encodeURIComponent(barcode)}`),
  search: (query: string) => api.get<FoodDraft[]>(`/off/search?q=${encodeURIComponent(query)}`),
  localByBarcode: (barcode: string) => api.get<FoodDTO | null>(`/foods/barcode/${encodeURIComponent(barcode)}`),
};

// MARK: Vacation days

export const useUntrackedDays = () => useQuery({ queryKey: keys.untracked, queryFn: () => api.get<Day[]>("/untracked-days") });

/** Marks a day as not tracked (vacation) or tracks it again. */
export function useSetUntracked() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ day, untracked }: { day: Day; untracked: boolean }) =>
      untracked ? api.put(`/untracked-days/${day}`, {}) : api.delete(`/untracked-days/${day}`),
    onMutate: ({ day, untracked }) => {
      client.setQueryData<Day[]>(keys.untracked, (list) => (list ? (untracked ? [...new Set([...list, day])].sort() : list.filter((d) => d !== day)) : list));
      client.setQueriesData<DayDTO>({ queryKey: ["day"] }, (dto) => {
        if (!dto) return dto;
        const current = dto.totals[day] ?? { eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, activeCalories: 0 };
        return { ...dto, totals: { ...dto.totals, [day]: { ...current, untracked } } };
      });
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.untracked });
      invalidateNutrition(client);
      void client.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
