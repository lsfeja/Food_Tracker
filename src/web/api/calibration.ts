import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalibrationDTO } from "../../shared/api";
import type { Day } from "../../shared/days";
import type { UserSettings } from "../../shared/settings";
import { useToast } from "../components/Toast";
import { api, errorMessage } from "./client";

const key = ["calibrations"] as const;

/** Calibration decisions, newest first. */
export const useCalibrations = () => useQuery({ queryKey: key, queryFn: () => api.get<CalibrationDTO[]>("/calibrations") });

export interface CalibrationDecision {
  day: Day;
  decision: "accepted" | "declined";
  adjustment: number;
  reason: string;
  details: Record<string, unknown>;
}

/** Logs a decision; an accepted one moves the baseline from `day` on. */
export function useDecideCalibration() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (decision: CalibrationDecision) => api.post<{ calibration: CalibrationDTO; settings: UserSettings }>("/calibrations", decision),
    onSuccess: (result) => {
      client.setQueryData(["settings"], result.settings);
      client.setQueryData<CalibrationDTO[]>(key, (list) => [result.calibration, ...(list ?? [])]);
      if (result.calibration.decision === "accepted" && result.calibration.adjustment !== 0) {
        toast(`Base set to ${Math.round(result.calibration.newBaseline)} kcal.`);
      }
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: () => void client.invalidateQueries({ queryKey: key }),
  });
}
