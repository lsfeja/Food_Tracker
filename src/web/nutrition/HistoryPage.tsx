import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { addDays, weekStart } from "../../shared/days";
import * as Format from "../../shared/format";
import { dayStats, type DayStat, weekStats, type WeekStat } from "../../shared/historyStats";
import { inputStart } from "../../shared/energyBudget";
import { useSettings, useTotals } from "../api/nutrition";
import { BackButton, NavBar } from "../components/NavBar";
import { Row, Section, Segmented, Spinner } from "../components/ui";
import { dayMonth, shortDay, weekdayNarrow } from "../lib/dates";
import { useThemeColors } from "../lib/useThemeColors";
import { useToday } from "../lib/useToday";

const WEEK_COUNT = 12;
const CHART_DAYS = 14;
const LIST_DAYS = 60;

/** Daily and weekly calorie totals with a small chart. */
export function HistoryPage() {
  const today = useToday();
  const settings = useSettings();
  const navigate = useNavigate();
  const [scope, setScope] = useState<"days" | "weeks">("days");
  const earliestWeek = addDays(weekStart(today), -7 * (WEEK_COUNT - 1));
  const earliestDay = addDays(today, -LIST_DAYS);
  const from = earliestWeek < earliestDay ? earliestWeek : earliestDay;
  // The weekly budget needs history before the first shown day.
  const totals = useTotals(inputStart(from), addDays(today, 1));
  const data = totals.data ?? {};

  const days = dayStats(today, LIST_DAYS, data, settings);
  const weeks = weekStats(today, WEEK_COUNT, data, settings);

  return (
    <div className="page">
      <NavBar title="History" large leading={<BackButton label="Today" fallback="/" />} />
      <div className="page-content">
        <Section>
          <div className="stack" style={{ gap: 12, padding: "12px 16px" }}>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: "days", label: "Days" },
                { value: "weeks", label: "Weeks" },
              ]}
            />
            {totals.isPending ? (
              <div className="empty-state">
                <Spinner />
              </div>
            ) : scope === "days" ? (
              <DayChart stats={days.slice(-CHART_DAYS)} target={average(days.slice(-CHART_DAYS).filter((d) => !d.untracked).map((d) => d.budget))} />
            ) : (
              <WeekChart stats={weeks} limit={weeks[weeks.length - 1]?.weekTarget ?? 0} />
            )}
          </div>
        </Section>
        {scope === "days" ? (
          <Section header="Days">
            {days.filter((d) => d.hasData || d.untracked).length === 0 && <div className="list-row secondary">No entries yet.</div>}
            {days
              .filter((d) => d.hasData || d.untracked)
              .reverse()
              .map((stat) => (
                <Row key={stat.day} chevron onClick={() => navigate(`/day/${stat.day}`)}>
                  <div className="grow stack" style={{ gap: 3 }}>
                    <span>{shortDay(stat.day)}</span>
                    <span className="caption secondary tabular">
                      P {Format.grams(stat.eaten.protein)} · C {Format.grams(stat.eaten.carbs)} · F {Format.grams(stat.eaten.fat)}
                    </span>
                  </div>
                  {stat.untracked ? <span className="footnote secondary">Not tracked</span> : <Totals eaten={stat.eaten.kcal} budget={stat.budget} carry={stat.carry} />}
                </Row>
              ))}
          </Section>
        ) : (
          <Section header="Weeks">
            {[...weeks].reverse().map((stat) => (
              <Row key={stat.start}>
                <div className="grow stack" style={{ gap: 3 }}>
                  <span>
                    {dayMonth(stat.start)} – {dayMonth(addDays(stat.start, 6))}
                  </span>
                  <span className="caption secondary tabular">
                    Ø {Format.kcal(stat.averagePerLoggedDay)} kcal · {stat.loggedDays} days logged
                  </span>
                </div>
                <Totals eaten={stat.eatenKcal} budget={stat.budget} />
              </Row>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

/** Eaten of the target; `carry` = part of the target from the weekly balance. */
function Totals({ eaten, budget, carry = 0 }: { eaten: number; budget: number; carry?: number }) {
  return (
    <div className="stack tabular" style={{ alignItems: "flex-end", gap: 3, flex: "none" }}>
      <span className="semibold" style={{ color: eaten > budget ? "var(--orange)" : undefined }}>
        {Format.kcal(eaten)} kcal
      </span>
      <span className="caption secondary">of {Format.kcal(budget)}</span>
      {Math.round(carry) !== 0 && (
        <span className="caption" style={{ color: carry > 0 ? "var(--accent)" : "var(--orange)" }}>
          {carry > 0 ? `incl. ${Format.signedKcal(carry)} uneaten` : `incl. ${Format.signedKcal(carry)} balance`}
        </span>
      )}
    </div>
  );
}

function Average({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="caption secondary">Average</span>
      <span className="title3 tabular">
        {Format.kcal(value)} kcal / {unit}
      </span>
    </div>
  );
}

const average = (values: number[]) => {
  const logged = values.filter((v) => v > 0);
  return logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
};

function DayChart({ stats, target }: { stats: DayStat[]; target: number }) {
  const colors = useThemeColors();
  return (
    <>
      <Average value={average(stats.filter((s) => !s.untracked).map((s) => s.eaten.kcal))} unit="day" />
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.map((s) => ({ day: s.day, kcal: s.eaten.kcal, over: s.eaten.kcal > s.budget }))} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="day" tickFormatter={weekdayNarrow} tickLine={false} axisLine={false} tick={{ fill: colors.label2, fontSize: 11 }} interval={0} />
            <YAxis orientation="right" tickLine={false} axisLine={false} width={40} tick={{ fill: colors.label2, fontSize: 11 }} tickFormatter={(v: number) => Format.kcal(v)} />
            <Bar dataKey="kcal" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {stats.map((s) => (
                <Cell key={s.day} fill={s.untracked ? colors.label3 : s.eaten.kcal > s.budget ? colors.orange : colors.accent} />
              ))}
            </Bar>
            <ReferenceLine y={target} stroke={colors.label2} strokeDasharray="4 4" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function WeekChart({ stats, limit }: { stats: WeekStat[]; limit: number }) {
  const colors = useThemeColors();
  return (
    <>
      <Average value={average(stats.map((s) => s.eatenKcal))} unit="week" />
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.map((s) => ({ start: s.start, kcal: s.eatenKcal }))} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="start" tickFormatter={dayMonth} tickLine={false} axisLine={false} tick={{ fill: colors.label2, fontSize: 11 }} interval={1} />
            <YAxis orientation="right" tickLine={false} axisLine={false} width={48} tick={{ fill: colors.label2, fontSize: 11 }} tickFormatter={(v: number) => Format.kcal(v)} />
            <Bar dataKey="kcal" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {stats.map((s) => (
                <Cell key={s.start} fill={s.eatenKcal > s.budget ? colors.orange : colors.accent} />
              ))}
            </Bar>
            <ReferenceLine y={limit} stroke={colors.label2} strokeDasharray="4 4" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
