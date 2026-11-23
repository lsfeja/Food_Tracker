import { BookOpen, Circle, CircleCheck, Copy, Ellipsis, FastForward, Link2, Plus, Timer, Trash2, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ActivityDTO, SessionDTO } from "../../shared/api";
import { lastPerformance, type ExerciseRecord } from "../../shared/exerciseHistory";
import * as Format from "../../shared/format";
import { newRecords, recordTitle, sessionCounts, type StrengthSessionSnapshot } from "../../shared/stats/strength";
import {
  detailsSummary,
  displayTitle,
  doneSetCount,
  type EnduranceDetails,
  type ExerciseSet,
  intensityLabel,
  newSet,
  plannedMinutes,
  setCount,
  sportInfo,
  stepSummary,
  type StrengthDetails,
} from "../../shared/workout";
import {
  useDeleteSession,
  useDuplicateSession,
  useSaveDetails,
  useSaveToLibrary,
  useSessionDetail,
  useSetStatus,
  useStrengthSessions,
  useUnlinkSession,
  useUpdateSessionContent,
} from "../api/training";
import { BackButton, BarButton, NavBar } from "../components/NavBar";
import { ActionSheet } from "../components/Sheet";
import { useToast } from "../components/Toast";
import { EmptyState, LabeledRow, Row, Section, Spinner } from "../components/ui";
import { dayMonth, formatDay, formatTime } from "../lib/dates";
import { ContentEditorSheet } from "./editor/ContentEditor";
import { OptionalNumber } from "./editor/fields";
import { LinkActivitySheet } from "./LinkSheets";
import { SportIcon } from "./sports";

type Overlay = "menu" | "edit" | "delete" | "link" | null;

export function SessionDetailPage() {
  const { id = "" } = useParams();
  const detail = useSessionDetail(id);
  if (detail.isPending) {
    return (
      <div className="page">
        <NavBar title="" leading={<BackButton label="Plan" fallback="/plan" />} />
        <div className="empty-state">
          <Spinner />
        </div>
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="page">
        <NavBar title="" leading={<BackButton label="Plan" fallback="/plan" />} />
        <EmptyState title="This session no longer exists." />
      </div>
    );
  }
  return <SessionDetail key={id} data={detail.data} />;
}

