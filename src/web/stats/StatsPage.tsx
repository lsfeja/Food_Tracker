import { Calendar } from "lucide-react";
import { useState } from "react";
import { yearOf } from "../../shared/days";
import { type Period, type PeriodKind, periodTitle } from "../../shared/stats/period";
import { useStatsRange } from "../api/stats";
import { NavBar } from "../components/NavBar";
import { ActionSheet } from "../components/Sheet";
import { Segmented } from "../components/ui";
import { usePersistentState } from "../lib/usePersistentState";
import { useToday } from "../lib/useToday";
import { ChipPicker } from "./components";
import { EnduranceSection } from "./EnduranceSection";
import { NutritionSection } from "./NutritionSection";
import { PlanSection } from "./PlanSection";
import { StrengthSection } from "./StrengthSection";

const CATEGORIES = ["endurance", "strength", "plan", "nutrition"] as const;
type Category = (typeof CATEGORIES)[number];
const KINDS = ["week", "month", "year", "all"] as const;

/** Stats tab: period + year selection, then cards per category. */
export default function StatsPage() {
  const today = useToday();
  const range = useStatsRange();
  const [kind, setKind] = usePersistentState<PeriodKind>("stats.period", "year", KINDS);
  const [category, setCategory] = usePersistentState<Category>("stats.category", "endurance", CATEGORIES);
  const [year, setYear] = useState(yearOf(today));
  const [pickingYear, setPickingYear] = useState(false);

  const earliest = range.data?.earliest ?? null;
  const firstYear = Math.min(earliest ? yearOf(earliest) : yearOf(today), yearOf(today));
  const years = Array.from({ length: yearOf(today) - firstYear + 1 }, (_, i) => yearOf(today) - i);
  const period: Period = { kind, year };

  return (
    <div className="page">
      <NavBar
        large
        title="Stats"
        trailing={
          kind !== "all" && (
            <button type="button" className="bar-button" onClick={() => setPickingYear(true)} aria-label={`Year ${year}`}>
              <Calendar size={20} /> {year}
            </button>
          )
        }
      />
      <div className="stats-controls">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "year", label: "Year" },
            { value: "all", label: "All Time" },
          ]}
        />
        <ChipPicker
          value={category}
          onChange={setCategory}
          options={[
            { value: "endurance", label: "Endurance" },
            { value: "strength", label: "Strength" },
            { value: "plan", label: "Plan" },
            { value: "nutrition", label: "Nutrition" },
          ]}
        />
        <span className="footnote secondary">{periodTitle(period, today)}</span>
      </div>
      <div className="page-content">
        {category === "endurance" && <EnduranceSection period={period} today={today} earliest={earliest} />}
        {category === "strength" && <StrengthSection period={period} today={today} earliest={earliest} />}
        {category === "plan" && <PlanSection period={period} today={today} earliest={earliest} />}
        {category === "nutrition" && <NutritionSection period={period} today={today} earliest={earliest} />}
      </div>
      {pickingYear && (
        <ActionSheet title="Year" onClose={() => setPickingYear(false)} actions={years.map((y) => ({ label: String(y), onSelect: () => setYear(y) }))} />
      )}
    </div>
  );
}
