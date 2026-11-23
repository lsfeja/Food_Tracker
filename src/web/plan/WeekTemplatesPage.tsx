import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { WeekTemplateDTO } from "../../shared/api";
import type { TemplateSession } from "../../shared/weekPlanner";
import { detailsSummary, displayTitle, type WorkoutContent, withNewIds } from "../../shared/workout";
import { useCreateWeekTemplate, useDeleteWeekTemplate, useDuplicateWeekTemplate, useUpdateWeekTemplate, useWeekTemplates } from "../api/training";
import { BackButton, BarButton, NavBar } from "../components/NavBar";
import { PromptDialog } from "../components/PromptDialog";
import { SwipeRow } from "../components/SwipeRow";
import { EmptyState, Row, Section, Spinner } from "../components/ui";
import { AddContentSheet, libraryContent } from "./AddSessionSheet";
import { ContentEditorSheet } from "./editor/ContentEditor";
import { SportIcon } from "./sports";
import { WEEKDAYS } from "./WeekTemplateSheets";

const newId = () => crypto.randomUUID();

function daysSummary(template: WeekTemplateDTO): string {
  const days = [...new Set(template.sessions.map((s) => s.weekday))].sort();
  const count = template.sessions.length === 1 ? "1 session" : `${template.sessions.length} sessions`;
  return days.length ? `${count} · ${days.map((d) => WEEKDAYS[d].slice(0, 2)).join(" ")}` : count;
}

/** Manage week templates. */
export function WeekTemplatesPage() {
  const templates = useWeekTemplates();
  const create = useCreateWeekTemplate();
  const duplicate = useDuplicateWeekTemplate();
  const remove = useDeleteWeekTemplate();
  const navigate = useNavigate();
  const [naming, setNaming] = useState(false);

  return (
    <div className="page">
      <NavBar
        large
        title="Week Templates"
        leading={<BackButton label="Plan" fallback="/plan" />}
        trailing={
          <BarButton onClick={() => setNaming(true)} label="New template">
            <Plus size={26} />
          </BarButton>
        }
      />
      <div className="page-content">
        {templates.isPending && (
          <div className="empty-state">
            <Spinner />
          </div>
        )}
        {templates.isSuccess && templates.data.length === 0 && (
          <EmptyState title="No week templates yet" message="Tap + to build one, or use “Save Week as Template” in the Plan menu." />
        )}
        {(templates.data?.length ?? 0) > 0 && (
          <Section footer="Load a template into any week from the Plan menu.">
            {templates.data!.map((template) => (
              <SwipeRow
                key={template.id}
                fullSwipe
                actions={[
                  { label: "Delete", icon: <Trash2 size={18} />, color: "red", onSelect: () => remove.mutate(template.id) },
                  { label: "Duplicate", icon: <Copy size={18} />, color: "gray", onSelect: () => duplicate.mutate(template.id) },
                ]}
              >
                <Row chevron onClick={() => navigate(`/plan/templates/${template.id}`)}>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="truncate">{template.name}</span>
                    <span className="footnote secondary truncate">{daysSummary(template)}</span>
                  </div>
                </Row>
              </SwipeRow>
            ))}
          </Section>
        )}
      </div>
      {naming && (
        <PromptDialog
          title="New Week Template"
          placeholder="Name"
          confirmLabel="Create"
          onClose={() => setNaming(false)}
          onConfirm={async (name) => {
            const template = await create.mutateAsync({ name, sessions: [] });
            navigate(`/plan/templates/${template.id}`);
          }}
        />
      )}
    </div>
  );
}

type Overlay = { kind: "add"; weekday: number } | { kind: "edit"; session: TemplateSession } | { kind: "rename" } | null;

