import { useState } from "react";
import type { Day } from "../../shared/days";
import * as Format from "../../shared/format";
import { parseDecimal } from "../../shared/format";
import { BODY_FAT_RANGE, latestOnOrBefore, validBodyFat, validWeight, WEIGHT_RANGE } from "../../shared/weight";
import { useDeleteWeight, useSaveWeight, useWeights } from "../api/weight";
import { BarButton, NavBar } from "../components/NavBar";
import { ActionSheet, Sheet, SheetScroll } from "../components/Sheet";
import { NumberField, Row, Section } from "../components/ui";
import { useToday } from "../lib/useToday";

/** Log or edit the weight of a day (one value per day). */
export function WeightSheet({ day, onClose }: { day: Day; onClose: () => void }) {
  const today = useToday();
  const weights = useWeights();
  const save = useSaveWeight();
  const remove = useDeleteWeight();
  const list = weights.data ?? [];
  const existing = list.find((w) => w.day === day) ?? null;
  const previous = latestOnOrBefore(
    list.filter((w) => w.day !== day),
    day,
  );
  const [date, setDate] = useState(day);
  const [weight, setWeight] = useState(existing ? Format.editable(existing.weightKg, 2) : "");
  const [bodyFat, setBodyFat] = useState(existing?.bodyFatPct != null ? Format.editable(existing.bodyFatPct, 1) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const weightValue = parseDecimal(weight);
  const bodyFatValue = parseDecimal(bodyFat);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const isValid = validDate && validWeight(weightValue) && (bodyFat.trim() === "" || validBodyFat(bodyFatValue));
  const overwrites = date !== day && list.some((w) => w.day === date);

  const submit = () => {
    if (!isValid) return;
    save.mutate({
      entry: { day: date, weightKg: weightValue!, bodyFatPct: bodyFat.trim() === "" ? null : bodyFatValue, excluded: existing?.excluded ?? false },
      replaces: existing ? day : undefined,
    });
    onClose();
  };

  let hint = "Weigh yourself in the morning after the bathroom, before eating, for comparable values.";
  if (weight.trim() && !validWeight(weightValue)) hint = `Enter a weight between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max} kg.`;
  else if (bodyFat.trim() && !validBodyFat(bodyFatValue)) hint = `Body fat must be between ${BODY_FAT_RANGE.min} and ${BODY_FAT_RANGE.max} %.`;
  else if (overwrites) hint = "That day already has a weight; saving replaces it.";

  return (
    <Sheet onClose={onClose} label="Weight">
      <NavBar
        inSheet
        title={existing ? "Edit Weight" : "Log Weight"}
        leading={<BarButton onClick={onClose}>Cancel</BarButton>}
        trailing={
          <BarButton prominent onClick={submit} disabled={!isValid}>
            Save
          </BarButton>
        }
      />
      <SheetScroll>
        <Section footer={hint}>
          <NumberField title="Weight" value={weight} onChange={setWeight} unit="kg" placeholder={previous ? Format.editable(previous.weightKg, 1) : "0"} autoFocus />
          <NumberField title="Body fat" value={bodyFat} onChange={setBodyFat} unit="%" placeholder="optional" />
          <label className="list-row field-row compact">
            <span className="field-label">Date</span>
            <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} aria-label="Date" />
          </label>
        </Section>
        {existing && (
          <Section>
            <Row onClick={() => setConfirmDelete(true)} className="destructive">
              Delete Weight
            </Row>
          </Section>
        )}
      </SheetScroll>
      {confirmDelete && (
        <ActionSheet
          title="Delete this weight?"
          onClose={() => setConfirmDelete(false)}
          actions={[
            {
              label: "Delete",
              destructive: true,
              onSelect: () => {
                remove.mutate(day);
                onClose();
              },
            },
          ]}
        />
      )}
    </Sheet>
  );
}
