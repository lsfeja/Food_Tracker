import { Weight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Day } from "../../shared/days";
import * as Format from "../../shared/format";
import { averageAt, weeklyRate } from "../../shared/weight";
import { useWeights } from "../api/weight";
import { Row, Section } from "../components/ui";
import { WeightSheet } from "./WeightSheet";

/** Weight of the day (tap to log/edit) and the trend (opens the weight page). */
export function WeightSection({ day }: { day: Day }) {
  const navigate = useNavigate();
  const weights = useWeights();
  const [editing, setEditing] = useState(false);
  const list = weights.data ?? [];
  const entry = list.find((w) => w.day === day);
  const average = averageAt(list, day);
  const rate = weeklyRate(list, day);

  return (
    <Section>
      <Row onClick={() => setEditing(true)}>
        <Weight size={20} className="accent" style={{ flex: "none" }} />
        <span className="row-title">Weight</span>
        {entry ? (
          <span className="row-value tabular">
            {Format.oneDecimal(entry.weightKg)} kg
            {entry.bodyFatPct !== null && ` · ${Format.oneDecimal(entry.bodyFatPct)} %`}
          </span>
        ) : (
          <span className="accent semibold">Log</span>
        )}
      </Row>
      {list.length > 0 && (
        <Row chevron onClick={() => navigate("/weight")}>
          <span className="row-title">Trend</span>
          <span className="row-value tabular">
            {[average !== null && `Ø ${Format.oneDecimal(average)} kg`, rate !== null && `${Format.signedOneDecimal(rate)} kg/wk`].filter(Boolean).join(" · ") || "Show"}
          </span>
        </Row>
      )}
      {editing && <WeightSheet day={day} onClose={() => setEditing(false)} />}
    </Section>
  );
}
