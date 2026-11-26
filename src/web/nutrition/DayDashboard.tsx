import { useQueryClient } from "@tanstack/react-query";
import { Barcode, Palmtree, Pencil, Plus, ScanText, Trash2, Utensils } from "lucide-react";
import { useRef, useState } from "react";
import type { EntryDTO } from "../../shared/api";
import type { DayPlan } from "../../shared/energyBudget";
import { budgetFor } from "../../shared/budget";
import type { Day } from "../../shared/days";
import * as Format from "../../shared/format";
import { errorMessage } from "../api/client";
import { invalidateNutrition, useDay, useDeleteEntry, useSetUntracked, useSettings } from "../api/nutrition";
import { useActivitySync } from "../api/activity";
import { PullToRefresh } from "../components/PullToRefresh";
import { ActionSheet } from "../components/Sheet";
import { SwipeRow } from "../components/SwipeRow";
import { EmptyState, Row, Section, Spinner, ToggleRow } from "../components/ui";
import { useAddFood } from "./add/AddFoodContext";
import { useToday } from "../lib/useToday";
import { ActivityRowContent, CalorieRing, EntryRowContent, MacroBar, WeekView } from "./DayWidgets";
import { EditEntrySheet } from "./EditEntrySheet";
import { WeightSection } from "./WeightSection";
import { CalibrationCard } from "../calibration/CalibrationViews";