function SessionDetail({ data }: { data: NonNullable<ReturnType<typeof useSessionDetail>["data"]> }) {
  const { session, dayActivities, linkedActivity, otherLinkedKeys } = data;
  const navigate = useNavigate();
  const toast = useToast();
  const setStatus = useSetStatus();
  const saveDetails = useSaveDetails();
  const updateContent = useUpdateSessionContent();
  const duplicate = useDuplicateSession();
  const remove = useDeleteSession();
  const saveToLibrary = useSaveToLibrary();
  const strength = useStrengthSessions();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);

  // Set tracking: local copy, saved debounced (keeps typing smooth).
  const [details, setDetails] = useState(session.details);
  const pending = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDetails(session.details);
  }, [session.details]);

  const flush = useCallback(
    (next = details) => {
      window.clearTimeout(pending.current);
      if (!dirty.current) return;
      dirty.current = false;
      saveDetails.mutate({ id: session.id, details: next });
    },
    [details, saveDetails, session.id],
  );
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flushRef.current();
    };
  }, []);

  const changeDetails = (next: StrengthDetails, immediate = false) => {
    setDetails(next);
    dirty.current = true;
    window.clearTimeout(pending.current);
    if (immediate) flush(next);
    else pending.current = window.setTimeout(() => flush(next), 800);
    // All sets ticked off → the session is done.
    if (session.status === "planned" && setCount(next) > 0 && doneSetCount(next) === setCount(next)) {
      setStatus.mutate({ session, status: "done" });
    }
  };

  const records: ExerciseRecord[] = useMemo(
    () =>
      (strength.data ?? [])
        .filter((s) => sessionCounts({ id: s.id, day: s.day, isDone: s.status === "done", workout: s.details }))
        .map((s) => ({ sessionId: s.id, day: s.day, workout: s.details })),
    [strength.data],
  );

  const prs = useMemo(() => {
    if (details.kind !== "strength" || session.status !== "done") return [];
    const previous: StrengthSessionSnapshot[] = (strength.data ?? []).map((s) => ({ id: s.id, day: s.day, isDone: s.status === "done", workout: s.details }));
    return newRecords({ id: session.id, day: session.day, isDone: true, workout: details }, previous);
  }, [details, session, strength.data]);

  const isDone = session.status === "done";

  return (
    <div className="page">
      <NavBar
        title={displayTitle(session)}
        leading={<BackButton label="Plan" fallback="/plan" />}
        trailing={
          <>
            <BarButton onClick={() => setOverlay("edit")}>Edit</BarButton>
            <BarButton onClick={() => setOverlay("menu")} label="More">
              <Ellipsis size={24} />
            </BarButton>
          </>
        }
      />
      <div className="page-content" style={{ paddingTop: 16 }}>
        <Section>
          <div className="list-row" style={{ alignItems: "flex-start" }}>
            <span className="row-icon" style={{ paddingTop: 3 }}>
              <SportIcon sport={session.sport} size={24} />
            </span>
            <div className="grow stack" style={{ gap: 3 }}>
              <span className="title3">{displayTitle(session)}</span>
              <span className="subheadline secondary">
                {sportInfo[session.sport].name} · {formatDay(session.day, { weekday: "long", day: "numeric", month: "long" })}
              </span>
              {detailsSummary(details) && <span className="footnote secondary">{detailsSummary(details)}</span>}
              {session.status === "skipped" && <span className="footnote secondary">Skipped</span>}
            </div>
          </div>
          <Row className="centered" onClick={() => setStatus.mutate({ session, status: isDone ? "planned" : "done" })}>
            <span className="row headline" style={{ gap: 8, color: isDone ? "var(--accent)" : undefined }}>
              {isDone ? <CircleCheck size={22} /> : <Circle size={22} />}
              {isDone ? "Done" : "Mark as Done"}
            </span>
          </Row>
        </Section>

        {prs.length > 0 && (
          <Section header="New Personal Records">
            {prs.map((record) => (
              <div key={`${record.key}-${record.kind}`} className="list-row pr-row">
                <Trophy size={20} />
                <span className="grow">
                  {record.exercise} <span className="secondary">· {recordTitle(record.kind)}</span>
                </span>
                <span className="semibold tabular">{Format.weight(record.value)} kg</span>
              </div>
            ))}
          </Section>
        )}

        <LinkedActivitySection session={session} linked={linkedActivity} dayActivities={dayActivities} onLink={() => setOverlay("link")} />

        {details.kind === "strength" && (
          <StrengthTracking
            workout={details}
            session={session}
            records={records}
            onChange={changeDetails}
            onSetCompleted={(rest) => rest > 0 && setRestEnd(Date.now() + rest * 1000)}
          />
        )}
        {details.kind === "endurance" && <EndurancePlan workout={details} />}
        {details.kind === "general" && (
          <>
            {details.durationMinutes !== null && (
              <Section>
                <LabeledRow label="Duration" value={Format.duration(details.durationMinutes)} />
              </Section>
            )}
            <Section header="Notes">
              <div className="list-row" style={{ whiteSpace: "pre-wrap" }}>
                {details.notes || <span className="secondary">No notes. Tap Edit to add some.</span>}
              </div>
            </Section>
          </>
        )}
        {restEnd && <div style={{ height: 80 }} />}
      </div>

      {restEnd && <RestTimer end={restEnd} onFinish={() => setRestEnd(null)} />}

      {overlay === "edit" && (
        <ContentEditorSheet
          title="Edit Session"
          initial={{ sport: session.sport, title: session.title, details }}
          onClose={() => setOverlay(null)}
          onSave={async (content) => {
            dirty.current = false;
            window.clearTimeout(pending.current);
            await updateContent.mutateAsync({ id: session.id, content });
            setDetails(content.details);
            setOverlay(null);
          }}
        />
      )}
      {overlay === "link" && (
        <LinkActivitySheet session={session} activities={dayActivities} takenKeys={otherLinkedKeys} onClose={() => setOverlay(null)} />
      )}
      {overlay === "menu" && (
        <ActionSheet
          onClose={() => setOverlay(null)}
          actions={[
            {
              label: session.status === "skipped" ? "Unskip" : "Skip",
              icon: <FastForward size={20} />,
              onSelect: () => setStatus.mutate({ session, status: session.status === "skipped" ? "planned" : "skipped" }),
            },
            {
              label: "Duplicate",
              icon: <Copy size={20} />,
              onSelect: () => duplicate.mutate(session.id, { onSuccess: () => toast("Session duplicated.") }),
            },
            {
              label: "Save to Library",
              icon: <BookOpen size={20} />,
              onSelect: () =>
                saveToLibrary.mutate({ sport: session.sport, title: displayTitle(session), details }, { onSuccess: () => toast("Saved to the workout library.") }),
            },
            { label: "Delete", icon: <Trash2 size={20} />, destructive: true, onSelect: () => setOverlay("delete") },
          ]}
        />
      )}
      {overlay === "delete" && (
        <ActionSheet
          title="Delete this session?"
          onClose={() => setOverlay(null)}
          actions={[
            {
              label: "Delete",
              destructive: true,
              onSelect: () => {
                dirty.current = false;
                remove.mutate(session.id);
                navigate(-1);
              },
            },
          ]}
        />
      )}
    </div>
  );
}

