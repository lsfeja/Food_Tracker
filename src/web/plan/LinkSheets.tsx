import { Link2, Plus } from "lucide-react";
import type { ActivityDTO, SessionDTO } from "../../shared/api";
import * as Format from "../../shared/format";
import { displayTitle } from "../../shared/workout";
import { useLinkSession, useSessionFromActivity } from "../api/training";
import { BarButton, NavBar } from "../components/NavBar";
import { Sheet, SheetScroll } from "../components/Sheet";
import { Row, Section } from "../components/ui";
import { formatTime } from "../lib/dates";
import { activitySummary } from "./SessionRow";
import { SportIcon } from "./sports";

/** An unplanned activity: link it to a session of that day, or log it as a session. */
export function UnplannedActivitySheet({ activity, sessions, onClose }: { activity: ActivityDTO; sessions: SessionDTO[]; onClose: () => void }) {
  const link = useLinkSession();
  const create = useSessionFromActivity();
  return (
    <Sheet onClose={onClose} label="Unplanned activity">
      <NavBar inSheet title="Unplanned Activity" leading={<BarButton onClick={onClose}>Cancel</BarButton>} />
      <SheetScroll>
        <Section>
          <div className="list-row stack" style={{ alignItems: "flex-start", gap: 2 }}>
            <span className="headline">{activity.name}</span>
            <span className="footnote secondary">
              Strava · {formatTime(activity.startAt)} · {activitySummary(activity)} · {Format.kcal(activity.activeKcal)} kcal
            </span>
          </div>
        </Section>
        <Section header="Link to Session" footer="Linking marks the session as done.">
          {sessions.length === 0 && <div className="list-row secondary">No sessions planned on this day.</div>}
          {sessions.map((session) => (
            <Row
              key={session.id}
              disabled={link.isPending}
              onClick={async () => {
                await link.mutateAsync({ id: session.id, activityKey: activity.key });
                onClose();
              }}
            >
              <span className="row-icon">
                <SportIcon sport={session.sport} />
              </span>
              <span className="row-title truncate">{displayTitle(session)}</span>
              <Link2 size={18} className="secondary" />
            </Row>
          ))}
        </Section>
        <Section>
          <Row
            className="action"
            disabled={create.isPending}
            onClick={async () => {
              await create.mutateAsync(activity.key);
              onClose();
            }}
          >
            <Plus size={20} /> <span className="row-title">Add as Completed Session</span>
          </Row>
        </Section>
      </SheetScroll>
    </Sheet>
  );
}

/** Pick one of the day's activities for a session. */
export function LinkActivitySheet({
  session,
  activities,
  takenKeys,
  onClose,
}: {
  session: SessionDTO;
  activities: ActivityDTO[];
  takenKeys: string[];
  onClose: () => void;
}) {
  const link = useLinkSession();
  return (
    <Sheet onClose={onClose} label="Link activity">
      <NavBar inSheet title="Link Activity" leading={<BarButton onClick={onClose}>Cancel</BarButton>} />
      <SheetScroll>
        <Section footer="Activities from the same day. An activity already linked to another session moves to this one.">
          {activities.length === 0 && <div className="list-row secondary">No activities on this day.</div>}
          {activities.map((activity) => (
            <Row
              key={activity.key}
              disabled={link.isPending}
              onClick={async () => {
                await link.mutateAsync({ id: session.id, activityKey: activity.key });
                onClose();
              }}
            >
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="truncate">{activity.name}</span>
                <span className="footnote secondary">
                  {formatTime(activity.startAt)} · {activitySummary(activity)}
                  {takenKeys.includes(activity.key) ? " · linked to another session" : ""}
                </span>
              </div>
            </Row>
          ))}
        </Section>
      </SheetScroll>
    </Sheet>
  );
}