/** Progress and entries for one day. Used for "Today" and for past days from History. */
export function DayDashboard({ day }: { day: Day }) {
  const settings = useSettings();
  const today = useToday();
  const query = useDay(day);
  const client = useQueryClient();
  const sync = useActivitySync();
  const remove = useDeleteEntry();
  const setUntracked = useSetUntracked();
  const [editing, setEditing] = useState<EntryDTO | null>(null);

  const data = query.data;
  const budget = budgetFor(day, settings, data?.totals ?? {}, today);
  const entries = data?.entries ?? [];
  const untracked = Boolean(data?.totals[day]?.untracked);
  const activities = data?.activities ?? [];

  const refresh = async () => {
    await sync().catch(() => {});
    invalidateNutrition(client);
    void client.invalidateQueries({ queryKey: ["weights"] });
    void client.invalidateQueries({ queryKey: ["calibrations"] });
    await query.refetch();
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="page-content">
        {day === today && <CalibrationCard />}
        {untracked ? (
          <Section>
            <div className="empty-state" style={{ padding: "28px 16px" }}>
              <Palmtree size={30} className="accent" />
              <span className="headline">Not tracked</span>
              <span className="footnote secondary">This day doesn't count for your budget (vacation). Activities still count in the stats.</span>
            </div>
          </Section>
        ) : (
        <Section>
          <div className="stack" style={{ alignItems: "center", gap: 24, padding: "20px 16px" }}>
            <CalorieRing budget={budget.calories} />
            <div className="stat-row">
              <Stat title="Eaten" value={Format.kcal(budget.calories.eaten)} />
              <span className="divider" />
              <Stat title="Active" value={Format.kcal(budget.active)} />
              <span className="divider" />
              <Stat title={budget.restDay ? "Target · rest day" : "Target"} value={Format.kcal(budget.calories.total)} />
            </div>
            {budget.plan && <TargetBreakdown plan={budget.plan} />}
            <div className="stack" style={{ gap: 14, width: "100%" }}>
              <MacroBar title="Protein" value={budget.eaten.protein} target={budget.targets.protein} />
              <MacroBar title="Carbs" value={budget.eaten.carbs} target={budget.targets.carbs} />
              <MacroBar title="Fat" value={budget.eaten.fat} target={budget.targets.fat} secondary />
            </div>
          </div>
        </Section>
        )}

        {budget.week && budget.weekPlans.length > 0 && (
          <Section>
            <div style={{ padding: "12px 16px" }}>
              <WeekView plans={budget.weekPlans} week={budget.week} day={day} today={today} />
            </div>
          </Section>
        )}

        <WeightSection day={day} />

        <Section header={entries.length > 0 ? "Entries" : undefined}>
          {entries.length === 0 &&
            (query.isPending ? (
              <div className="empty-state">
                <Spinner />
              </div>
            ) : query.isError && !data ? (
              <div className="empty-state">
                <span className="subheadline secondary">{errorMessage(query.error)}</span>
                <button type="button" className="accent" onClick={() => void query.refetch()}>
                  Try Again
                </button>
              </div>
            ) : (
              <EmptyState icon={<Utensils size={26} />} title="Nothing logged yet" message="Tap + to add food. Hold it to scan." />
            ))}
          {entries.map((entry) => (
            <SwipeRow
              key={entry.id}
              fullSwipe
              actions={[
                { label: "Delete", icon: <Trash2 size={18} />, color: "red", onSelect: () => remove.mutate(entry) },
                { label: "Edit", icon: <Pencil size={18} />, color: "gray", onSelect: () => setEditing(entry) },
              ]}
            >
              <Row onClick={() => setEditing(entry)}>
                <EntryRowContent entry={entry} />
              </Row>
            </SwipeRow>
          ))}
        </Section>

        {activities.length > 0 && (
          <Section header="Activity">
            {activities.map((activity) => (
              <Row key={activity.id}>
                <ActivityRowContent activity={activity} />
              </Row>
            ))}
          </Section>
        )}
        <Section footer="Vacation days don't count for your weekly budget or the active average. You can mark future days in Settings.">
          <ToggleRow label="Don't track this day (vacation)" checked={untracked} onChange={(value) => setUntracked.mutate({ day, untracked: value })} />
        </Section>
        <div className="fab-spacer" />
      </div>
      <AddFoodButton day={day} />
      {editing && <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </PullToRefresh>
  );
}

/** Base · training (smoothed) · deficit · balance, under the day's target. */
function TargetBreakdown({ plan }: { plan: DayPlan }) {
  const parts = [`Base ${Format.kcal(plan.baseline)}`, `training +${Format.kcal(plan.smoothedActive)}`];
  if (Math.round(plan.deficit) !== 0) parts.push(plan.deficit > 0 ? `deficit −${Format.kcal(plan.deficit)}` : `surplus +${Format.kcal(-plan.deficit)}`);
  if (Math.round(plan.carry) !== 0) parts.push(`balance ${Format.signedKcal(plan.carry)}`);
  return (
    <span className="caption secondary tabular" style={{ textAlign: "center", marginTop: -12 }}>
      {parts.join(" · ")}
      {plan.capped && " (limited)"}
    </span>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <span className="headline tabular">{value}</span>
      <span className="caption secondary">{title}</span>
    </div>
  );
}

/** The prominent "+" button. Tap: search/manual. Long press: scan or label photo. */
export function AddFoodButton({ day }: { day: Day }) {
  const addFood = useAddFood();
  const [menu, setMenu] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);

  const cancel = () => window.clearTimeout(timer.current);
  return (
    <>
      <button
        type="button"
        className="fab"
        aria-label="Add food"
        title="Add food (hold for barcode scanner or label photo)"
        onPointerDown={() => {
          longPressed.current = false;
          timer.current = window.setTimeout(() => {
            longPressed.current = true;
            navigator.vibrate?.(10);
            setMenu(true);
          }, 450);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          if (longPressed.current) return;
          addFood.open("search", day);
        }}
      >
        <Plus size={32} strokeWidth={2.6} />
      </button>
      {menu && (
        <ActionSheet
          onClose={() => setMenu(false)}
          actions={[
            { label: "Scan Barcode", icon: <Barcode size={22} />, onSelect: () => addFood.open("barcode", day) },
            { label: "Photograph Label", icon: <ScanText size={22} />, onSelect: () => addFood.open("label", day) },
          ]}
        />
      )}
    </>
  );
}
