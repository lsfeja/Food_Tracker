import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { FoodDTO } from "../../../shared/api";
import { type EntrySource, type FoodDraft, isDraftComplete } from "../../../shared/food";
import * as Format from "../../../shared/format";
import { parseDecimal } from "../../../shared/format";
import { kcalFromMacros } from "../../../shared/nutrients";
import { errorMessage } from "../../api/client";
import { useSaveFood } from "../../api/nutrition";
import { BarButton, NavBar } from "../../components/NavBar";
import { SheetScroll } from "../../components/Sheet";
import { useToast } from "../../components/Toast";
import { DecimalInput, NumberField, Section, TextRow } from "../../components/ui";
import { FlowLeading, useFlow } from "./flow";

const optional = (value: number | null, maxFraction = 1) => (value === null ? "" : Format.editable(value, maxFraction));

/**
 * Create a food (optionally prefilled from Open Food Facts or a label photo) or edit an
 * existing one. All nutrient values are per 100 g.
 */
export function FoodEditorScreen({ draft, source, food }: { draft?: FoodDraft; source?: EntrySource; food?: FoodDTO }) {
  const flow = useFlow();
  const toast = useToast();
  const save = useSaveFood();
  const initial: FoodDraft = food
    ? {
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        kcal: food.kcal100,
        protein: food.protein100,
        carbs: food.carbs100,
        fat: food.fat100,
        servingGrams: food.servingG,
        source: food.source,
      }
    : draft!;

  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand ?? "");
  const [barcode, setBarcode] = useState(initial.barcode ?? "");
  const [kcal, setKcal] = useState(optional(initial.kcal, 0));
  const [protein, setProtein] = useState(optional(initial.protein));
  const [carbs, setCarbs] = useState(optional(initial.carbs));
  const [fat, setFat] = useState(optional(initial.fat));
  const [serving, setServing] = useState(optional(initial.servingGrams));

  const isEditing = Boolean(food);
  const kcalValue = parseDecimal(kcal);
  const isValid = name.trim().length > 0 && kcalValue !== null && kcalValue >= 0;
  const macroKcal = kcalFromMacros({ protein: parseDecimal(protein) ?? 0, carbs: parseDecimal(carbs) ?? 0, fat: parseDecimal(fat) ?? 0 });

  let notice: string | null = null;
  if (!isEditing && draft?.source === "label") notice = "Values were read from the label photo. Please check them against the label.";
  if (!isEditing && draft?.source === "openFoodFacts" && !isDraftComplete(draft)) notice = "Open Food Facts has incomplete data for this product. Please fill in the missing values.";

  const submit = async () => {
    if (!isValid || save.isPending) return;
    const servingValue = parseDecimal(serving);
    const input = {
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode.replace(/\D/g, "") || null,
      kcal: kcalValue,
      protein: parseDecimal(protein) ?? 0,
      carbs: parseDecimal(carbs) ?? 0,
      fat: parseDecimal(fat) ?? 0,
      servingGrams: servingValue !== null && servingValue > 0 ? servingValue : null,
      source: initial.source,
    };
    try {
      const saved = await save.mutateAsync({ id: food?.id, food: input });
      if (isEditing) flow.pop();
      else flow.replaceTop({ kind: "portion", food: saved, source: source ?? "manual" });
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  let hint: React.ReactNode = null;
  if (macroKcal > 0) {
    if (kcalValue !== null) {
      if (Math.abs(kcalValue - macroKcal) > Math.max(40, kcalValue * 0.2)) hint = `Macros add up to about ${Format.kcal(macroKcal)} kcal. Check the values.`;
    } else {
      hint = (
        <button type="button" onClick={() => setKcal(Format.editable(macroKcal, 0))}>
          Use {Format.kcal(macroKcal)} kcal (from macros)
        </button>
      );
    }
  }

  return (
    <>
      <NavBar
        inSheet
        title={isEditing ? "Edit Food" : "New Food"}
        leading={<FlowLeading />}
        trailing={
          <BarButton prominent onClick={submit} disabled={!isValid || save.isPending}>
            {isEditing ? "Save" : "Next"}
          </BarButton>
        }
      />
      <SheetScroll>
        {notice && (
          <Section>
            <div className="list-row footnote secondary" style={{ alignItems: "flex-start" }}>
              <TriangleAlert size={18} style={{ flex: "none" }} />
              <span>{notice}</span>
            </div>
          </Section>
        )}
        <Section>
          <TextRow value={name} onChange={setName} placeholder="Name" autoFocus={!initial.name} />
          <TextRow value={brand} onChange={setBrand} placeholder="Brand (optional)" />
        </Section>
        <Section header="Per 100 g" footer={hint}>
          <label className="list-row field-row compact">
            <span className="field-label">Calories</span>
            <DecimalInput value={kcal} onChange={setKcal} placeholder="0" autoFocus={Boolean(initial.name) && kcal === ""} ariaLabel="Calories" />
            <span className="unit">kcal</span>
          </label>
          <NumberField title="Protein" value={protein} onChange={setProtein} unit="g" />
          <NumberField title="Carbohydrates" value={carbs} onChange={setCarbs} unit="g" />
          <NumberField title="Fat" value={fat} onChange={setFat} unit="g" />
        </Section>
        <Section>
          <NumberField title="Serving size" value={serving} onChange={setServing} unit="g" placeholder="optional" />
          <label className="list-row field-row compact">
            <span className="field-label">Barcode</span>
            <input type="text" inputMode="numeric" value={barcode} placeholder="optional" onChange={(event) => setBarcode(event.target.value.replace(/\D/g, ""))} />
          </label>
        </Section>
      </SheetScroll>
    </>
  );
}
