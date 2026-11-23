import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import type { WorkoutTemplateDTO } from "../../shared/api";
import type { Day } from "../../shared/days";
import { detailsSummary, newContent, SPORTS, sportInfo, type WorkoutContent, withNewIds } from "../../shared/workout";
import { useAddSession, useLibrary, useScheduleLibraryItem } from "../api/training";
import { BarButton, NavBar } from "../components/NavBar";
import { Sheet, SheetScroll } from "../components/Sheet";
import { Row, Section, Spinner } from "../components/ui";
import { shortDay } from "../lib/dates";
import { ContentEditorScreen } from "./editor/ContentEditor";
import { SportIcon } from "./sports";

/** New workout by sport (→ editor) or one tap from the workout library. */
export function AddContentSheet({
  title,
  onAddContent,
  onAddLibraryItem,
  onClose,
}: {
  title: string;
  onAddContent: (content: WorkoutContent) => Promise<unknown>;
  onAddLibraryItem: (item: WorkoutTemplateDTO) => Promise<unknown>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<WorkoutContent | null>(null);
  const [busy, setBusy] = useState(false);
  const library = useLibrary();
  const items = [...(library.data ?? [])].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name));

  return (
    <Sheet onClose={onClose} label={title}>
      {editing ? (
        <div className="flow-screen pushed">
          <ContentEditorScreen
            initial={editing}
            title="New Session"
            saveTitle="Add"
            leading={
              <button type="button" className="bar-button back" onClick={() => setEditing(null)}>
                <ChevronLeft size={28} strokeWidth={2.2} style={{ marginRight: -2 }} />
                Back
              </button>
            }
            onSave={async (content) => {
              await onAddContent(content);
              onClose();
            }}
          />
        </div>
      ) : (
        <>
          <NavBar inSheet title={title} leading={<BarButton onClick={onClose}>Cancel</BarButton>} />
          <SheetScroll>
            <Section header="New Session">
              <div className="sport-grid">
                {SPORTS.map((sport) => (
                  <button key={sport} type="button" className="sport-tile" onClick={() => setEditing(newContent(sport))}>
                    <SportIcon sport={sport} size={22} />
                    <span>{sportInfo[sport].name}</span>
                  </button>
                ))}
              </div>
            </Section>
            <Section header="From Library">
              {library.isPending && (
                <div className="list-row">
                  <Spinner />
                </div>
              )}
              {library.isSuccess && items.length === 0 && (
                <div className="list-row footnote secondary">Save workouts to the library (from a session or the Plan menu) to plan them with one tap.</div>
              )}
              {items.map((item) => (
                <Row
                  key={item.id}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onAddLibraryItem(item);
                      onClose();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <span className="row-icon">
                    <SportIcon sport={item.sport} />
                  </span>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="truncate">{item.name}</span>
                    <span className="footnote secondary truncate">{detailsSummary(item.details) || sportInfo[item.sport].name}</span>
                  </div>
                </Row>
              ))}
            </Section>
          </SheetScroll>
        </>
      )}
    </Sheet>
  );
}

export function AddSessionSheet({ day, onClose }: { day: Day; onClose: () => void }) {
  const add = useAddSession();
  const schedule = useScheduleLibraryItem();
  return (
    <AddContentSheet
      title={`Add to ${shortDay(day)}`}
      onClose={onClose}
      onAddContent={(content) => add.mutateAsync({ day, content })}
      onAddLibraryItem={(item) => schedule.mutateAsync({ id: item.id, day })}
    />
  );
}

/** Library item → content copy (fresh ids). */
export const libraryContent = (item: WorkoutTemplateDTO): WorkoutContent => ({ sport: item.sport, title: item.name, details: withNewIds(item.details) });
