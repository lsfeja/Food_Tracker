import { CloudOff } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useNavigate, useSearchParams } from "react-router-dom";
import { isDay } from "../shared/days";
import { useActivitySync, useStravaStatus } from "./api/activity";
import { useSettingsQuery, useUpdateSettings } from "./api/nutrition";
import { TabBar } from "./components/TabBar";
import { ToastProvider } from "./components/Toast";
import { useOnline } from "./lib/useOnline";
import { AddFoodProvider, useAddFood } from "./nutrition/add/AddFoodContext";
import type { AddFoodMode } from "./nutrition/add/flow";
import { DayPage, NutritionHome } from "./nutrition/NutritionHome";
import { SettingsPage } from "./nutrition/SettingsPage";
import { LibraryPage } from "./plan/LibraryPage";
import { PlanPage } from "./plan/PlanPage";
import { SessionDetailPage } from "./plan/SessionDetailPage";
import { WeekTemplateEditorPage, WeekTemplatesPage } from "./plan/WeekTemplatesPage";
import { Spinner } from "./components/ui";

// Chart-heavy screens are loaded on demand.
const HistoryPage = lazy(() => import("./nutrition/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const WeightPage = lazy(() => import("./nutrition/WeightPage").then((m) => ({ default: m.WeightPage })));
const StatsPage = lazy(() => import("./stats/StatsPage"));
const ExerciseListPage = lazy(() => import("./stats/StrengthSection").then((m) => ({ default: m.ExerciseListPage })));
const ExerciseDetailPage = lazy(() => import("./stats/StrengthSection").then((m) => ({ default: m.ExerciseDetailPage })));

function Layout() {
  const online = useOnline();
  useTimeZoneSync();
  useAutoSync();
  return (
    <ToastProvider>
      <AddFoodProvider>
        <div className="app">
          {!online && (
            <div className="offline-banner" style={{ paddingTop: "calc(6px + var(--safe-top))" }}>
              <CloudOff size={14} /> Offline – showing saved data
            </div>
          )}
          <Suspense
            fallback={
              <div className="empty-state" style={{ paddingTop: "calc(80px + var(--safe-top))" }}>
                <Spinner />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
        <TabBar />
        <ScrollRestoration getKey={(location) => location.pathname} />
      </AddFoodProvider>
    </ToastProvider>
  );
}

/** Strava sync when the app opens and returns to the foreground (at most every 10 min). */
function useAutoSync() {
  const sync = useActivitySync();
  const status = useStravaStatus();
  const connected = status.data?.connected === true;
  useEffect(() => {
    if (!connected) return;
    const run = () => document.visibilityState === "visible" && void sync(false).catch(() => {});
    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, [connected, sync]);
}

/** Keeps the server's time zone (used for scheduled syncs) in line with the device. */
function useTimeZoneSync() {
  const settings = useSettingsQuery();
  const update = useUpdateSettings();
  const remote = settings.data?.timezone;
  useEffect(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (remote && local && remote !== local && settings.isFetchedAfterMount) update({ timezone: local });
  }, [remote, settings.isFetchedAfterMount, update]);
}

/** Deep link: /add?mode=search|barcode|label&day=YYYY-MM-DD (bookmark it on the Home Screen). */
function AddRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const addFood = useAddFood();
  useEffect(() => {
    const mode = params.get("mode");
    const day = params.get("day");
    navigate("/", { replace: true });
    addFood.open(mode === "barcode" || mode === "label" ? (mode as AddFoodMode) : "search", isDay(day) ? day : undefined);
  }, [params, navigate, addFood]);
  return null;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <NutritionHome /> },
      { path: "/day/:day", element: <DayPage /> },
      { path: "/history", element: <HistoryPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/weight", element: <WeightPage /> },
      { path: "/add", element: <AddRoute /> },
      { path: "/plan", element: <PlanPage /> },
      { path: "/plan/session/:id", element: <SessionDetailPage /> },
      { path: "/plan/library", element: <LibraryPage /> },
      { path: "/plan/templates", element: <WeekTemplatesPage /> },
      { path: "/plan/templates/:id", element: <WeekTemplateEditorPage /> },
      { path: "/stats", element: <StatsPage /> },
      { path: "/stats/exercises", element: <ExerciseListPage /> },
      { path: "/stats/exercise/:key", element: <ExerciseDetailPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
