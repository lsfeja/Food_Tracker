import { useState } from "react";
import { localToday } from "../../../shared/days";
import { parseDecimal } from "../../../shared/format";
import { errorMessage } from "../../api/client";
import { useLogEntry } from "../../api/nutrition";
import { BarButton, NavBar } from "../../components/NavBar";
import { SheetScroll } from "../../components/Sheet";
import { useToast } from "../../components/Toast";
import { DecimalInput, NumberField, Section, TextRow } from "../../components/ui";
import { timestampOn } from "../../lib/dates";
import { FlowLeading, useFlow } from "./flow";

/** Log calories (and optionally macros) directly, without creating a food. */
export function QuickAddScreen() {
  const flow = useFlow();
  const toast = useToast();
  const log = useLogEntry();
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const kcalValue = parseDecimal(kcal);
  const valid = kcalValue !== null && kcalValue > 0;

  const add = async () => {
    if (!valid || log.isPending) return;
    try {
      await log.mutateAsync({
        day: flow.day,
        loggedAt: flow.day === localToday() ? Date.now() : timestampOn(flow.day),
        source: "manual",
        name: name.trim() || "Quick add",
        kcal: kcalValue,
        protein: parseDecimal(protein) ?? 0,
        carbs: parseDecimal(carbs) ?? 0,
        fat: parseDecimal(fat) ?? 0,
      });
      navigator.vibrate?.(10);
      flow.finish();
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  return (
    <>
      <NavBar
        inSheet
        title="Quick Add"
        leading={<FlowLeading />}
        trailing={
          <BarButton prominent onClick={add} disabled={!valid || log.isPending}>
            Add
          </BarButton>
        }
      />
      <SheetScroll>
        <Section>
          <label className="list-row field-row compact">
            <span className="field-label">Calories</span>
            <DecimalInput value={kcal} onChange={setKcal} placeholder="0" autoFocus onEnter={add} className="title3" ariaLabel="Calories" />
            <span className="unit">kcal</span>
          </label>
        </Section>
        <Section header="Macros (optional)">
          <NumberField title="Protein" value={protein} onChange={setProtein} unit="g" />
          <NumberField title="Carbs" value={carbs} onChange={setCarbs} unit="g" />
          <NumberField title="Fat" value={fat} onChange={setFat} unit="g" />
        </Section>
        <Section>
          <TextRow value={name} onChange={setName} placeholder="Name (optional)" />
        </Section>
      </SheetScroll>
    </>
  );
}
