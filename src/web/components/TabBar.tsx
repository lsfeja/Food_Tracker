import { CalendarDays, ChartSpline, Utensils } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type AppTab = "nutrition" | "plan" | "stats";

const TABS: { id: AppTab; label: string; root: string; icon: typeof Utensils }[] = [
  { id: "nutrition", label: "Nutrition", root: "/", icon: Utensils },
  { id: "plan", label: "Plan", root: "/plan", icon: CalendarDays },
  { id: "stats", label: "Stats", root: "/stats", icon: ChartSpline },
];

export function tabFor(pathname: string): AppTab {
  if (pathname.startsWith("/plan")) return "plan";
  if (pathname.startsWith("/stats")) return "stats";
  return "nutrition";
}

/** Each tab keeps its own navigation position, like iOS. */
const lastLocation: Partial<Record<AppTab, string>> = {};

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = tabFor(location.pathname);

  useEffect(() => {
    lastLocation[current] = location.pathname + location.search;
  }, [current, location.pathname, location.search]);

  return (
    <nav className="tabbar" aria-label="Tabs">
      <div className="tabbar-inner">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === current;
          return (
            <button
              key={tab.id}
              type="button"
              className={`tab ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (active) {
                  // Tapping the active tab pops to its root (or scrolls to top there).
                  if (location.pathname === tab.root) window.scrollTo({ top: 0, behavior: "smooth" });
                  else navigate(tab.root);
                } else {
                  navigate(lastLocation[tab.id] ?? tab.root);
                }
              }}
            >
              <Icon size={24} strokeWidth={active ? 2.3 : 1.9} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
