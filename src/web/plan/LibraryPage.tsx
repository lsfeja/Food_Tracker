import { Copy, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import type { WorkoutTemplateDTO } from "../../shared/api";
import { detailsSummary, newContent, sportInfo } from "../../shared/workout";
import { useDeleteLibraryItem, useDuplicateLibraryItem, useLibrary, useSaveToLibrary, useUpdateLibraryItem } from "../api/training";
import { BackButton, BarButton, NavBar } from "../components/NavBar";
import { SwipeRow } from "../components/SwipeRow";
import { EmptyState, Row, Section, Spinner } from "../components/ui";
import { ContentEditorSheet } from "./editor/ContentEditor";
import { SportIcon } from "./sports";

/** Reusable workouts. Planning one copies it, so editing never changes past sessions. */
export function LibraryPage() {
  const library = useLibrary();
  const create = useSaveToLibrary();
  const update = useUpdateLibraryItem();
  const duplicate = useDuplicateLibraryItem();
  const remove = useDeleteLibraryItem();
  const [editing, setEditing] = useState<WorkoutTemplateDTO | "new" | null>(null);
  const [query, setQuery] = useState("");
  const items = (library.data ?? []).filter((item) => !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="page">
      <NavBar
        large
        title="Workout Library"
        leading={<BackButton label="Plan" fallback="/plan" />}
        trailing={
          <BarButton onClick={() => setEditing("new")} label="New workout">
            <Plus size={26} />
          </BarButton>
        }
      />
      <div className="page-content">
        {(library.data?.length ?? 0) > 6 && (
          <div className="page-sub">
            <label className="search-field">
              <Search size={17} />
              <input type="search" placeholder="Search workouts" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>
        )}
        {library.isPending && (
          <div className="empty-state">
            <Spinner />
          </div>
        )}
        {library.isSuccess && library.data.length === 0 && (
          <EmptyState title="No workouts yet" message="Tap + to create one, or save a session to the library from its menu." />
        )}
        {items.length > 0 && (
          <Section footer="Planning a workout copies it. Editing it here never changes planned or past sessions.">
            {items.map((item) => (
              <SwipeRow
                key={item.id}
                fullSwipe
                actions={[
                  { label: "Delete", icon: <Trash2 size={18} />, color: "red", onSelect: () => remove.mutate(item.id) },
                  { label: "Duplicate", icon: <Copy size={18} />, color: "gray", onSelect: () => duplicate.mutate(item.id) },
                ]}
              >
                <Row chevron onClick={() => setEditing(item)}>
                  <span className="row-icon">
                    <SportIcon sport={item.sport} />
                  </span>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="truncate">{item.name}</span>
                    <span className="footnote secondary truncate">
                      {detailsSummary(item.details) || sportInfo[item.sport].name}
                      {item.useCount > 0 ? ` · used ${item.useCount}×` : ""}
                    </span>
                  </div>
                </Row>
              </SwipeRow>
            ))}
          </Section>
        )}
      </div>
      {editing && (
        <ContentEditorSheet
          title={editing === "new" ? "New Workout" : "Edit Workout"}
          initial={editing === "new" ? newContent("strength") : { sport: editing.sport, title: editing.name, details: editing.details }}
          onClose={() => setEditing(null)}
          onSave={async (content) => {
            if (editing === "new") await create.mutateAsync(content);
            else await update.mutateAsync({ id: editing.id, content });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
