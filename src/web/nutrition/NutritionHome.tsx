import { ChartColumnBig, Settings } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { isDay } from "../../shared/days";
import { BackButton, BarButton, NavBar } from "../components/NavBar";
import { dayTitle } from "../lib/dates";
import { useToday } from "../lib/useToday";
import { DayDashboard } from "./DayDashboard";

/** Nutrition tab root: today's dashboard, with History and Settings in the bar. */
export function NutritionHome() {
  const today = useToday();
  const navigate = useNavigate();
  return (
    <div className="page">
      <NavBar
        large
        title="Today"
        leading={
          <BarButton onClick={() => navigate("/history")} label="History">
            <ChartColumnBig size={24} />
          </BarButton>
        }
        trailing={
          <BarButton onClick={() => navigate("/settings")} label="Settings">
            <Settings size={24} />
          </BarButton>
        }
      />
      <DayDashboard key={today} day={today} />
    </div>
  );
}

/** A past (or future) day opened from History. */
export function DayPage() {
  const { day } = useParams();
  const today = useToday();
  if (!isDay(day)) return null;
  return (
    <div className="page">
      <NavBar title={dayTitle(day, today)} leading={<BackButton label="History" fallback="/history" />} />
      <div style={{ height: 16 }} />
      <DayDashboard key={day} day={day} />
    </div>
  );
}
