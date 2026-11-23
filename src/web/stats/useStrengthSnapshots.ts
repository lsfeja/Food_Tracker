import { useMemo } from "react";
import type { StrengthSessionSnapshot } from "../../shared/stats/strength";
import { useStrengthSessions } from "../api/training";

/** Strength sessions as snapshots (counted when done or with ticked-off sets). */
export function useStrengthSnapshots() {
  const query = useStrengthSessions();
  const snapshots: StrengthSessionSnapshot[] = useMemo(
    () => (query.data ?? []).map((s) => ({ id: s.id, day: s.day, isDone: s.status === "done", workout: s.details })),
    [query.data],
  );
  return { snapshots, isPending: query.isPending };
}
