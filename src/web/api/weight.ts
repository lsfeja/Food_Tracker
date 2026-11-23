import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WeightDTO } from "../../shared/api";
import type { Day } from "../../shared/days";
import { sortWeights } from "../../shared/weight";
import { useToast } from "../components/Toast";
import { api, errorMessage } from "./client";

const key = ["weights"] as const;

/** All weigh-ins, oldest first (one small row per day). */
export const useWeights = () => useQuery({ queryKey: key, queryFn: () => api.get<WeightDTO[]>("/weights") });

/** Saves (or replaces) a day's weight; `replaces` removes an entry moved to another day. */
export function useSaveWeight() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ entry, replaces }: { entry: WeightDTO; replaces?: Day }) => {
      await api.put(`/weights/${entry.day}`, { weightKg: entry.weightKg, bodyFatPct: entry.bodyFatPct });
      if (replaces && replaces !== entry.day) await api.delete(`/weights/${replaces}`);
    },
    onMutate: ({ entry, replaces }) => {
      void client.cancelQueries({ queryKey: key });
      client.setQueryData<WeightDTO[]>(key, (list) => sortWeights([...(list ?? []).filter((w) => w.day !== entry.day && w.day !== replaces), entry]));
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: () => void client.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteWeight() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (day: Day) => api.delete(`/weights/${day}`),
    onMutate: (day) => {
      void client.cancelQueries({ queryKey: key });
      client.setQueryData<WeightDTO[]>(key, (list) => list?.filter((w) => w.day !== day));
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: () => void client.invalidateQueries({ queryKey: key }),
  });
}
