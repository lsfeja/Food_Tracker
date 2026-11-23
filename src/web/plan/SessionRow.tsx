import { BadgeCheck, CircleCheck, Circle, CircleMinus, Zap } from "lucide-react";
import type { ActivityDTO, SessionDTO } from "../../shared/api";
import * as Format from "../../shared/format";
import { detailsSummary, displayTitle, sportFromActivityType } from "../../shared/workout";
import { SportIcon } from "./sports";

export function activitySummary(activity: ActivityDTO): string {
  const parts = [Format.duration(activity.durationS / 60)];
  if (activity.distanceM > 0) parts.push(Format.distance(activity.distanceM / 1000));
  return parts.join(" · ");
}

export function CheckButton({ session, onToggle }: { session: SessionDTO; onToggle: () => void }) {
  const Icon = session.status === "done" ? CircleCheck : session.status === "skipped" ? CircleMinus : Circle;
  return (
    <button
      type="button"
      className={`check-button ${session.status === "done" ? "done" : ""}`}
      aria-label={session.status === "done" ? "Mark as not done" : "Mark as done"}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon size={26} strokeWidth={session.status === "done" ? 2.4 : 1.8} />
    </button>
  );
}

/** A planned session as a to-do row: checkbox, sport icon, title, short info. */
export function SessionRowContent({ session, linked, onToggle }: { session: SessionDTO; linked: ActivityDTO | null; onToggle: () => void }) {
  const muted = session.status !== "planned";
  const info = session.status === "skipped" ? "Skipped" : detailsSummary(session.details);
  return (
    <>
      <CheckButton session={session} onToggle={onToggle} />
      <span className="row-icon" style={{ color: session.status === "skipped" ? "var(--label-2)" : undefined }}>
        <SportIcon sport={session.sport} />
      </span>
      <div className="grow stack" style={{ gap: 2 }}>
        <span className="truncate" style={{ color: muted ? "var(--label-2)" : undefined }}>
          {displayTitle(session)}
        </span>
        {info && <span className="footnote secondary truncate">{info}</span>}
        {linked && (
          <span className="linked-label truncate">
            <BadgeCheck size={13} /> {activitySummary(linked)}
          </span>
        )}
      </div>
    </>
  );
}

/** An imported activity without a planned session. */
export function UnplannedRowContent({ activity }: { activity: ActivityDTO }) {
  const sport = sportFromActivityType(activity.type) ?? "custom";
  return (
    <>
      <span className="check-button">
        <Zap size={24} strokeWidth={1.8} />
      </span>
      <span className="row-icon secondary">
        <SportIcon sport={sport} />
      </span>
      <div className="grow stack" style={{ gap: 2 }}>
        <span className="truncate">{activity.name}</span>
        <span className="footnote secondary truncate">Unplanned · {activitySummary(activity)}</span>
      </div>
    </>
  );
}
