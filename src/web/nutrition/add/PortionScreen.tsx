import { useState } from "react";
import type { FoodDTO } from "../../../shared/api";
import type { EntrySource } from "../../../shared/food";
import * as Format from "../../../shared/format";
import { parseDecimal } from "../../../shared/format";
import { forAmount } from "../../../shared/nutrients";
import { errorMessage } from "../../api/client";
import { useFoods, useLogEntry } from "../../api/nutrition";
import { BarButton, NavBar } from "../../components/NavBar";
import { SheetFooter, SheetScroll } from "../../components/Sheet";
import { useToast } from "../../components/Toast";
import { DecimalInput } from "../../components/ui";
import { timestampOn } from "../../lib/dates";
import { localToday } from "../../../shared/days";
import { FlowLeading, useFlow } from "./flow";

/** Enter the amount in grams and log the food. The fastest path: one field, one button. */
export function PortionScreen({ food: initial, source }: { food: FoodDTO; source: EntrySource }) {
  const flow = useFlow();
  const toast = useToast();
  const log = useLogEntry();
  const foods = useFoods();
  const food = foods.data?.find((f) => f.id === initial.id) ?? initial;
  const [text, setText] = useState("");

  const suggested = food.lastAmountG ?? food.servingG ?? 100;
  const parsed = parseDecimal(text);
  const grams = text.trim() === "" ? suggested : parsed !== null && parsed > 0 ? parsed : null;
  const per100 = { kcal: food.kcal100, protein: food.protein100, carbs: food.carbs100, fat: food.fat100 };
  const nutrients = forAmount(per100, grams ?? 0);

  const presets: { grams: number; label: string }[] = [];
  if (food.servingG && food.servingG > 0) presets.push({ grams: food.servingG, label: `1 serving · ${Format.grams(food.servingG)} g` });
  if (food.lastAmountG && food.lastAmountG > 0 && food.lastAmountG !== food.servingG) presets.push({ grams: food.lastAmountG, label: `Last · ${Format.grams(food.lastAmountG)} g` });
  for (const g of [50, 100, 150, 200, 250]) if (!presets.some((p) => p.grams === g)) presets.push({ grams: g, label: `${g} g` });

  const submit = async () => {
    if (grams === null || log.isPending) return;
    try {
      const loggedAt = flow.day === localToday() ? Date.now() : timestampOn(flow.day);
      await log.mutateAsync({ day: flow.day, loggedAt, source, foodId: food.id, grams });
      navigator.vibrate?.(10);
      flow.finish();
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  return (
    <>
      <NavBar inSheet title={food.name} leading={<FlowLeading />} trailing={<BarButton onClick={() => flow.push({ kind: "editFood", food })}>Edit</BarButton>} />
      <SheetScroll>
        <div className="stack" style={{ gap: 28, padding: "16px 20px 24px" }}>
          <div className="stack center" style={{ gap: 4 }}>
            {food.brand && <span className="subheadline secondary">{food.brand}</span>}
            <span className="footnote secondary tabular">
              Per 100 g: {Format.kcal(food.kcal100)} kcal · P {Format.grams(food.protein100)} · C {Format.grams(food.carbs100)} · F {Format.grams(food.fat100)}
            </span>
          </div>
          <label className="big-amount">
            <DecimalInput value={text} onChange={setText} placeholder={Format.editable(suggested)} autoFocus onEnter={submit} ariaLabel="Amount in grams" />
            <span className="unit">g</span>
          </label>
          <div className="chips">
            {presets.map((preset) => (
              <button key={preset.grams} type="button" className={`chip ${grams === preset.grams && text !== "" ? "selected" : ""}`} onClick={() => setText(Format.editable(preset.grams))}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="preview-card">
            <PreviewValue value={Format.kcal(nutrients.kcal)} title="kcal" />
            <PreviewValue value={Format.grams(nutrients.protein)} title="Protein" />
            <PreviewValue value={Format.grams(nutrients.carbs)} title="Carbs" />
            <PreviewValue value={Format.grams(nutrients.fat)} title="Fat" />
          </div>
        </div>
      </SheetScroll>
      <SheetFooter>
        <button type="button" className="button tabular" disabled={grams === null || log.isPending} onClick={submit}>
          Add {Format.kcal(nutrients.kcal)} kcal
        </button>
      </SheetFooter>
    </>
  );
}

function PreviewValue({ value, title }: { value: string; title: string }) {
  return (
    <div>
      <span className="title3 tabular">{value}</span>
      <span className="caption secondary">{title}</span>
    </div>
  );
}
