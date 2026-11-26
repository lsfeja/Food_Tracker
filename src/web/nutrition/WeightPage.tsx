import { Plus, Trash2, Weight } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { addDays, addYears, type Day, dayToUTC, utcToDay } from "../../shared/days";
import * as Format from "../../shared/format";
import { averageAt, averageChange, bodyFatAverageAt, weeklyRate, type WeightPoint, weightSeries } from "../../shared/weight";
import { useDeleteWeight, useSetWeightExcluded, useWeights } from "../api/weight";
import { BackButton, BarButton, NavBar } from "../components/NavBar";
import { ActionSheet } from "../components/Sheet";
import { SwipeRow } from "../components/SwipeRow";
import { EmptyState, Row, Section, Segmented, Spinner } from "../components/ui";
import { dayMonth, shortDay } from "../lib/dates";
import { usePersistentState } from "../lib/usePersistentState";
import { useThemeColors } from "../lib/useThemeColors";
import { useLongPress } from "../lib/useLongPress";
import { useToday } from "../lib/useToday";
import { axisTick, longDate } from "../stats/chartUtils";
import { ChipPicker, Legend, MetricGrid, MetricTile, StatsCard } from "../stats/components";
import { WeightSheet } from "./WeightSheet";
import { CalibrationStatusRow } from "../calibration/CalibrationViews";

const RANGES = ["1m", "3m", "1y", "all"] as const;
type Range = (typeof RANGES)[number];
const rangeName: Record<Range, string> = { "1m": "1 month", "3m": "3 months", "1y": "1 year", all: "all time" };

function rangeStart(range: Range, today: Day, first: Day): Day {
  switch (range) {
    // Rolling windows (addMonths snaps to the 1st of the month).
    case "1m":
      return addDays(today, -30);
    case "3m":
      return addDays(today, -91);
    case "1y":
      return addYears(today, -1);
    case "all":
      return first < today ? first : today;
  }
}

