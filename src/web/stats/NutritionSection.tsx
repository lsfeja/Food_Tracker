import { Flame, Target, Utensils } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { addDays, type Day } from "../../shared/days";
import * as Format from "../../shared/format";
import { nutritionReport } from "../../shared/stats/nutrition";
import type { Period } from "../../shared/stats/period";
import { useSettings } from "../api/nutrition";
import { useAllTotals } from "../api/stats";
import { Spinner } from "../components/ui";
import { useThemeColors } from "../lib/useThemeColors";
import { axisTick, bucketLabel, bucketTitle } from "./chartUtils";
import { EmptyStatsCard, Legend, MetricGrid, MetricTile, StatsCard } from "./components";

export function NutritionSection({ period, today, earliest }: { period: Period; today: Day; earliest: Day | null }) {
  const totals = useAllTotals(addDays(today, 1));
  const settings = useSettings();
  const colors = useThemeColors();
  const report = useMemo(() => nutritionReport(totals.data ?? {}, settings, period, today, earliest), [totals.data, settings, period, today, earliest]);

  if (totals.isPending) {
    return (
      <div className="empty-state">
        <Spinner />
      </div>
    );
  }
  if (report.loggedDays === 0) {
    return <EmptyStatsCard title="No Entries" icon={Utensils} message="Log meals in the Nutrition tab to see averages and your budget over time." />;
  }

  return (
    <>
      <StatsCard title="Daily Average" icon={Utensils} trailing={`${report.loggedDays} days logged`}>
        <MetricGrid>
          <MetricTile title="Calories" value={Format.kcal(report.average.kcal)} unit="kcal" detail={`target ${Format.kcal(report.targets.kcal)}`} />
          <MetricTile title="Protein" value={Format.grams(report.average.protein)} unit="g" detail={`target ${Format.grams(report.targets.protein)}`} />
          <MetricTile title="Carbs" value={Format.grams(report.average.carbs)} unit="g" detail={`target ${Format.grams(report.targets.carbs)}`} />
          <MetricTile title="Fat" value={Format.grams(report.average.fat)} unit="g" detail={`target ${Format.grams(report.targets.fat)}`} />
        </MetricGrid>
        {report.buckets.length > 1 && (
          <>
            <span className="footnote secondary">{bucketTitle(report.bucket)} average (kcal per logged day)</span>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.buckets.map((b) => ({ start: b.start, kcal: b.average.kcal }))} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
                  <XAxis dataKey="start" tickFormatter={bucketLabel(report.bucket)} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={8} />
                  <YAxis orientation="right" tickLine={false} axisLine={false} width={40} tick={axisTick(colors.label2)} tickFormatter={(v: number) => Format.kcal(v)} />
                  <Bar dataKey="kcal" fill={colors.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <ReferenceLine y={report.targets.kcal} stroke={colors.label2} strokeDasharray="4 4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </StatsCard>

      <StatsCard title="Calorie Budget" icon={Target}>
        <MetricGrid>
          <MetricTile title="Within budget" value={report.daysWithin.toLocaleString()} unit="days" />
          <MetricTile title="Over budget" value={report.daysOver.toLocaleString()} unit="days" />
        </MetricGrid>
      </StatsCard>

      {report.energy.length > 1 && (
        <StatsCard title="Eaten vs. Active" icon={Flame} trailing="kcal">
          <div style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={report.energy.map((b) => ({ start: b.start, eaten: b.eaten.kcal, active: b.activeCalories }))}
                margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
                barGap={2}
              >
                <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
                <XAxis dataKey="start" tickFormatter={bucketLabel(report.energyBucket)} tickLine={false} axisLine={false} tick={axisTick(colors.label2)} minTickGap={8} />
                <YAxis orientation="right" tickLine={false} axisLine={false} width={44} tick={axisTick(colors.label2)} tickFormatter={(v: number) => Format.kcal(v)} />
                <Bar dataKey="eaten" fill={colors.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="active" fill={colors.blue} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              { color: colors.accent, label: "Eaten" },
              { color: colors.blue, label: "Active" },
            ]}
          />
        </StatsCard>
      )}
    </>
  );
}