// MARK: Linked activity

function LinkedActivitySection({
  session,
  linked,
  dayActivities,
  onLink,
}: {
  session: SessionDTO;
  linked: ActivityDTO | null;
  dayActivities: ActivityDTO[];
  onLink: () => void;
}) {
  const unlink = useUnlinkSession();
  if (!linked) {
    if (!sportInfo[session.sport].matchGroup && dayActivities.length === 0) return null;
    return (
      <Section
        footer={
          dayActivities.length === 0 ? "No activities on this day yet. They are matched automatically after a Strava sync." : `${dayActivities.length === 1 ? "1 activity" : `${dayActivities.length} activities`} on this day.`
        }
      >
        <Row className="action" onClick={onLink} disabled={dayActivities.length === 0}>
          <Link2 size={20} /> <span className="row-title">Link Activity…</span>
        </Row>
      </Section>
    );
  }
  const planned = session.details;
  const plannedMin = plannedMinutes(planned);
  const plannedKm = planned.kind === "endurance" ? planned.distanceKm : null;
  return (
    <Section header="Actual">
      <div className="list-row stack" style={{ alignItems: "flex-start", gap: 2 }}>
        <span className="semibold">{linked.name}</span>
        <span className="footnote secondary">
          Strava · {formatTime(linked.startAt)}
          {session.linkManual ? " · linked manually" : ""}
        </span>
      </div>
      <Comparison title="Duration" actual={Format.duration(linked.durationS / 60)} planned={plannedMin !== null ? Format.duration(plannedMin) : null} />
      {linked.distanceM > 0 && <Comparison title="Distance" actual={Format.distance(linked.distanceM / 1000)} planned={plannedKm !== null ? Format.distance(plannedKm) : null} />}
      {linked.elevationM > 0 && <LabeledRow label="Elevation" value={`${Format.kcal(linked.elevationM)} m`} />}
      <LabeledRow label="Calories" value={`${linked.kcalEstimated ? "~" : ""}${Format.kcal(linked.activeKcal)} kcal`} />
      <Row className="destructive" onClick={() => unlink.mutate(session.id)} disabled={unlink.isPending}>
        Unlink Activity
      </Row>
    </Section>
  );
}

