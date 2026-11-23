import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, type Day } from "../../shared/days";
import { displayTitle } from "../../shared/workout";
import { useApplyWeekTemplate, useSaveWeekAsTemplate, useWeekTemplates } from "../api/training";
import { BarButton, NavBar } from "../components/NavBar";
import { Sheet, SheetScroll } from "../components/Sheet";
import { Row, Section, Segmented, Spinner, TextRow } from "../components/ui";
import { dayMonth, formatDay } from "../lib/dates";
import { SportIcon } from "./sports";

export const weekLabel = (start: Day) => `${dayMonth(start)} – ${dayMonth(addDays(start, 6))}`;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayName = (index: number) => WEEKDAYS[index] ?? "";

/** Load a week template into a week, with a preview. */
export function LoadWeekTemplateSheet({ initialWeekStart, onClose }: { initialWeekStart: Day; onClose: () => void }) {
  const templates = useWeekTemplates();
  const apply = useApplyWeekTemplate();
  const [selected, setSelected] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const list = templates.data ?? [];
  const template = list.find((t) => t.id === (selected ?? list[0]?.id));

  return (
    <Sheet onClose={onClose} label="Load week template">
      <NavBar
        inSheet
        title="Load Template"
        leading={<BarButton onClick={onClose}>Cancel</BarButton>}
        trailing={
          <BarButton
            prominent
            disabled={!template || apply.isPending}
            onClick={async () => {
              if (!template) return;
              await apply.mutateAsync({ id: template.id, weekStart, mode });
              onClose();
            }}
          >
            Load
          </BarButton>
        }
      />
      <SheetScroll>
        <Section header="Template">
          {templates.isPending && (
            <div className="list-row">
              <Spinner />
            </div>
          )}
          {templates.isSuccess && list.length === 0 && (
            <div className="list-row footnote secondary">No week templates yet. Save a week as a template or create one under Manage Templates.</div>
          )}
          {list.map((t) => (
            <Row key={t.id} onClick={() => setSelected(t.id)}>
              <div className="grow stack" style={{ gap: 2 }}>
                <span>{t.name}</span>
                <span className="footnote secondary">{t.sessions.length === 1 ? "1 session" : `${t.sessions.length} sessions`}</span>
              </div>
              {template?.id === t.id && <Check size={20} className="accent" />}
            </Row>
          ))}
        </Section>
        <Section header="Week">
          <div className="list-row compact">
            <button type="button" className="icon-button accent" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft size={22} />
            </button>
            <span className="grow center tabular">{weekLabel(weekStart)}</span>
            <button type="button" className="icon-button accent" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight size={22} />
            </button>
          </div>
        </Section>
        <Section
          plain
          footer={
            mode === "add"
              ? "Sessions are added after the ones already planned."
              : "Sessions of this week that aren't done are removed. Completed sessions are kept."
          }
        >
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "add", label: "Add to Week" },
              { value: "replace", label: "Replace Week" },
            ]}
          />
        </Section>
        {template && template.sessions.length > 0 && (
          <Section header="Preview">
            {[...template.sessions]
              .sort((a, b) => a.weekday - b.weekday || a.order - b.order)
              .map((s) => (
                <div key={s.id} className="list-row compact">
                  <span className="row-icon">
                    <SportIcon sport={s.content.sport} />
                  </span>
                  <span className="grow truncate">{displayTitle(s.content)}</span>
                  <span className="footnote secondary">{formatDay(addDays(weekStart, s.weekday), { weekday: "short", day: "numeric" })}</span>
                </div>
              ))}
          </Section>
        )}
      </SheetScroll>
    </Sheet>
  );
}

/** Save the sessions of a week as a template. */
export function SaveWeekTemplateSheet({ weekStart, sessionCount, onClose }: { weekStart: Day; sessionCount: number; onClose: () => void }) {
  const save = useSaveWeekAsTemplate();
  const [name, setName] = useState(`Week of ${dayMonth(weekStart)}`);
  const submit = async () => {
    if (!name.trim() || save.isPending) return;
    await save.mutateAsync({ weekStart, name: name.trim() });
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Save week as template">
      <NavBar
        inSheet
        title="Save Week"
        leading={<BarButton onClick={onClose}>Cancel</BarButton>}
        trailing={
          <BarButton prominent disabled={!name.trim() || save.isPending || sessionCount === 0} onClick={submit}>
            Save
          </BarButton>
        }
      />
      <SheetScroll>
        <Section
          footer={
            sessionCount === 0
              ? "This week has no sessions yet."
              : `${sessionCount === 1 ? "1 session" : `${sessionCount} sessions`} from ${weekLabel(weekStart)}. Progress (done sets, actual values) isn't saved.`
          }
        >
          <TextRow value={name} onChange={setName} placeholder="Template name" autoFocus onEnter={submit} />
        </Section>
      </SheetScroll>
    </Sheet>
  );
}

export { WEEKDAYS };
