import { BarChart3, ChevronRight, Dumbbell, ListOrdered, Trophy } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { Day } from "../../shared/days";
import * as Format from "../../shared/format";
import type { Period } from "../../shared/stats/period";
import { periodTitle } from "../../shared/stats/period";
import { exerciseSummaries, type ExerciseSummary, recordTitle, setLabel, strengthReport } from "../../shared/stats/strength";
import { BackButton, NavBar } from "../components/NavBar";
import { EmptyState, Row, Section, Spinner } from "../components/ui";
import { useThemeColors } from "../lib/useThemeColors";
import { useToday } from "../lib/useToday";
import { axisTick, bucketLabel, bucketTitle, longDate } from "./chartUtils";
import { EmptyStatsCard, Legend, MetricGrid, MetricTile, StatsCard } from "./components";
import { useStrengthSnapshots } from "./useStrengthSnapshots";

export function StrengthSection({ period, today, earliest }: { period: Period; today: Day; earliest: Day | null }) {
  const { snapshots, isPending } = useStrengthSnapshots();
  const navigate = useNavigate();
  const colors = useThemeColors();
  const report = useMemo(() => strengthReport(snapshots, period, today, earliest), [snapshots, period, today, earliest]);

  if (isPending) {
    return (
      <div className="empty-state">
        <Spinner />
      </div>
    );
  }
  if (!report.exercises.length && report.sessionCount === 0) {
    return (
      <EmptyStatsCard
        title="No Strength Workouts"
        icon={Dumbbell}
        message="Tick off sets in your strength sessions (Plan tab) to see weights, volume and personal records here."
      />
    );
  }

  return (
    <>
      <StatsCard title="Totals" icon={Dumbbell} trailing={periodTitle(period, today)}>
        <MetricGrid>
          <MetricTile title="Sessions" value={report.sessionCount.toLocaleString()} />
          <MetricTile title="Sets" value={report.setCount.toLocaleString()} />
          <MetricTile title="Volume" value={Format.volume(report.volume)} unit={Format.volumeUnit(report.volume)} />
          <MetricTile title="Exercises" value={report.exercises.length.toLocaleString()} />
        </MetricGrid>
      </StatsCard>

      {report.buckets.length > 1 && (
        <StatsCard title={`${bucketTitle(report.bucket)} Volume`} icon={BarChart3} trailing="kg">
          <div style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.buckets} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
                <XAxis dataKey="start" tickFormatter={bucketLabel(report.bucket)} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={8} />
                <YAxis orientation="right" tickLine={false} axisLine={false} width={44} tick={axisTick(colors.label2)} tickFormatter={(v: number) => Format.volume(v)} />
                <Bar dataKey="volume" fill={colors.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </StatsCard>
      )}

      {report.records.length > 0 && (
        <StatsCard title="Personal Records" icon={Trophy}>
          {report.records.slice(0, 8).map((record) => (
            <div key={`${record.key}-${record.kind}`} className="record-row">
              <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="truncate">{record.exercise}</span>
                <span className="caption secondary">
                  {recordTitle(record.kind)} · {longDate(record.day)}
                </span>
              </div>
              <span className="semibold tabular">{recordValue(record)}</span>
            </div>
          ))}
        </StatsCard>
      )}

      {report.exercises.length > 0 && (
        <>
          <Section header="Exercises">
            {report.exercises.slice(0, 8).map((exercise) => (
              <ExerciseRow key={exercise.key} exercise={exercise} onClick={() => navigate(`/stats/exercise/${encodeURIComponent(exercise.key)}`)} />
            ))}
            {report.exercises.length > 8 && (
              <Row className="action" onClick={() => navigate("/stats/exercises")}>
                <ListOrdered size={20} /> <span className="row-title">All Exercises</span>
                <ChevronRight size={18} className="chevron" />
              </Row>
            )}
          </Section>
        </>
      )}
    </>
  );
}

/** Estimated 1RMs are rounded to 0.5 kg and marked as approximate. */
export const recordValue = (record: { kind: string; value: number }) =>
  record.kind === "oneRepMax" ? `~${Format.weight(Math.round(record.value * 2) / 2)} kg` : `${Format.weight(record.value)} kg`;

