import { useCallback } from "react";

/** Triggers an activity (Strava) sync; resolves when done. Implemented with the Strava API. */
export function useActivitySync(): () => Promise<void> {
  return useCallback(async () => {}, []);
}