function Comparison({ title, actual, planned }: { title: string; actual: string; planned: string | null }) {
  return (
    <div className="list-row">
      <span className="grow">{title}</span>
      <span className="stack tabular" style={{ alignItems: "flex-end" }}>
        <span>{actual}</span>
        {planned && <span className="caption secondary">plan {planned}</span>}
      </span>
    </div>
  );
}

// MARK: Strength

function StrengthTracking({
  workout,
  session,
  records,
  onChange,
  onSetCompleted,
}: {
  workout: StrengthDetails;
  session: SessionDTO;
  records: ExerciseRecord[];
  onChange: (next: StrengthDetails, immediate?: boolean) => void;
  onSetCompleted: (restSeconds: number) => void;
}) {
  if (!workout.exercises.length) {
    return (
      <Section>
        <div className="list-row secondary">No exercises yet. Tap Edit to add some.</div>
      </Section>
    );
  }
  const updateSet = (exerciseIndex: number, setIndex: number, set: ExerciseSet, immediate = false) =>
    onChange(
      {
        ...workout,
        exercises: workout.exercises.map((e, i) => (i === exerciseIndex ? { ...e, sets: e.sets.map((s, j) => (j === setIndex ? set : s)) } : e)),
      },
      immediate,
    );

  return (
    <>
      {workout.exercises.map((exercise, exerciseIndex) => {
        const last = lastPerformance(exercise.name, session.day, session.id, records);
        const done = exercise.sets.filter((s) => s.isDone).length;
        return (
          <Section
            key={exercise.id}
            header={
              <>
                <span style={{ textTransform: "none" }} className="semibold">
                  {exercise.name || "Exercise"}
                </span>
                <span className="spacer" />
                {exercise.restSeconds ? (
                  <span className="row" style={{ gap: 3, textTransform: "none" }}>
                    <Timer size={13} /> {exercise.restSeconds} s
                  </span>
                ) : null}
                <span className="tabular">
                  {done}/{exercise.sets.length}
                </span>
              </>
            }
            footer={
              <>
                {last && (
                  <span>
                    Last: {last.summary} ({dayMonth(last.day)})
                  </span>
                )}
                {exercise.notes && <div style={{ whiteSpace: "pre-wrap" }}>{exercise.notes}</div>}
              </>
            }
          >
            {exercise.sets.map((set, setIndex) => (
              <SetRow
                key={set.id}
                number={setIndex + 1}
                set={set}
                onChange={(next, immediate) => updateSet(exerciseIndex, setIndex, next, immediate)}
                onCompleted={() => onSetCompleted(exercise.restSeconds ?? 0)}
              />
            ))}
            <Row
              className="action"
              onClick={() => {
                const lastSet = exercise.sets[exercise.sets.length - 1];
                onChange(
                  {
                    ...workout,
                    exercises: workout.exercises.map((e, i) =>
                      i === exerciseIndex ? { ...e, sets: [...e.sets, newSet(lastSet?.plannedReps ?? 8, lastSet?.plannedWeight ?? null)] } : e,
                    ),
                  },
                  true,
                );
              }}
            >
              <Plus size={20} /> <span className="row-title">Add Set</span>
            </Row>
          </Section>
        );
      })}
      {workout.notes && (
        <Section header="Notes">
          <div className="list-row" style={{ whiteSpace: "pre-wrap" }}>
            {workout.notes}
          </div>
        </Section>
      )}
    </>
  );
}

