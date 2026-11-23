import { useEffect, useState } from "react";
import { type Day, localToday } from "../../shared/days";

/** The local calendar day; rolls over at midnight and when the app returns to the foreground. */
export function useToday(): Day {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const refresh = () => setToday((current) => (current === localToday() ? current : localToday()));
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime();
    const timer = window.setTimeout(refresh, midnight - now.getTime());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [today]);
  return today;
}