function ExerciseRow({ exercise, onClick }: { exercise: ExerciseSummary; onClick: () => void }) {
  return (
    <Row chevron onClick={onClick}>
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="truncate">{exercise.name}</span>
        <span className="footnote secondary truncate">
          {exercise.maxWeight ? `Max ${Format.weight(exercise.maxWeight.value)} kg` : `${exercise.setCount} sets`}
          {exercise.bestOneRepMax ? ` · 1RM ~${Format.weight(Math.round(exercise.bestOneRepMax.value * 2) / 2)} kg` : ""}
          {exercise.lastDay ? ` · ${longDate(exercise.lastDay)}` : ""}
        </span>
      </div>
    </Row>
  );
}

/** All exercises ever trained. */
export function ExerciseListPage() {
  const { snapshots, isPending } = useStrengthSnapshots();
  const navigate = useNavigate();
  const exercises = useMemo(() => exerciseSummaries(snapshots).sort((a, b) => a.name.localeCompare(b.name)), [snapshots]);
  return (
    <div className="page">
      <NavBar large title="Exercises" leading={<BackButton label="Stats" fallback="/stats" />} />
      <div className="page-content">
        {isPending ? (
          <div className="empty-state">
            <Spinner />
          </div>
        ) : exercises.length === 0 ? (
          <EmptyState title="No exercises yet" />
        ) : (
          <Section>
            {exercises.map((exercise) => (
              <ExerciseRow key={exercise.key} exercise={exercise} onClick={() => navigate(`/stats/exercise/${encodeURIComponent(exercise.key)}`)} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

/** Progress chart and full history of one exercise. */
export function ExerciseDetailPage() {
  const { key = "" } = useParams();
  const { snapshots, isPending } = useStrengthSnapshots();
  const colors = useThemeColors();
  useToday();
  const exercise = useMemo(() => exerciseSummaries(snapshots).find((e) => e.key === key) ?? null, [snapshots, key]);

  if (!exercise) {
    return (
      <div className="page">
        <NavBar title="" leading={<BackButton label="Stats" fallback="/stats" />} />
        {isPending ? (
          <div className="empty-state">
            <Spinner />
          </div>
        ) : (
          <EmptyState title="No history for this exercise." />
        )}
      </div>
    );
  }
  const data = exercise.history.map((h) => ({ day: h.day, max: h.maxWeight, oneRM: h.bestOneRepMax }));
  return (
    <div className="page">
      <NavBar large title={exercise.name} leading={<BackButton label="Stats" fallback="/stats" />} />
      <div className="page-content">
        <StatsCard title="Best" icon={Trophy}>
          <MetricGrid>
            <MetricTile title="Max weight" value={exercise.maxWeight ? Format.weight(exercise.maxWeight.value) : "–"} unit="kg" detail={exercise.maxWeight ? longDate(exercise.maxWeight.day) : undefined} />
            <MetricTile title="Est. 1RM" value={exercise.bestOneRepMax ? Format.weight(Math.round(exercise.bestOneRepMax.value * 2) / 2) : "–"} unit="kg" detail="Epley" />
            <MetricTile title="Best set" value={exercise.bestSet ? setLabel(exercise.bestSet.set) : "–"} detail={exercise.bestSet ? longDate(exercise.bestSet.day) : undefined} />
            <MetricTile title="Total volume" value={Format.volume(exercise.totalVolume)} unit={Format.volumeUnit(exercise.totalVolume)} detail={`${exercise.setCount} sets`} />
          </MetricGrid>
        </StatsCard>
        {data.length > 1 && (
          <StatsCard title="Progress" icon={BarChart3} trailing="kg">
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
                  <XAxis dataKey="day" tickFormatter={(d: string) => longDate(d).replace(/ \d{4}$/, "")} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={20} />
                  <YAxis orientation="right" tickLine={false} axisLine={false} width={40} tick={axisTick(colors.label2)} domain={["auto", "auto"]} />
                  <Line dataKey="oneRM" stroke={colors.label3} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  <Line dataKey="max" stroke={colors.accent} strokeWidth={2.5} dot={{ r: 2.5, fill: colors.accent }} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Legend
              items={[
                { color: colors.accent, label: "Max weight" },
                { color: colors.label3, label: "Est. 1RM" },
              ]}
            />
          </StatsCard>
        )}
        <Section header="History">
          {[...exercise.history].reverse().map((h) => (
            <div key={h.sessionId} className="list-row">
              <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <span>{longDate(h.day)}</span>
                <span className="footnote secondary">{h.sets.map(setLabel).join(", ")}</span>
              </div>
              {h.maxWeight !== null && <span className="semibold tabular">{Format.weight(h.maxWeight)} kg</span>}
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}
