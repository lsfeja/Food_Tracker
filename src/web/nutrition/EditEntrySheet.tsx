import { useState } from "react";
import type { EntryDTO } from "../../shared/api";
import * as Format from "../../shared/format";
import { parseDecimal } from "../../shared/format";
import { forAmount, scaleNutrients } from "../../shared/nutrients";
import { errorMessage } from "../api/client";
import { type EntryPatch, useDeleteEntry, useFoods, useUpdateEntry } from "../api/nutrition";
import { BarButton, NavBar } from "../components/NavBar";
import { ActionSheet, Sheet, SheetScroll } from "../components/Sheet";
import { useToast } from "../components/Toast";
import { LabeledRow, NumberField, Row, Section, TextRow } from "../components/ui";
import { fromDateTimeLocal, toDateTimeLocal } from "../lib/dates";

const sourceName = { manual: "Manual", barcode: "Barcode", label: "Label photo", ai: "AI estimate" } as const;

/** Edit or delete a logged entry. Weight-based entries are edited by amount. */
export function EditEntrySheet({ entry, onClose }: { entry: EntryDTO; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateEntry();
  const remove = useDeleteEntry();
  const foods = useFoods();
  const [name, setName] = useState(entry.name);
  const [grams, setGrams] = useState(entry.grams !== null ? Format.editable(entry.grams) : "");
  const [kcal, setKcal] = useState(Format.editable(entry.kcal, 0));
  const [protein, setProtein] = useState(Format.editable(entry.protein));
  const [carbs, setCarbs] = useState(Format.editable(entry.carbs));
  const [fat, setFat] = useState(Format.editable(entry.fat));
  const [time, setTime] = useState(toDateTimeLocal(entry.loggedAt));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isWeightBased = (entry.grams ?? 0) > 0 || entry.foodId !== null;
  const gramsValue = parseDecimal(grams);
  const validGrams = gramsValue !== null && gramsValue > 0 ? gramsValue : null;
  const food = foods.data?.find((f) => f.id === entry.foodId);

  let preview = null;
  if (validGrams !== null) {
    if (entry.grams && entry.grams > 0) preview = scaleNutrients(entry, validGrams / entry.grams);
    else if (food) preview = forAmount({ kcal: food.kcal100, protein: food.protein100, carbs: food.carbs100, fat: food.fat100 }, validGrams);
  }

  const isValid = name.trim().length > 0 && (isWeightBased ? validGrams !== null : parseDecimal(kcal) !== null);

  const save = async () => {
    if (!isValid) return;
    const patch: EntryPatch = { name: name.trim() };
    const when = fromDateTimeLocal(time);
    if (when) {
      patch.loggedAt = when.epochMs;
      patch.day = when.day;
    }
    if (isWeightBased) {
      if (validGrams !== null) patch.grams = validGrams;
    } else {
      patch.kcal = parseDecimal(kcal) ?? entry.kcal;
      patch.protein = parseDecimal(protein) ?? 0;
      patch.carbs = parseDecimal(carbs) ?? 0;
      patch.fat = parseDecimal(fat) ?? 0;
    }
    try {
      await update.mutateAsync({ id: entry.id, patch });
      onClose();
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  return (
    <Sheet onClose={onClose} label="Edit entry">
      <NavBar
        inSheet
        title="Edit Entry"
        leading={<BarButton onClick={onClose}>Cancel</BarButton>}
        trailing={
          <BarButton prominent onClick={save} disabled={!isValid || update.isPending}>
            Save
          </BarButton>
        }
      />
      <SheetScroll>
        <Section>
          <TextRow value={name} onChange={setName} placeholder="Name" />
        </Section>
        {isWeightBased ? (
          <Section
            footer={
              preview && (
                <span className="tabular">
                  {Format.kcal(preview.kcal)} kcal · P {Format.grams(preview.protein)} g · C {Format.grams(preview.carbs)} g · F {Format.grams(preview.fat)} g
                </span>
              )
            }
          >
            <NumberField title="Amount" value={grams} onChange={setGrams} unit="g" />
          </Section>
        ) : (
          <Section header="Nutrients">
            <NumberField title="Calories" value={kcal} onChange={setKcal} unit="kcal" />
            <NumberField title="Protein" value={protein} onChange={setProtein} unit="g" />
            <NumberField title="Carbs" value={carbs} onChange={setCarbs} unit="g" />
            <NumberField title="Fat" value={fat} onChange={setFat} unit="g" />
          </Section>
        )}
        <Section>
          <label className="list-row field-row compact">
            <span className="field-label">Time</span>
            <input type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Time" />
          </label>
          <LabeledRow label="Source" value={sourceName[entry.source]} />
        </Section>
        <Section>
          <Row onClick={() => setConfirmDelete(true)} className="destructive">
            Delete Entry
          </Row>
        </Section>
      </SheetScroll>
      {confirmDelete && (
        <ActionSheet
          title="Delete this entry?"
          onClose={() => setConfirmDelete(false)}
          actions={[
            {
              label: "Delete",
              destructive: true,
              onSelect: () => {
                remove.mutate(entry);
                onClose();
              },
            },
          ]}
        />
      )}
    </Sheet>
  );
}
