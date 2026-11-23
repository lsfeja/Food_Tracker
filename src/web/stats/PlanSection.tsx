import { ListChecks, Timer } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { Day } from "../../shared/days";
import * as Format from "../../shared/format";
import type { Period } from "../../shared/stats/period";
import { periodTitle } from "../../shared/stats/period";
import { planReport } from "../../shared/stats/plan";
import { sportInfo, type SportType } from "../../shared/workout";
import { useStatsActivities, useStatsSessions } from "../api/stats";
import { Spinner } from "../components/ui";
import { useThemeColors } from "../lib/useThemeColors";
import { axisTick, bucketLabel } from "./chartUtils";
import { Legend, MetricGrid, MetricTile, sportPalette, StatsCard } from "./components";

export function PlanSection({ period, today, earliest }: { period: Period; today: Day; earliest: Day | null }) {
  const sessions = useStatsSessions();
  const activities = useStatsActivities();
  const colors = useThemeColors();
  const report = useMemo(
    () =>
      planReport(
        sessions.data ?? [],
        (activities.data ?? []).map((a) => ({ key: a.key, day: a.day, type: a.type, movingS: a.movingS })),
        period,
        today,
        earliest,
      ),
    [sessions.data, activities.data, period, today, earliest],
  );

  if (sessions.isPending || activities.isPending) {
    return (
      <div className="empty-state">
        <Spinner />
      </div>
    );
  }

  const palette = sportPalette(colors.dark);
  const sports: SportType[] = report.totals.map((t) => t.sport);
  const colorOf = (sport: SportType) => palette[sports.indexOf(sport) % palette.length];
  const timeRows = new Map<Day, Record<string, number | string>>();
  for (const item of report.time) {
    const row = timeRows.get(item.start) ?? { start: item.start };
    row[item.sport] = item.minutes / 60;
    timeRows.set(item.start, row);
  }
  const timeData = [...timeRows.values()].sort((a, b) => String(a.start).localeCompare(String(b.start)));

  return (
    <>
      <StatsCard title="Adherence" icon={ListChecks} trailing={periodTitle(period, today)}>
        {report.plannedToDate === 0 ? (
          <span className="subheadline secondary">No sessions planned in this period.</span>
        ) : (
          <>
            <MetricGrid>
              <MetricTile
                title="Completed"
                value={`${report.completed} / ${report.plannedToDate}`}
                detail={report.rate !== null ? `${Math.round(report.rate * 100)} % of planned` : undefined}
              />
              <MetricTile title="Skipped" value={report.skipped.toLocaleString()} detail="up to today" />
            </MetricGrid>
            {report.adherence.length > 1 && (
              <>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.adherence} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
                      <XAxis dataKey="start" tickFormatter={bucketLabel(report.adherenceBucket)} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={8} />
                      <YAxis orientation="right" tickLine={false} axisLine={false} width={28} tick={axisTick(colors.label2)} allowDecimals={false} />
                      <Bar dataKey="planned" fill={colors.fill} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="completed" fill={colors.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Legend
                  items={[
                    { color: colors.accent, label: "Completed" },
                    { color: colors.fill, label: "Planned" },
                  ]}
                />
              </>
            )}
          </>
        )}
      </StatsCard>

      <StatsCard title="Training Time" icon={Timer} trailing={Format.duration(report.totalMinutes)}>
        {report.totalMinutes === 0 ? (
          <span className="subheadline secondary">No completed sessions or activities in this period.</span>
        ) : (
          <>
            {timeData.length > 1 && (
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeData} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
                    <XAxis dataKey="start" tickFormatter={bucketLabel(report.timeBucket)} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={8} />
                    <YAxis orientation="right" tickLine={false} axisLine={false} width={28} tick={axisTick(colors.label2)} tickFormatter={(v: number) => `${Math.round(v)}h`} />
                    {sports.map((sport, index) => (
                      <Bar key={sport} dataKey={sport} stackId="time" fill={colorOf(sport)} radius={index === sports.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="stack" style={{ gap: 8 }}>
              {report.totals.map((t) => (
                <div key={t.sport} className="row">
                  <i style={{ width: 8, height: 8, borderRadius: "50%", background: colorOf(t.sport), flex: "none" }} />
                  <span className="grow subheadline">{sportInfo[t.sport].name}</span>
                  <span className="subheadline secondary tabular">{Format.duration(t.minutes)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </StatsCard>
    </>
  );
}
