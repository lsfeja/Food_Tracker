import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoalDTO, StatsActivityDTO, StatsSessionDTO } from "../../shared/api";
import type { DayTotals } from "../../shared/budget";
import type { Day } from "../../shared/days";
import { useToast } from "../components/Toast";
import { api, errorMessage } from "./client";

export const useStatsActivities = () =>
  useQuery({ queryKey: ["stats", "activities"], queryFn: () => api.get<StatsActivityDTO[]>("/stats/activities"), staleTime: 5 * 60_000 });

export const useStatsSessions = () =>
  useQuery({ queryKey: ["stats", "sessions"], queryFn: () => api.get<StatsSessionDTO[]>("/stats/sessions"), staleTime: 60_000 });

export const useStatsRange = () => useQuery({ queryKey: ["stats", "range"], queryFn: () => api.get<{ earliest: Day | null }>("/stats/range") });

/** Day totals for nutrition stats (all history up to tomorrow). */
export const useAllTotals = (to: Day) =>
  useQuery({ queryKey: ["stats", "totals", to], queryFn: () => api.get<Record<Day, DayTotals>>(`/totals?from=2000-01-01&to=${to}`), staleTime: 60_000 });

export const useGoals = () => useQuery({ queryKey: ["goals"], queryFn: () => api.get<GoalDTO[]>("/goals") });

export function useGoalMutations() {
  const client = useQueryClient();
  const toast = useToast();
  const settle = () => client.invalidateQueries({ queryKey: ["goals"] });
  return {
    save: useMutation({ mutationFn: (goal: GoalDTO) => api.put<GoalDTO>("/goals", goal), onSettled: settle, onError: (e) => toast(errorMessage(e)) }),
    remove: useMutation({
      mutationFn: (goal: Pick<GoalDTO, "year" | "sport">) => api.delete(`/goals/${goal.year}/${goal.sport}`),
      onSettled: settle,
      onError: (e) => toast(errorMessage(e)),
    }),
  };
}