/** Weight over time: daily values, 7-day average, weekly rate, body fat. */
export function WeightPage() {
  const today = useToday();
  const colors = useThemeColors();
  const weights = useWeights();
  const remove = useDeleteWeight();
  const setExcluded = useSetWeightExcluded();
  const [range, setRange] = usePersistentState<Range>("weight.range", "3m", RANGES);
  const [metric, setMetric] = useState<"weight" | "fat">("weight");
  const [editing, setEditing] = useState<Day | null>(null);

  const list = weights.data ?? [];
  const series = useMemo(() => weightSeries(list), [list]);
  const from = rangeStart(range, today, list[0]?.day ?? today);
  const visible = series.filter((p) => p.day >= from && p.day <= today);
  const hasBodyFat = series.some((p) => p.bodyFat !== null);
  const showFat = metric === "fat" && hasBodyFat;
  const chartPoints = showFat ? visible.filter((p) => p.bodyFat !== null) : visible;

  const usable = series.filter((p) => !p.excluded);
  const latest = usable[usable.length - 1] ?? series[series.length - 1];
  const latestFat = [...series].reverse().find((p) => p.bodyFat !== null);
  const average = averageAt(list, today);
  const fatAverage = bodyFatAverageAt(list, today);
  const rate = weeklyRate(list, today);
  const change = averageChange(visible);

  const values = chartPoints.flatMap((p) => (showFat ? [p.bodyFat!, ...(p.bodyFatAverage !== null ? [p.bodyFatAverage] : [])] : [p.weight, p.average]));
  const min = Math.floor(Math.min(...values) - 0.5);
  const max = Math.ceil(Math.max(...values) + 0.5);

  return (
    <div className="page">
      <NavBar
        large
        title="Weight"
        leading={<BackButton label="Today" fallback="/" />}
        trailing={
          <BarButton onClick={() => setEditing(today)} label="Log weight">
            <Plus size={26} />
          </BarButton>
        }
      />
      <div className="page-content">
        {weights.isPending ? (
          <div className="empty-state">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <Section>
            <EmptyState icon={<Weight size={26} />} title="No weight logged yet" message="Tap + to log your weight. Weigh yourself in the morning for comparable values." />
          </Section>
        ) : (
          <>
            <div className="stats-controls">
              <Segmented
                value={range}
                onChange={setRange}
                options={[
                  { value: "1m", label: "1M" },
                  { value: "3m", label: "3M" },
                  { value: "1y", label: "1Y" },
                  { value: "all", label: "All" },
                ]}
              />
            </div>

            <StatsCard title="Trend" icon={Weight} trailing={showFat ? "%" : "kg"}>
              {hasBodyFat && (
                <ChipPicker
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: "weight", label: "Weight" },
                    { value: "fat", label: "Body fat" },
                  ]}
                />
              )}
              {chartPoints.length === 0 ? (
                <span className="subheadline secondary">No values in this range.</span>
              ) : (
                <>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chartPoints.map((p) => {
                          const value = showFat ? p.bodyFat : p.weight;
                          return {
                            t: dayToUTC(p.day),
                            value: p.excluded ? null : value,
                            excludedValue: p.excluded ? value : null,
                            average: p.excluded ? null : showFat ? p.bodyFatAverage : p.average,
                          };
                        })}
                        margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid vertical={false} stroke={colors.separator} strokeDasharray="2 4" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          scale="time"
                          domain={[dayToUTC(from), dayToUTC(today)]}
                          tickFormatter={(t: number) => dayMonth(utcToDay(t))}
                          tickLine={false}
                          axisLine={false}
                          tick={axisTick(colors.label2)}
                          minTickGap={24}
                        />
                        <YAxis
                          orientation="right"
                          domain={[min, max]}
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          width={34}
                          tick={axisTick(colors.label2)}
                        />
                        <Line dataKey="value" stroke="transparent" dot={{ r: 2.5, fill: colors.label3, strokeWidth: 0 }} activeDot={false} isAnimationActive={false} />
                        <Line
                          dataKey="excludedValue"
                          stroke="transparent"
                          dot={{ r: 3, fill: "none", stroke: colors.label3, strokeWidth: 1.2 }}
                          activeDot={false}
                          isAnimationActive={false}
                        />
                        <Line dataKey="average" type="monotone" stroke={colors.accent} strokeWidth={2.5} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <Legend
                    items={[
                      { color: colors.label3, label: "Daily" },
                      { color: colors.accent, label: "7-day average" },
                    ]}
                  />
                </>
              )}
            </StatsCard>

            <StatsCard title="Summary" trailing={rangeName[range]}>
              <MetricGrid>
                <MetricTile title="Latest" value={Format.oneDecimal(latest.weight)} unit="kg" detail={longDate(latest.day)} />
                <MetricTile title="7-day average" value={average !== null ? Format.oneDecimal(average) : "–"} unit="kg" detail={average === null ? "no weigh-in this week" : undefined} />
                <MetricTile title="Per week" value={rate !== null ? Format.signedOneDecimal(rate) : "–"} unit="kg" detail={rate !== null ? "trend of the last 4 weeks" : "needs 2 weigh-ins a week apart"} />
                <MetricTile title="Change" value={change !== null ? Format.signedOneDecimal(change) : "–"} unit="kg" detail="7-day average in this range" />
                {latestFat && (
                  <MetricTile
                    title="Body fat"
                    value={Format.oneDecimal(fatAverage ?? latestFat.bodyFat!)}
                    unit="%"
                    detail={fatAverage !== null ? "7-day average" : longDate(latestFat.day)}
                  />
                )}
              </MetricGrid>
            </StatsCard>

            <CalibrationStatusRow />

            <Section header="Weigh-ins" footer="Hold a weigh-in to leave it out of the trend and the calibration (e.g. after a plasma donation, travel or illness).">
              {visible.length === 0 && <div className="list-row secondary">No weigh-ins in this range.</div>}
              {[...visible].reverse().map((point) => (
                <WeighInRow
                  key={point.day}
                  point={point}
                  onEdit={() => setEditing(point.day)}
                  onDelete={() => remove.mutate(point.day)}
                  onExclude={(excluded) => setExcluded.mutate({ day: point.day, excluded })}
                />
              ))}
            </Section>
          </>
        )}
      </div>
      {editing && <WeightSheet day={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** One weigh-in: tap = edit, swipe = delete, hold = exclude/include. */
function WeighInRow({ point, onEdit, onDelete, onExclude }: { point: WeightPoint; onEdit: () => void; onDelete: () => void; onExclude: (excluded: boolean) => void }) {
  const [menu, setMenu] = useState(false);
  const longPress = useLongPress(() => setMenu(true));
  return (
    <>
      <SwipeRow fullSwipe actions={[{ label: "Delete", icon: <Trash2 size={18} />, color: "red", onSelect: onDelete }]}>
        <div {...longPress.handlers}>
          <Row onClick={() => !longPress.consumed() && onEdit()}>
            <span className="row-title">
              {shortDay(point.day)}
              {point.excluded && <span className="caption secondary"> · excluded</span>}
            </span>
            <span className="row-value tabular">
              {point.bodyFat !== null && <span className="footnote">{Format.oneDecimal(point.bodyFat)} % · </span>}
              <span style={{ color: point.excluded ? "var(--label-3)" : "var(--label)", textDecoration: point.excluded ? "line-through" : undefined }}>
                {Format.oneDecimal(point.weight)} kg
              </span>
            </span>
          </Row>
        </div>
      </SwipeRow>
      {menu && (
        <ActionSheet
          title={shortDay(point.day)}
          onClose={() => setMenu(false)}
          actions={[
            point.excluded
              ? { label: "Include in trend", onSelect: () => onExclude(false) }
              : { label: "Exclude from trend", onSelect: () => onExclude(true) },
            { label: "Edit", onSelect: onEdit },
          ]}
        />
      )}
    </>
  );
}