function SetRow({ number, set, onChange, onCompleted }: { number: number; set: ExerciseSet; onChange: (set: ExerciseSet, immediate?: boolean) => void; onCompleted: () => void }) {
  const planned = set.plannedWeight !== null ? `${set.plannedReps ?? "–"} × ${Format.weight(set.plannedWeight)} kg` : `${set.plannedReps ?? "–"} reps`;
  const toggle = () => {
    if (set.isDone) {
      onChange({ ...set, isDone: false }, true);
      return;
    }
    // Untouched fields mean "as planned".
    onChange({ ...set, isDone: true, actualReps: set.actualReps ?? set.plannedReps, actualWeight: set.actualWeight ?? set.plannedWeight }, true);
    navigator.vibrate?.(10);
    onCompleted();
  };
  return (
    <div className="list-row compact set-row" style={{ gap: 8 }}>
      <span className="set-number">{number}</span>
      <span className="footnote secondary grow truncate">{planned}</span>
      <OptionalNumber
        narrow
        maxFraction={0}
        label={`Set ${number} reps`}
        placeholder={set.plannedReps !== null ? String(set.plannedReps) : "reps"}
        value={set.actualReps}
        onChange={(actualReps) => onChange({ ...set, actualReps })}
      />
      <span className="secondary">×</span>
      <OptionalNumber
        maxFraction={2}
        label={`Set ${number} weight`}
        placeholder={set.plannedWeight !== null ? Format.weight(set.plannedWeight) : "kg"}
        value={set.actualWeight}
        onChange={(actualWeight) => onChange({ ...set, actualWeight })}
      />
      <button type="button" className={`check-button ${set.isDone ? "done" : ""}`} aria-label={set.isDone ? `Set ${number} done` : `Complete set ${number}`} onClick={toggle}>
        {set.isDone ? <CircleCheck size={26} strokeWidth={2.4} /> : <Circle size={26} strokeWidth={1.8} />}
      </button>
    </div>
  );
}

function RestTimer({ end, onFinish }: { end: number; onFinish: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((end - now) / 1000));
  useEffect(() => {
    if (remaining === 0) {
      navigator.vibrate?.([80, 60, 80]);
      onFinish();
    }
  }, [remaining, onFinish]);
  return (
    <div className="rest-banner" role="timer" aria-live="polite">
      <Timer size={22} className="accent" />
      <span className="grow">Rest</span>
      <span className="title3 tabular">
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </span>
      <button type="button" className="accent semibold" onClick={onFinish}>
        Skip
      </button>
    </div>
  );
}

// MARK: Endurance

function EndurancePlan({ workout }: { workout: EnduranceDetails }) {
  const minutes = plannedMinutes(workout);
  const hasTargets = minutes !== null || workout.distanceKm !== null || workout.intensity !== null;
  return (
    <>
      <Section header="Plan">
        {!hasTargets && <div className="list-row secondary">No targets set. Tap Edit to add duration, distance or intensity.</div>}
        {minutes !== null && <LabeledRow label="Duration" value={Format.duration(minutes)} />}
        {workout.distanceKm !== null && <LabeledRow label="Distance" value={Format.distance(workout.distanceKm)} />}
        {workout.intensity && <LabeledRow label="Intensity" value={intensityLabel(workout.intensity)} />}
      </Section>
      {workout.blocks.length > 0 && (
        <Section header="Intervals">
          {workout.blocks.map((block) => (
            <div key={block.id} className="list-row">
              <span className="semibold tabular" style={{ minWidth: 28 }}>
                {block.repeats}×
              </span>
              <span className="grow stack" style={{ gap: 2 }}>
                {block.steps.map((step) => {
                  const values = stepSummary(step);
                  return (
                    <span key={step.id}>
                      {step.label && values !== step.label ? (
                        <>
                          {step.label} <span className="secondary">· {values}</span>
                        </>
                      ) : (
                        values
                      )}
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </Section>
      )}
      {workout.notes && (
        <Section header="Notes">
          <div className="list-row" style={{ whiteSpace: "pre-wrap" }}>
            {workout.notes}
          </div>
        </Section>
      )}
    </>
  );
}
