import { NavBar } from "../components/NavBar";
import { EmptyState } from "../components/ui";

export function StatsPage() {
  return (
    <div className="page">
      <NavBar large title="Stats" />
      <EmptyState title="Statistics coming soon." />
    </div>
  );
}
