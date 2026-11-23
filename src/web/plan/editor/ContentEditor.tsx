import { useMemo, useState } from "react";
import { knownNames } from "../../../shared/exerciseHistory";
import { changeSport, SPORTS, sportInfo, type SportType, type WorkoutContent } from "../../../shared/workout";
import { useStrengthSessions } from "../../api/training";
import { BarButton, NavBar } from "../../components/NavBar";
import { Sheet, SheetScroll } from "../../components/Sheet";
import { Section } from "../../components/ui";
import { DetailsEditor } from "./DetailsEditor";

/** Sport, title and details. Used for sessions, library workouts and template sessions. */
export function ContentEditor({ content, onChange }: { content: WorkoutContent; onChange: (content: WorkoutContent) => void }) {
  const strength = useStrengthSessions();
  const names = useMemo(
    () => knownNames((strength.data ?? []).slice(-200).map((s) => ({ sessionId: s.id, day: s.day, workout: s.details }))),
    [strength.data],
  );
  return (
    <>
      <Section>
        <label className="list-row compact">
          <span className="grow">Sport</span>
          <select className="row-select" value={content.sport} aria-label="Sport" onChange={(event) => onChange(changeSport(content, event.target.value as SportType))}>
            {SPORTS.map((sport) => (
              <option key={sport} value={sport}>
                {sportInfo[sport].name}
              </option>
            ))}
          </select>
        </label>
        <div className="list-row compact">
          <input
            className="text-input"
            type="text"
            placeholder={sportInfo[content.sport].name}
            aria-label="Title"
            value={content.title}
            onChange={(event) => onChange({ ...content, title: event.target.value })}
          />
        </div>
      </Section>
      <DetailsEditor details={content.details} onChange={(details) => onChange({ ...content, details })} knownNames={names} />
    </>
  );
}

/** Editor screen content for sheets: nav bar with Cancel/Back and Save. */
export function ContentEditorScreen({
  initial,
  title,
  saveTitle = "Save",
  leading,
  onSave,
}: {
  initial: WorkoutContent;
  title: string;
  saveTitle?: string;
  leading: React.ReactNode;
  onSave: (content: WorkoutContent) => void | Promise<void>;
}) {
  const [content, setContent] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <>
      <NavBar
        inSheet
        title={title}
        leading={leading}
        trailing={
          <BarButton
            prominent
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({ ...content, title: content.title.trim() });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saveTitle}
          </BarButton>
        }
      />
      <SheetScroll>
        <ContentEditor content={content} onChange={setContent} />
      </SheetScroll>
    </>
  );
}

export function ContentEditorSheet({
  initial,
  title,
  saveTitle,
  onSave,
  onClose,
}: {
  initial: WorkoutContent;
  title: string;
  saveTitle?: string;
  onSave: (content: WorkoutContent) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} label={title}>
      <ContentEditorScreen initial={initial} title={title} saveTitle={saveTitle} leading={<BarButton onClick={onClose}>Cancel</BarButton>} onSave={onSave} />
    </Sheet>
  );
}
