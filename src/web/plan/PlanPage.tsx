import { NavBar } from "../components/NavBar";
import { EmptyState } from "../components/ui";

export function PlanPage() {
  return (
    <div className="page">
      <NavBar large title="Plan" />
      <EmptyState title="Training plan coming soon." />
    </div>
  );
}
