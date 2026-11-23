import type { SportType } from "./workout";
import { sportInfo } from "./workout";

/**
 * Matches imported activities to planned sessions of the same day.
 * - Existing links stay while the activity still exists; stale links are removed.
 * - Unlinked sessions (not skipped, auto-link not suppressed) get the earliest unused
 *   activity of the same match group, in day order. Each activity links once.
 */
export interface MatchSession {
  id: string;
  sport: SportType;
  order: number;
  linkedKey: string | null;
  autoLinkSuppressed?: boolean;
  isSkipped?: boolean;
}

export interface MatchActivity {
  key: string;
  sport: SportType | null;
  start: number;
}

export interface MatchResult {
  links: Record<string, string>;
  unlinks: string[];
}

export function matchActivities(sessions: MatchSession[], activities: MatchActivity[]): MatchResult {
  const links: Record<string, string> = {};
  const unlinks = new Set<string>();
  const available = new Set(activities.map((a) => a.key));
  const taken = new Set<string>();
  const open: MatchSession[] = [];

  for (const session of [...sessions].sort((a, b) => a.order - b.order)) {
    if (session.linkedKey) {
      if (available.has(session.linkedKey) && !taken.has(session.linkedKey)) {
        taken.add(session.linkedKey);
        continue;
      }
      unlinks.add(session.id);
    }
    if (!session.autoLinkSuppressed && !session.isSkipped) open.push(session);
  }

  const candidates = [...activities].sort((a, b) => a.start - b.start);
  for (const session of open) {
    const group = sportInfo[session.sport].matchGroup;
    if (!group) continue;
    const activity = candidates.find((a) => !taken.has(a.key) && a.sport !== null && sportInfo[a.sport].matchGroup === group);
    if (!activity) continue;
    links[session.id] = activity.key;
    unlinks.delete(session.id);
    taken.add(activity.key);
  }
  return { links, unlinks: [...unlinks] };
}

export function unplannedActivities<T extends MatchActivity>(activities: T[], linkedKeys: Set<string>): T[] {
  return activities.filter((a) => !linkedKeys.has(a.key)).sort((a, b) => a.start - b.start);
}
