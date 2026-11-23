import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Download, Ellipsis, Layers, List, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ActivityDTO, SessionDTO } from "../../shared/api";
import { addDays, type Day, diffDays, isDay, weekDays, weekStart as mondayOf } from "../../shared/days";
import { useActivitySync } from "../api/activity";
import { useWeek } from "../api/training";
import { BarButton, NavBar } from "../components/NavBar";
import { PullToRefresh } from "../components/PullToRefresh";
import { ActionSheet } from "../components/Sheet";
import { Spinner } from "../components/ui";
import { formatDay, weekdayNarrow } from "../lib/dates";
import { usePersistentState } from "../lib/usePersistentState";
import { useToday } from "../lib/useToday";
import { AddSessionSheet } from "./AddSessionSheet";
import { UnplannedActivitySheet } from "./LinkSheets";
import { LoadWeekTemplateSheet, SaveWeekTemplateSheet, weekLabel } from "./WeekTemplateSheets";
import { WeekList } from "./WeekList";

type Overlay = { kind: "add"; day: Day } | { kind: "unplanned"; activity: ActivityDTO } | { kind: "menu" } | { kind: "load" } | { kind: "save" } | null;

/** Plan tab: training calendar for one week, as a to-do list grouped by day. */
export function PlanPage() {
  const today = useToday();
  const navigate = useNavigate();
  const client = useQueryClient();
  const sync = useActivitySync();
  const [params, setParams] = useSearchParams();
  const currentWeek = mondayOf(today);
  const requested = params.get("week");
  const start = isDay(requested) ? mondayOf(requested) : currentWeek;
  const [mode, setMode] = usePersistentState("plan.mode", "week", ["week", "day"] as const);
  const [selectedDay, setSelectedDay] = useState<Day>(today);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const week = useWeek(start);
  const days = weekDays(start);
  const offset = Math.round(diffDays(currentWeek, start) / 7);
  const visibleDays = mode === "day" ? [days.includes(selectedDay) ? selectedDay : days[0]] : days;

  const title = offset === 0 ? "This Week" : offset === 1 ? "Next Week" : offset === -1 ? "Last Week" : weekLabel(start);
  const showingToday = offset === 0 && (mode === "week" || selectedDay === today);

  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  const changeWeek = (delta: number) => {
    setSlide(delta > 0 ? "next" : "prev");
    setParams(delta === -offset ? {} : { week: addDays(start, 7 * delta) }, { replace: true });
    setSelectedDay((day) => addDays(day, 7 * delta));
  };
  const goToToday = () => {
    if (offset !== 0) setSlide(offset > 0 ? "prev" : "next");
    setParams({}, { replace: true });
    setSelectedDay(today);
    window.scrollTo({ top: 0 });
  };

  // Bring today into view when opening the current week.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || mode !== "week" || offset !== 0 || !week.data) return;
    scrolled.current = true;
    if (window.scrollY < 10 && today !== days[0]) document.getElementById(`day-${today}`)?.scrollIntoView({ block: "start" });
  }, [mode, offset, week.data, today, days]);

  const select = (day: Day) => {
    setSelectedDay(day);
    if (mode === "week") document.getElementById(`day-${day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const daySessions = (day: Day): SessionDTO[] => (week.data?.sessions ?? []).filter((s) => s.day === day).sort((a, b) => a.position - b.position);

  return (
    <div className="page">
      <NavBar
        title={title}
        leading={
          !showingToday && (
            <BarButton onClick={goToToday}>Today</BarButton>
          )
        }
        trailing={
          <>
            <BarButton onClick={() => setMode(mode === "week" ? "day" : "week")} label={mode === "week" ? "Show day" : "Show week"}>
              {mode === "week" ? <List size={24} /> : <CalendarDays size={24} />}
            </BarButton>
            <BarButton onClick={() => setOverlay({ kind: "menu" })} label="More">
              <Ellipsis size={24} />
            </BarButton>
          </>
        }
        bottom={
          <WeekStrip
            days={days}
            today={today}
            selected={mode === "day" ? visibleDays[0] : null}
            progress={(day) => {
              const list = daySessions(day).filter((s) => s.sport !== "rest");
              return [list.filter((s) => s.status === "done").length, list.length];
            }}
            onSelect={select}
            onSwipe={changeWeek}
            slide={slide}
            weekKey={start}
          />
        }
      />
      <PullToRefresh
        onRefresh={async () => {
          await sync().catch(() => {});
          await client.invalidateQueries({ queryKey: ["plan"] });
        }}
      >
        <div key={start} className={`page-content week-slide ${slide ?? ""}`} style={{ paddingTop: 16 }}>
          {week.isPending ? (
            <div className="empty-state">
              <Spinner />
            </div>
          ) : week.data ? (
            <WeekList
              weekStart={start}
              days={visibleDays}
              today={today}
              data={week.data}
              onAdd={(day) => setOverlay({ kind: "add", day })}
              onUnplanned={(activity) => setOverlay({ kind: "unplanned", activity })}
            />
          ) : (
            <div className="empty-state">
              <span className="secondary">Couldn't load this week.</span>
              <button type="button" className="accent" onClick={() => void week.refetch()}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </PullToRefresh>

      {overlay?.kind === "add" && <AddSessionSheet day={overlay.day} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "unplanned" && (
        <UnplannedActivitySheet activity={overlay.activity} sessions={daySessions(overlay.activity.day)} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === "load" && <LoadWeekTemplateSheet initialWeekStart={start} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "save" && <SaveWeekTemplateSheet weekStart={start} sessionCount={week.data?.sessions.length ?? 0} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "menu" && (
        <ActionSheet
          onClose={() => setOverlay(null)}
          actions={[
            { label: "Workout Library", icon: <BookOpen size={20} />, onSelect: () => navigate("/plan/library") },
            { label: "Load Template into Week…", icon: <Download size={20} />, onSelect: () => setOverlay({ kind: "load" }) },
            { label: "Save Week as Template…", icon: <Upload size={20} />, onSelect: () => setOverlay({ kind: "save" }) },
            { label: "Manage Templates", icon: <Layers size={20} />, onSelect: () => navigate("/plan/templates") },
          ]}
        />
      )}
    </div>
  );
}

/** Mon–Sun with today highlighted and completion dots. Swipe to change week (follows the finger). */
function WeekStrip({
  days,
  today,
  selected,
  progress,
  onSelect,
  onSwipe,
  slide,
  weekKey,
}: {
  days: Day[];
  today: Day;
  selected: Day | null;
  progress: (day: Day) => [number, number];
  onSelect: (day: Day) => void;
  onSwipe: (delta: number) => void;
  slide: "next" | "prev" | null;
  weekKey: Day;
}) {
  const gesture = useRef<{ x: number; y: number; id: number; axis: "x" | "y" | null } | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  const end = (event: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== "x") {
      setDx(0);
      return;
    }
    const distance = event.clientX - g.x;
    setDx(0);
    if (Math.abs(distance) > 50) {
      swiped.current = true;
      onSwipe(distance < 0 ? 1 : -1);
    }
  };
  return (
    <div
      className="week-strip-wrap"
      onPointerDown={(event) => {
        gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId, axis: null };
        swiped.current = false;
      }}
      onPointerMove={(event) => {
        const g = gesture.current;
        if (!g || g.id !== event.pointerId) return;
        const mx = event.clientX - g.x;
        const my = event.clientY - g.y;
        if (g.axis === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
          g.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
          if (g.axis === "x") (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        }
        if (g.axis === "x") setDx(mx);
      }}
      onPointerUp={end}
      onPointerCancel={() => {
        gesture.current = null;
        setDx(0);
      }}
    >
      <div
        key={weekKey}
        className={`week-strip week-slide ${dx === 0 ? (slide ?? "") : "dragging"}`}
        style={dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(1 - Math.abs(dx) / 400, 0.4) } : undefined}
      >
        {days.map((day) => {
          const [done, total] = progress(day);
          return (
            <button
              key={day}
              type="button"
              className={`week-day ${day === today ? "today" : ""} ${day === selected ? "selected" : ""}`}
              aria-label={`${formatDay(day, { weekday: "long", day: "numeric", month: "long" })}, ${done} of ${total} done`}
              onClick={() => {
                if (!swiped.current) onSelect(day);
              }}
            >
              <span className="weekday">{weekdayNarrow(day)}</span>
              <span className="date">{Number(day.slice(8))}</span>
              <span className="week-dots">
                {Array.from({ length: Math.min(total, 3) }, (_, i) => (
                  <span key={i} className={i < done ? "done" : ""} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
