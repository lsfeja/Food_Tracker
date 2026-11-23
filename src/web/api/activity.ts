import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { StravaStatusDTO } from "../../shared/api";
import { useToast } from "../components/Toast";
import { api, errorMessage } from "./client";

export const stravaKey = ["strava"] as const;

interface SyncResponse {
  status: "synced" | "skipped" | "notConnected" | "rateLimited" | "failed";
  changed: boolean;
  message?: string;
  strava: StravaStatusDTO;
}

export const useStravaStatus = () => useQuery({ queryKey: stravaKey, queryFn: () => api.get<StravaStatusDTO>("/strava/status") });

/** Activities feed the budget, the plan (matching) and the stats. */
export function invalidateActivityData(client: QueryClient) {
  for (const key of ["day", "totals", "plan", "stats"]) void client.invalidateQueries({ queryKey: [key] });
}

let lastAutoSync = 0;

/**
 * Triggers a Strava sync. `force` (pull to refresh, "Sync Now") bypasses the
 * 10-minute interval; the server's rate limiter still applies.
 */
export function useActivitySync(): (force?: boolean) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (force = true) => {
      const status = client.getQueryData<StravaStatusDTO>(stravaKey);
      if (status && !status.connected) return;
      if (!force && Date.now() - lastAutoSync < 10 * 60 * 1000) return;
      lastAutoSync = Date.now();
      const result = await api.post<SyncResponse>("/strava/sync", { force });
      client.setQueryData(stravaKey, result.strava);
      if (result.changed) invalidateActivityData(client);
      if (result.status === "rateLimited" || result.status === "failed") throw new Error(result.message ?? "Sync failed.");
    },
    [client],
  );
}

export function useStravaActions() {
  const client = useQueryClient();
  const toast = useToast();
  const update = (status: StravaStatusDTO) => client.setQueryData(stravaKey, status);
  const onError = (error: unknown) => toast(errorMessage(error));
  return {
    disconnect: useMutation({
      mutationFn: (deleteActivities: boolean) => api.post<StravaStatusDTO>("/strava/disconnect", { deleteActivities }),
      onSuccess: (status) => {
        update(status);
        invalidateActivityData(client);
      },
      onError,
    }),
    startBackfill: useMutation({
      mutationFn: (restart: boolean) => api.post<StravaStatusDTO>("/strava/backfill", { restart }),
      onSuccess: (status) => {
        update(status);
        void client.invalidateQueries({ queryKey: ["stats"] });
      },
      onError,
    }),
    continueBackfill: useMutation({
      mutationFn: () => api.post<StravaStatusDTO>("/strava/backfill/continue"),
      onSuccess: (status) => {
        update(status);
        void client.invalidateQueries({ queryKey: ["stats"] });
      },
    }),
  };
}
