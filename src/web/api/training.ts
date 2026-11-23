import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActivityDTO, PlanWeekDTO, SessionDTO, WeekTemplateDTO, WorkoutTemplateDTO } from "../../shared/api";
import type { Day } from "../../shared/days";
import type { TemplateSession } from "../../shared/weekPlanner";
import { reorder } from "../../shared/weekPlanner";
import type { SessionStatus, StrengthDetails, WorkoutContent, WorkoutDetails } from "../../shared/workout";
import { useToast } from "../components/Toast";
import { api, errorMessage } from "./client";

export interface SessionDetailDTO {
  session: SessionDTO;
  dayActivities: ActivityDTO[];
  linkedActivity: ActivityDTO | null;
  otherLinkedKeys: string[];
}

export interface StrengthSessionDTO {
  id: string;
  day: Day;
  status: SessionStatus;
  details: StrengthDetails;
}

export const trainingKeys = {
  week: (start: Day) => ["plan", "week", start] as const,
  session: (id: string) => ["plan", "session", id] as const,
  strength: ["plan", "strength"] as const,
  library: ["library"] as const,
  weekTemplates: ["weekTemplates"] as const,
};

/** Everything derived from the calendar (weeks, details, history, stats). */
export function invalidatePlan(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ["plan"] });
  void client.invalidateQueries({ queryKey: ["stats"] });
}

export const useWeek = (start: Day) => useQuery({ queryKey: trainingKeys.week(start), queryFn: () => api.get<PlanWeekDTO>(`/plan/week/${start}`) });

export const useSessionDetail = (id: string) =>
  useQuery({ queryKey: trainingKeys.session(id), queryFn: () => api.get<SessionDetailDTO>(`/sessions/${id}`) });

export const useStrengthSessions = () =>
  useQuery({ queryKey: trainingKeys.strength, queryFn: () => api.get<StrengthSessionDTO[]>("/strength-sessions"), staleTime: 60_000 });

export const useLibrary = () => useQuery({ queryKey: trainingKeys.library, queryFn: () => api.get<WorkoutTemplateDTO[]>("/library") });

export const useWeekTemplates = () => useQuery({ queryKey: trainingKeys.weekTemplates, queryFn: () => api.get<WeekTemplateDTO[]>("/week-templates") });

/** Generic mutation that invalidates the plan and reports errors as a toast. */
function usePlanMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>, extra?: (client: QueryClient) => void) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onError: (error) => toast(errorMessage(error)),
    onSettled: () => {
      invalidatePlan(client);
      extra?.(client);
    },
  });
}

export const useAddSession = () =>
  usePlanMutation((input: { day: Day; content: WorkoutContent; templateId?: string | null }) => api.post<SessionDTO>("/sessions", input));

export const useUpdateSessionContent = () =>
  usePlanMutation(({ id, content }: { id: string; content: WorkoutContent }) => api.patch<SessionDTO>(`/sessions/${id}`, { content }));

export const useDeleteSession = () => usePlanMutation((id: string) => api.delete(`/sessions/${id}`));

export const useDuplicateSession = () => usePlanMutation((id: string) => api.post<SessionDTO>(`/sessions/${id}/duplicate`));

export const useLinkSession = () =>
  usePlanMutation(({ id, activityKey }: { id: string; activityKey: string }) => api.post<SessionDTO>(`/sessions/${id}/link`, { activityKey }));

export const useUnlinkSession = () => usePlanMutation((id: string) => api.post<SessionDTO>(`/sessions/${id}/unlink`));

export const useSessionFromActivity = () =>
  usePlanMutation((key: string) => api.post<SessionDTO>(`/activities/${encodeURIComponent(key)}/session`));

/** Status change with an optimistic update of every cached week containing the session. */
export function useSetStatus() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ session, status }: { session: SessionDTO; status: SessionStatus }) => api.patch<SessionDTO>(`/sessions/${session.id}`, { status }),
    onMutate: ({ session, status }) => {
      const update = (s: SessionDTO): SessionDTO =>
        s.id === session.id ? { ...s, status, completedAt: status === "done" ? Date.now() : null, completedByLink: false } : s;
      client.setQueriesData<PlanWeekDTO>({ queryKey: ["plan", "week"] }, (week) => (week ? { ...week, sessions: week.sessions.map(update) } : week));
      client.setQueryData<SessionDetailDTO>(trainingKeys.session(session.id), (detail) => (detail ? { ...detail, session: update(detail.session) } : detail));
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: () => invalidatePlan(client),
  });
}

