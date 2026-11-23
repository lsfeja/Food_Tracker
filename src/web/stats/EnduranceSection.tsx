import { ArrowDownCircle, BarChart3, Bike, Medal, Target, TrendingUp, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { GoalDTO } from "../../shared/api";
import type { Day } from "../../shared/days";
import * as Format from "../../shared/format";
import {
  type ActivitySnapshot,
  classifyActivity,
  enduranceReport,
  type EnduranceTotals,
  filterInfo,
  goalProgress,
  type GoalProgress,
  STATS_FILTERS,
  type StatsSportFilter,
  yearTotals,
} from "../../shared/stats/endurance";
import type { Period } from "../../shared/stats/period";
import { periodTitle } from "../../shared/stats/period";
import { useGoalMutations, useGoals, useStatsActivities } from "../api/stats";
import { BarButton, NavBar } from "../components/NavBar";
import { Sheet, SheetScroll } from "../components/Sheet";
import { ProgressBar, Row, Section, Segmented, Spinner } from "../components/ui";
import { usePersistentState } from "../lib/usePersistentState";
import { useThemeColors } from "../lib/useThemeColors";
import { OptionalNumber } from "../plan/editor/fields";
import { axisTick, bucketLabel, bucketTitle, dayFraction, longDate } from "./chartUtils";
import { ChipPicker, EmptyStatsCard, Legend, MetricGrid, MetricTile, StatsCard } from "./components";

const km = (m: number) => m / 1000;

export function EnduranceSection({ period, today, earliest }: { period: Period; today: Day; earliest: Day | null }) {
  const activities = useStatsActivities();
  const goals = useGoals();
  const [filter, setFilter] = usePersistentState<StatsSportFilter>("stats.filter", "all", STATS_FILTERS);
  const [metric, setMetric] = useState<"distance" | "time">("distance");
  const [editingGoal, setEditingGoal] = useState(false);
  const colors = useThemeColors();

  const snapshots: ActivitySnapshot[] = useMemo(
    () =>
      (activities.data ?? []).map((a) => ({
        key: a.key,
        name: a.name,
        startAt: a.startAt,
        day: a.day,
        sport: classifyActivity(a.type, a.isIndoor),
        type: a.type,
        distanceM: a.distanceM,
        movingS: a.movingS,
        elevationM: a.elevationM,
      })),
    [activities.data],
  );
  const report = useMemo(() => enduranceReport(snapshots, filter, period, today, earliest), [snapshots, filter, period, today, earliest]);

  if (activities.isPending) {
    return (
      <div className="empty-state">
        <Spinner />
      </div>
    );
  }
  const chips = <ChipPicker value={filter} onChange={setFilter} options={STATS_FILTERS.map((f) => ({ value: f, label: filterInfo[f].name }))} />;
  if (!snapshots.length) {
    return (
      <>
        <div className="stats-controls">{chips}</div>
        <EmptyStatsCard
          title="No Activities Yet"
          icon={ArrowDownCircle}
          message="Connect Strava in Settings (Nutrition tab › gear) and import your activity history to see distance, time and elevation over the years."
        />
      </>
    );
  }

  const goal = goals.data?.find((g) => g.year === period.year && g.sport === filter) ?? null;
  const ytd = yearTotals(snapshots, filter, period.year);
  const isYear = period.kind === "year";

  return (
    <>
      <div className="stats-controls">{chips}</div>
      <StatsCard title="Totals" icon={Bike} trailing={periodTitle(period, today)}>
        <MetricGrid>
          <MetricTile title="Distance" value={Format.distanceValue(km(report.totals.distanceM))} unit="km" />
          <MetricTile title="Time" value={Format.hoursValue(report.totals.movingS)} unit="h" />
          <MetricTile title="Elevation" value={Format.kcal(report.totals.elevationM)} unit="m" />
          <MetricTile title="Activities" value={report.totals.count.toLocaleString()} />
        </MetricGrid>
      </StatsCard>

      {isYear && (
        <StatsCard title={`${period.year} Goal`} icon={Target}>
          {goal ? (
            <>
              {goal.distanceKm !== null && <GoalProgressView progress={goalProgress(goal.distanceKm, km(ytd.distanceM), period.year, today, dayFraction())} unit="km" />}
              {goal.hours !== null && <GoalProgressView progress={goalProgress(goal.hours, ytd.movingS / 3600, period.year, today, dayFraction())} unit="h" />}
              <button type="button" className="link-button" style={{ alignSelf: "flex-start", padding: 0, fontSize: 15 }} onClick={() => setEditingGoal(true)}>
                Edit Goal
              </button>
            </>
          ) : (
            <button type="button" className="button secondary-button small" style={{ alignSelf: "flex-start" }} onClick={() => setEditingGoal(true)}>
              <Target size={16} /> Set a {period.year} {filter === "all" ? "" : `${filterInfo[filter].name.toLowerCase()} `}goal
            </button>
          )}
        </StatsCard>
      )}

      <StatsCard
        title={`${bucketTitle(report.primaryBucket)} Volume`}
        icon={BarChart3}
        trailing={
          <Segmented
            className="mini"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "distance", label: "km" },
              { value: "time", label: "h" },
            ]}
          />
        }
      >
        <VolumeChart buckets={report.primary} bucket={report.primaryBucket} metric={metric} color={colors.accent} />
      </StatsCard>
      {report.secondaryBucket && report.secondary.length > 1 && (
        <StatsCard title={`${bucketTitle(report.secondaryBucket)} Volume`} icon={BarChart3}>
          <VolumeChart buckets={report.secondary} bucket={report.secondaryBucket} metric={metric} color={colors.accent} />
        </StatsCard>
      )}

      {isYear && report.yearOverYear.length > 0 && <YearOverYearCard points={report.yearOverYear} year={period.year} />}

      {(report.longest || report.bestWeek) && (
        <StatsCard title="Records" icon={Trophy}>
          {report.longest && (
            <RecordRow
              title="Longest"
              value={report.longest.km > 0 ? Format.distance(report.longest.km) : Format.duration(report.longest.hours * 60)}
              detail={`${report.longest.name} · ${longDate(report.longest.day)}`}
            />
          )}
          {report.mostElevation && report.mostElevation.elevationM > 0 && (
            <RecordRow title="Most elevation" value={`${Format.kcal(report.mostElevation.elevationM)} m`} detail={`${report.mostElevation.name} · ${longDate(report.mostElevation.day)}`} />
          )}
          {report.bestWeek && <RecordRow title="Best week" value={totalsValue(report.bestWeek.totals)} detail={`Week of ${longDate(report.bestWeek.start)}`} />}
          {report.bestMonth && (
            <RecordRow
              title="Best month"
              value={totalsValue(report.bestMonth.totals)}
              detail={new Date(`${report.bestMonth.start}T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}
            />
          )}
        </StatsCard>
      )}

      {report.indoorShare && (filter === "all" || filter === "cycling") && (
        <StatsCard title="Indoor vs. Outdoor" icon={Medal} trailing={`${Math.round(report.indoorShare.indoorFraction * 100)} % indoor`}>
          <ProgressBar progress={report.indoorShare.indoorFraction} height={10} over={false} />
          <div className="row footnote secondary">
            <span className="grow">
              Indoor: {Format.hoursValue(report.indoorShare.indoorS)} h · {report.indoorShare.indoorCount}
            </span>
            <span>
              Outdoor: {Format.hoursValue(report.indoorShare.outdoorS)} h · {report.indoorShare.outdoorCount}
            </span>
          </div>
        </StatsCard>
      )}

      {editingGoal && <GoalEditorSheet year={period.year} filter={filter} goal={goal} onClose={() => setEditingGoal(false)} />}
    </>
  );
}

const totalsValue = (t: EnduranceTotals) => (t.distanceM > 0 ? Format.distance(t.distanceM / 1000) : Format.duration(t.movingS / 60));

function RecordRow({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="record-row">
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="subheadline secondary">{title}</span>
        <span className="caption secondary truncate">{detail}</span>
      </div>
      <span className="semibold tabular">{value}</span>
    </div>
  );
}

function VolumeChart({ buckets, bucket, metric, color }: { buckets: { start: Day; totals: EnduranceTotals }[]; bucket: Parameters<typeof bucketLabel>[0]; metric: "distance" | "time"; color: string }) {
  const colors = useThemeColors();
  const data = buckets.map((b) => ({ start: b.start, value: metric === "distance" ? b.totals.distanceM / 1000 : b.totals.movingS / 3600 }));
  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
          <XAxis dataKey="start" tickFormatter={bucketLabel(bucket)} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={8} />
          <YAxis orientation="right" tickLine={false} axisLine={false} width={40} tick={axisTick(colors.label2)} tickFormatter={(v: number) => Format.distanceValue(v)} />
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function YearOverYearCard({ points, year }: { points: { year: number; index: number; day: Day; km: number }[]; year: number }) {
  const colors = useThemeColors();
  const rows: { index: number; day: Day; current?: number; previous?: number }[] = [];
  for (const p of points) {
    rows[p.index] ??= { index: p.index, day: p.day };
    if (p.year === year) rows[p.index].current = p.km;
    else rows[p.index].previous = p.km;
  }
  const data = rows.filter(Boolean);
  const current = points.filter((p) => p.year === year).at(-1)?.km ?? 0;
  const lastIndex = points.filter((p) => p.year === year).at(-1)?.index ?? -1;
  const previousSameDay = points.find((p) => p.year === year - 1 && p.index === lastIndex)?.km ?? null;
  const delta = previousSameDay !== null ? current - previousSameDay : null;
  return (
    <StatsCard
      title={`${year} vs. ${year - 1}`}
      icon={TrendingUp}
      trailing={delta !== null ? `${delta >= 0 ? "+" : "−"}${Format.distanceValue(Math.abs(delta))} km` : undefined}
    >
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
            <XAxis dataKey="day" tickFormatter={(d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={24} />
            <YAxis orientation="right" tickLine={false} axisLine={false} width={44} tick={axisTick(colors.label2)} tickFormatter={(v: number) => Format.distanceValue(v)} />
            <Line dataKey="previous" stroke={colors.label3} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            <Line dataKey="current" stroke={colors.accent} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { color: colors.accent, label: String(year) },
          { color: colors.label3, label: String(year - 1) },
        ]}
      />
    </StatsCard>
  );
}

/** Progress bar with "on track / behind" relative to the date. */
function GoalProgressView({ progress, unit }: { progress: GoalProgress; unit: string }) {
  const behind = progress.status === "behind";
  const label = progress.status === "reached" ? "Reached 🎉" : progress.status === "onTrack" ? "On track" : "Behind";
  const pace = `pace: ${Format.distanceValue(progress.projected)} ${unit}`;
  const delta = Format.distanceValue(Math.abs(progress.delta));
  const detail = progress.status === "reached" ? pace : progress.status === "onTrack" ? `${delta} ${unit} ahead of schedule · ${pace}` : `${delta} ${unit} behind schedule · ${pace}`;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: "baseline" }}>
        <span className="semibold tabular grow">
          {Format.distanceValue(progress.actual)} / {Format.distanceValue(progress.target)} {unit}
        </span>
        <span className="footnote semibold" style={{ color: behind ? "var(--orange)" : "var(--accent)" }}>
          {label}
        </span>
      </div>
      <ProgressBar progress={progress.fraction} height={8} over={behind} />
      <span className="caption secondary">{detail}</span>
    </div>
  );
}

function GoalEditorSheet({ year, filter, goal, onClose }: { year: number; filter: StatsSportFilter; goal: GoalDTO | null; onClose: () => void }) {
  const { save, remove } = useGoalMutations();
  const [distance, setDistance] = useState<number | null>(goal?.distanceKm ?? null);
  const [hours, setHours] = useState<number | null>(goal?.hours ?? null);
  const valid = (distance ?? 0) > 0 || (hours ?? 0) > 0;
  return (
    <Sheet onClose={onClose} label="Yearly goal">
      <NavBar
        inSheet
        title="Yearly Goal"
        leading={<BarButton onClick={onClose}>Cancel</BarButton>}
        trailing={
          <BarButton
            prominent
            disabled={!valid || save.isPending}
            onClick={async () => {
              await save.mutateAsync({ year, sport: filter, distanceKm: distance, hours });
              onClose();
            }}
          >
            Save
          </BarButton>
        }
      />
      <SheetScroll>
        <Section header={`${filterInfo[filter].name} · ${year}`} footer="Progress is compared with an even pace through the year to show whether you're on track.">
          <div className="list-row compact">
            <span className="grow">Distance</span>
            <OptionalNumber maxFraction={0} placeholder="–" label="Distance goal in km" value={distance} onChange={setDistance} />
            <span className="secondary">km</span>
          </div>
          <div className="list-row compact">
            <span className="grow">Time</span>
            <OptionalNumber maxFraction={0} placeholder="–" label="Time goal in hours" value={hours} onChange={setHours} />
            <span className="secondary">h</span>
          </div>
        </Section>
        {goal && (
          <Section>
            <Row
              className="destructive"
              onClick={async () => {
                await remove.mutateAsync({ year, sport: filter });
                onClose();
              }}
            >
              Delete Goal
            </Row>
          </Section>
        )}
      </SheetScroll>
    </Sheet>
  );
}
