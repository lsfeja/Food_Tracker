import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActivityDTO, PlanWeekDTO, SessionDTO } from "../../shared/api";
import type { Day } from "../../shared/days";
import { useDeleteSession, useDuplicateSession, useMoveSession, useSetStatus } from "../api/training";
import { SwipeRow } from "../components/SwipeRow";
import { Row } from "../components/ui";
import { formatDay } from "../lib/dates";
import { SessionRowContent, UnplannedRowContent } from "./SessionRow";

interface Props {
  weekStart: Day;
  days: Day[];
  today: Day;
  data: PlanWeekDTO;
  onAdd: (day: Day) => void;
  onUnplanned: (activity: ActivityDTO) => void;
}

/** Day sections of one week. Long-press a session to drag it to another position or day. */
export function WeekList({ weekStart, days, today, data, onAdd, onUnplanned }: Props) {
  const move = useMoveSession(weekStart);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<Day | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sessions = [...data.sessions].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.position - b.position));
  const linkedKeys = new Set(sessions.map((s) => s.linkedActivityKey).filter((k): k is string => k !== null));
  const byKey = new Map(data.activities.map((a) => [a.key, a]));
  const active = sessions.find((s) => s.id === activeId) ?? null;

  const dayOf = (id: string): Day | null => (id.startsWith("day:") ? id.slice(4) : (sessions.find((s) => s.id === id)?.day ?? null));

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    navigator.vibrate?.(10);
  };
  const onDragOver = (event: DragOverEvent) => setOverDay(event.over ? dayOf(String(event.over.id)) : null);
  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverDay(null);
    const { active: dragged, over } = event;
    if (!over) return;
    const id = String(dragged.id);
    const overId = String(over.id);
    const session = sessions.find((s) => s.id === id);
    if (!session || overId === id) return;
    if (overId.startsWith("day:")) {
      const day = overId.slice(4);
      if (day === session.day && sessions.filter((s) => s.day === day).at(-1)?.id === id) return;
      move.mutate({ id, day, before: null });
      return;
    }
    const target = sessions.find((s) => s.id === overId);
    if (!target) return;
    if (target.day === session.day) {
      const ids = sessions.filter((s) => s.day === target.day).map((s) => s.id);
      const moved = arrayMove(ids, ids.indexOf(id), ids.indexOf(target.id));
      move.mutate({ id, day: target.day, before: moved[moved.indexOf(id) + 1] ?? null });
    } else {
      move.mutate({ id, day: target.day, before: target.id });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverDay(null);
      }}
    >
      {days.map((day) => (
        <DaySection
          key={day}
          day={day}
          today={today}
          sessions={sessions.filter((s) => s.day === day)}
          unplanned={data.activities.filter((a) => a.day === day && !linkedKeys.has(a.key))}
          byKey={byKey}
          isDropTarget={activeId !== null && overDay === day && active?.day !== day}
          onAdd={() => onAdd(day)}
          onUnplanned={onUnplanned}
        />
      ))}
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="drag-overlay">
            <Row>
              <SessionRowContent session={active} linked={active.linkedActivityKey ? (byKey.get(active.linkedActivityKey) ?? null) : null} onToggle={() => {}} />
            </Row>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function DaySection({
  day,
  today,
  sessions,
  unplanned,
  byKey,
  isDropTarget,
  onAdd,
  onUnplanned,
}: {
  day: Day;
  today: Day;
  sessions: SessionDTO[];
  unplanned: ActivityDTO[];
  byKey: Map<string, ActivityDTO>;
  isDropTarget: boolean;
  onAdd: () => void;
  onUnplanned: (activity: ActivityDTO) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `day:${day}` });
  const isToday = day === today;
  return (
    <section ref={setNodeRef} id={`day-${day}`} className={`section day-section ${isDropTarget ? "drop-target" : ""}`} style={{ scrollMarginTop: 130 }}>
      <div className={`day-header ${isToday ? "today" : ""}`}>
        {isToday && <span>Today</span>}
        <span>{formatDay(day, { weekday: "long", day: "numeric", month: "short" })}</span>
        <span className="spacer" />
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add session on ${formatDay(day, { weekday: "long" })}`}
          style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Plus size={17} strokeWidth={3} />
        </button>
      </div>
      <div className="card">
        <SortableContext items={sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sessions.map((session) => (
            <SortableSession key={session.id} session={session} linked={session.linkedActivityKey ? (byKey.get(session.linkedActivityKey) ?? null) : null} />
          ))}
        </SortableContext>
        {unplanned.map((activity) => (
          <Row key={activity.key} onClick={() => onUnplanned(activity)}>
            <UnplannedRowContent activity={activity} />
          </Row>
        ))}
        {sessions.length === 0 && unplanned.length === 0 && <div className="list-row subheadline tertiary">Nothing planned</div>}
      </div>
    </section>
  );
}

function SortableSession({ session, linked }: { session: SessionDTO; linked: ActivityDTO | null }) {
  const navigate = useNavigate();
  const setStatus = useSetStatus();
  const remove = useDeleteSession();
  const duplicate = useDuplicateSession();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id });
  return (
    <div
      ref={setNodeRef}
      className={`session-row swipe-row-wrapper ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition, WebkitTouchCallout: "none", userSelect: "none" }}
      {...attributes}
      {...listeners}
    >
      <SwipeRow
        fullSwipe
        disabled={isDragging}
        actions={[
          { label: "Delete", icon: <Trash2 size={18} />, color: "red", onSelect: () => remove.mutate(session.id) },
          { label: "Duplicate", icon: <Copy size={18} />, color: "gray", onSelect: () => duplicate.mutate(session.id) },
        ]}
      >
        <Row onClick={() => navigate(`/plan/session/${session.id}`)}>
          <SessionRowContent
            session={session}
            linked={linked}
            onToggle={() => {
              const status = session.status === "done" ? "planned" : "done";
              if (status === "done") navigator.vibrate?.(10);
              setStatus.mutate({ session, status });
            }}
          />
        </Row>
      </SwipeRow>
    </div>
  );
}
