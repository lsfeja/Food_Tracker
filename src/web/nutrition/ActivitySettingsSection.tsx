import { Bike, Check, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { BackfillDTO } from "../../shared/api";
import { errorMessage } from "../api/client";
import { useActivitySync, useStravaActions, useStravaStatus } from "../api/activity";
import { ActionSheet } from "../components/Sheet";
import { useToast } from "../components/Toast";
import { LabeledRow, Row, Section, Spinner } from "../components/ui";
import { formatTime } from "../lib/dates";

const reasons: Record<string, string> = {
  "not-configured": "Strava isn't configured on the server yet.",
  "access-denied": "Access was denied.",
  "missing-scope": "Please allow access to your activities.",
  "invalid-state": "The login expired. Please try again.",
};

function relative(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString();
}

/** Strava connection, sync and history import. */
export function ActivitySettingsSection() {
  const status = useStravaStatus();
  const sync = useActivitySync();
  const actions = useStravaActions();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const data = status.data;

  // Result of the OAuth redirect (/settings?strava=connected|error).
  useEffect(() => {
    const result = params.get("strava");
    if (!result) return;
    if (result === "connected") toast(`Strava connected${params.get("name") ? ` as ${params.get("name")}` : ""}.`);
    else toast(`Strava login failed. ${reasons[params.get("reason") ?? ""] ?? "Please try again."}`);
    setParams({}, { replace: true });
    void status.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a running import going while this screen is open.
  const backfill = data?.backfill;
  useEffect(() => {
    if (backfill?.status !== "running" || actions.continueBackfill.isPending) return;
    const timer = window.setTimeout(() => actions.continueBackfill.mutate(), 1500);
    return () => window.clearTimeout(timer);
  }, [backfill, actions.continueBackfill]);

  const footer =
    "Activities and their calories from the last 14 days are imported as active calories on the day they happened. Syncs when the app opens, on pull to refresh and every 30 minutes in the background.";

  if (!data) {
    return (
      <Section header="Activity" footer={footer}>
        <div className="list-row">{status.isPending ? <Spinner /> : <span className="secondary">{errorMessage(status.error)}</span>}</div>
      </Section>
    );
  }

  if (!data.configured) {
    return (
      <Section header="Activity" footer={footer}>
        <div className="list-row footnote secondary" style={{ alignItems: "flex-start" }}>
          <TriangleAlert size={18} style={{ flex: "none" }} />
          <span>
            Set the secrets STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY with <code>wrangler secret put</code> to connect Strava.
          </span>
        </div>
      </Section>
    );
  }

  if (!data.connected) {
    return (
      <Section header="Activity" footer={footer}>
        <Row className="action" onClick={() => window.location.assign("/api/strava/connect")}>
          <Bike size={20} /> <span className="row-title">Connect Strava</span>
        </Row>
      </Section>
    );
  }

  return (
    <>
      <Section header="Activity" footer={footer}>
        <LabeledRow label="Strava" value={data.athleteName ?? "Connected"} />
        <Row
          className="action"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              await sync(true);
              toast("Strava is up to date.");
            } catch (error) {
              toast(errorMessage(error));
            } finally {
              setSyncing(false);
            }
          }}
        >
          <span className="row-title">Sync Now</span>
          {syncing ? <Spinner /> : data.lastSyncAt && <span className="footnote secondary">{relative(data.lastSyncAt)}</span>}
        </Row>
        {data.lastError && <div className="list-row footnote" style={{ color: "var(--orange)" }}>{data.lastError}</div>}
        <Row className="destructive" onClick={() => setConfirm(true)}>
          Disconnect Strava
        </Row>
      </Section>
      <BackfillSection backfill={data.backfill} busy={actions.startBackfill.isPending} onStart={(restart) => actions.startBackfill.mutate(restart)} />
      {confirm && (
        <ActionSheet
          title="Disconnect Strava?"
          onClose={() => setConfirm(false)}
          actions={[
            { label: "Disconnect, Keep Activities", onSelect: () => actions.disconnect.mutate(false) },
            { label: "Disconnect and Delete Activities", destructive: true, onSelect: () => actions.disconnect.mutate(true) },
          ]}
        />
      )}
    </>
  );
}

function BackfillSection({ backfill, busy, onStart }: { backfill: BackfillDTO; busy: boolean; onStart: (restart: boolean) => void }) {
  const parts: string[] = [];
  if (backfill.expectedTotal) parts.push(`${backfill.importedCount.toLocaleString()} of ~${backfill.expectedTotal.toLocaleString()} activities`);
  else if (backfill.importedCount) parts.push(`${backfill.importedCount.toLocaleString()} activities`);
  if (backfill.oldestAt) parts.push(`back to ${new Date(backfill.oldestAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`);
  if (backfill.status === "paused" && backfill.pausedUntil) parts.push(`paused (rate limit), resumes ${formatTime(backfill.pausedUntil)}`);
  if (backfill.status === "completed") parts.unshift("Done");
  if (backfill.status === "failed" && backfill.lastError) parts.push(backfill.lastError);

  return (
    <Section
      header="Activity History"
      footer="Imports all past activities for the Stats tab (distance, time, elevation). Takes a few requests per 200 activities and continues in the background."
    >
      {backfill.status !== "idle" && (
        <div className="list-row footnote secondary">
          {backfill.status === "completed" && <Check size={18} className="accent" style={{ flex: "none" }} />}
          {backfill.status === "running" && <Spinner />}
          <span>{parts.join(" · ") || "Starting…"}</span>
        </div>
      )}
      {backfill.status === "completed" ? (
        <Row className="action" onClick={() => onStart(true)} disabled={busy}>
          Import Again
        </Row>
      ) : backfill.status !== "running" ? (
        <Row className="action" onClick={() => onStart(false)} disabled={busy}>
          {backfill.status === "idle" ? "Import" : "Resume"}
        </Row>
      ) : null}
    </Section>
  );
}