/** Sessions of a template by weekday; every change is saved right away. */
export function WeekTemplateEditorPage() {
  const { id = "" } = useParams();
  const templates = useWeekTemplates();
  const update = useUpdateWeekTemplate();
  const stored = templates.data?.find((t) => t.id === id);
  const [draft, setDraft] = useState<WeekTemplateDTO | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (stored && !initialized.current) {
      initialized.current = true;
      setDraft(stored);
    }
  }, [stored]);

  if (!draft) {
    return (
      <div className="page">
        <NavBar title="" leading={<BackButton label="Templates" fallback="/plan/templates" />} />
        {templates.isPending ? (
          <div className="empty-state">
            <Spinner />
          </div>
        ) : (
          <EmptyState title="This template no longer exists." />
        )}
      </div>
    );
  }

  const save = (next: WeekTemplateDTO) => {
    setDraft(next);
    update.mutate({ id: next.id, name: next.name, sessions: next.sessions });
  };
  const sessionsOn = (weekday: number) => draft.sessions.filter((s) => s.weekday === weekday).sort((a, b) => a.order - b.order);
  const addSession = (weekday: number, content: WorkoutContent) => {
    const order = sessionsOn(weekday).length;
    save({ ...draft, sessions: [...draft.sessions, { id: newId(), weekday, order, content }] });
  };
  const replaceSession = (session: TemplateSession) => save({ ...draft, sessions: draft.sessions.map((s) => (s.id === session.id ? session : s)) });
  const removeSession = (session: TemplateSession) => {
    const rest = draft.sessions.filter((s) => s.id !== session.id);
    const renumbered = rest.map((s) => (s.weekday === session.weekday ? { ...s, order: rest.filter((r) => r.weekday === s.weekday && r.order < s.order).length } : s));
    save({ ...draft, sessions: renumbered });
  };
  const duplicateSession = (session: TemplateSession) => {
    const shifted = draft.sessions.map((s) => (s.weekday === session.weekday && s.order > session.order ? { ...s, order: s.order + 1 } : s));
    save({
      ...draft,
      sessions: [...shifted, { ...session, id: newId(), order: session.order + 1, content: { ...session.content, details: withNewIds(session.content.details) } }],
    });
  };

  return (
    <div className="page">
      <NavBar
        title={draft.name}
        leading={<BackButton label="Templates" fallback="/plan/templates" />}
        trailing={
          <BarButton onClick={() => setOverlay({ kind: "rename" })} label="Rename">
            <Pencil size={22} />
          </BarButton>
        }
      />
      <div className="page-content" style={{ paddingTop: 16 }}>
        {WEEKDAYS.map((name, weekday) => (
          <section key={name} className="section">
            <div className="day-header">
              <span>{name}</span>
              <span className="spacer" />
              <button
                type="button"
                onClick={() => setOverlay({ kind: "add", weekday })}
                aria-label={`Add session on ${name}`}
                style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Plus size={17} strokeWidth={3} />
              </button>
            </div>
            <div className="card">
              {sessionsOn(weekday).map((session) => (
                <SwipeRow
                  key={session.id}
                  fullSwipe
                  actions={[
                    { label: "Delete", icon: <Trash2 size={18} />, color: "red", onSelect: () => removeSession(session) },
                    { label: "Duplicate", icon: <Copy size={18} />, color: "gray", onSelect: () => duplicateSession(session) },
                  ]}
                >
                  <Row chevron onClick={() => setOverlay({ kind: "edit", session })}>
                    <span className="row-icon">
                      <SportIcon sport={session.content.sport} />
                    </span>
                    <div className="grow stack" style={{ gap: 2 }}>
                      <span className="truncate">{displayTitle(session.content)}</span>
                      {detailsSummary(session.content.details) && <span className="footnote secondary truncate">{detailsSummary(session.content.details)}</span>}
                    </div>
                  </Row>
                </SwipeRow>
              ))}
              {sessionsOn(weekday).length === 0 && <div className="list-row subheadline tertiary">Rest</div>}
            </div>
          </section>
        ))}
      </div>
      {overlay?.kind === "add" && (
        <AddContentSheet
          title={`Add to ${WEEKDAYS[overlay.weekday]}`}
          onClose={() => setOverlay(null)}
          onAddContent={async (content) => addSession(overlay.weekday, content)}
          onAddLibraryItem={async (item) => addSession(overlay.weekday, libraryContent(item))}
        />
      )}
      {overlay?.kind === "edit" && (
        <ContentEditorSheet
          title="Edit Session"
          initial={overlay.session.content}
          onClose={() => setOverlay(null)}
          onSave={(content) => {
            replaceSession({ ...overlay.session, content });
            setOverlay(null);
          }}
        />
      )}
      {overlay?.kind === "rename" && (
        <PromptDialog
          title="Rename Template"
          placeholder={draft.name}
          confirmLabel="Save"
          onClose={() => setOverlay(null)}
          onConfirm={(name) => save({ ...draft, name })}
        />
      )}
    </div>
  );
}