/** Moves a session (drag & drop) with an optimistic reorder of the cached week. */
export function useMoveSession(weekStart: Day) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, day, before }: { id: string; day: Day; before: string | null }) => api.post<SessionDTO>(`/sessions/${id}/move`, { day, before }),
    onMutate: async ({ id, day, before }) => {
      await client.cancelQueries({ queryKey: trainingKeys.week(weekStart) });
      const previous = client.getQueryData<PlanWeekDTO>(trainingKeys.week(weekStart));
      if (previous) {
        const moving = previous.sessions.find((s) => s.id === id);
        if (moving) {
          const target = previous.sessions.filter((s) => s.day === day && s.id !== id).sort((a, b) => a.position - b.position);
          const order = reorder([...target.map((s) => s.id), id], id, before);
          const sessions = previous.sessions.map((s) => {
            if (s.id === id) return { ...s, day, position: order.indexOf(id) };
            if (s.day === day) return { ...s, position: order.indexOf(s.id) };
            return s;
          });
          // Close the gap on the old day.
          const oldDay = sessions.filter((s) => s.day === moving.day && moving.day !== day).sort((a, b) => a.position - b.position);
          const renumbered = sessions.map((s) => (oldDay.includes(s) ? { ...s, position: oldDay.indexOf(s) } : s));
          client.setQueryData<PlanWeekDTO>(trainingKeys.week(weekStart), { ...previous, sessions: renumbered });
        }
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) client.setQueryData(trainingKeys.week(weekStart), context.previous);
      toast(errorMessage(error));
    },
    onSettled: () => invalidatePlan(client),
  });
}

/** Saves set tracking (details only). */
export function useSaveDetails() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, details }: { id: string; details: WorkoutDetails }) => api.patch<SessionDTO>(`/sessions/${id}`, { details }),
    onSuccess: (session) => {
      client.setQueryData<SessionDetailDTO>(trainingKeys.session(session.id), (detail) => (detail ? { ...detail, session } : detail));
      void client.invalidateQueries({ queryKey: ["plan", "week"] });
      void client.invalidateQueries({ queryKey: trainingKeys.strength });
      void client.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error) => toast(errorMessage(error)),
  });
}

// MARK: Library

const invalidateLibrary = (client: QueryClient) => void client.invalidateQueries({ queryKey: trainingKeys.library });

export const useSaveToLibrary = () => usePlanMutation((content: WorkoutContent) => api.post<WorkoutTemplateDTO>("/library", { content }), invalidateLibrary);

export const useUpdateLibraryItem = () =>
  usePlanMutation(({ id, content }: { id: string; content: WorkoutContent }) => api.put<WorkoutTemplateDTO>(`/library/${id}`, { content }), invalidateLibrary);

export const useDuplicateLibraryItem = () => usePlanMutation((id: string) => api.post<WorkoutTemplateDTO>(`/library/${id}/duplicate`), invalidateLibrary);

export const useDeleteLibraryItem = () => usePlanMutation((id: string) => api.delete(`/library/${id}`), invalidateLibrary);

export const useScheduleLibraryItem = () =>
  usePlanMutation(({ id, day }: { id: string; day: Day }) => api.post<SessionDTO>(`/library/${id}/schedule`, { day }), invalidateLibrary);

// MARK: Week templates

const invalidateTemplates = (client: QueryClient) => void client.invalidateQueries({ queryKey: trainingKeys.weekTemplates });

export const useCreateWeekTemplate = () =>
  usePlanMutation((input: { name: string; sessions: TemplateSession[] }) => api.post<WeekTemplateDTO>("/week-templates", input), invalidateTemplates);

export const useUpdateWeekTemplate = () =>
  usePlanMutation(
    ({ id, name, sessions }: { id: string; name: string; sessions: TemplateSession[] }) => api.put<WeekTemplateDTO>(`/week-templates/${id}`, { name, sessions }),
    invalidateTemplates,
  );

export const useDuplicateWeekTemplate = () => usePlanMutation((id: string) => api.post<WeekTemplateDTO>(`/week-templates/${id}/duplicate`), invalidateTemplates);

export const useDeleteWeekTemplate = () => usePlanMutation((id: string) => api.delete(`/week-templates/${id}`), invalidateTemplates);

export const useSaveWeekAsTemplate = () =>
  usePlanMutation((input: { weekStart: Day; name: string }) => api.post<WeekTemplateDTO>("/week-templates/from-week", input), invalidateTemplates);

export const useApplyWeekTemplate = () =>
  usePlanMutation(({ id, weekStart, mode }: { id: string; weekStart: Day; mode: "add" | "replace" }) =>
    api.post(`/week-templates/${id}/apply`, { weekStart, mode }),
  );
