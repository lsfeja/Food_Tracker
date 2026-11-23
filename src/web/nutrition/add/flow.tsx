import { ChevronLeft } from "lucide-react";
import { createContext, useContext } from "react";
import type { FoodDTO } from "../../../shared/api";
import type { Day } from "../../../shared/days";
import type { EntrySource, FoodDraft } from "../../../shared/food";

export type AddFoodMode = "search" | "barcode" | "label";

/** Screens inside the add-food sheet (the search screen is always the root). */
export type AddFoodRoute =
  | { kind: "search" }
  | { kind: "portion"; food: FoodDTO; source: EntrySource }
  | { kind: "newFood"; draft: FoodDraft; source: EntrySource }
  | { kind: "editFood"; food: FoodDTO }
  | { kind: "quickAdd" }
  | { kind: "barcode" }
  | { kind: "label"; barcode: string | null };

export interface AddFoodFlow {
  day: Day;
  depth: number;
  push(route: AddFoodRoute): void;
  /** Replaces the current screen (scanner → portion, so Back skips the scanner). */
  replaceTop(route: AddFoodRoute): void;
  pop(): void;
  /** Closes the sheet after logging. */
  finish(): void;
  close(): void;
}

export const FlowContext = createContext<AddFoodFlow | null>(null);

export function useFlow(): AddFoodFlow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("useFlow outside of AddFoodSheet");
  return flow;
}

export function initialStack(mode: AddFoodMode): AddFoodRoute[] {
  switch (mode) {
    case "barcode":
      return [{ kind: "search" }, { kind: "barcode" }];
    case "label":
      return [{ kind: "search" }, { kind: "label", barcode: null }];
    default:
      return [{ kind: "search" }];
  }
}

/** Cancel on the root screen, Back elsewhere. */
export function FlowLeading() {
  const flow = useFlow();
  if (flow.depth > 1) {
    return (
      <button type="button" className="bar-button back" onClick={flow.pop}>
        <ChevronLeft size={28} strokeWidth={2.2} style={{ marginRight: -2 }} />
        Back
      </button>
    );
  }
  return (
    <button type="button" className="bar-button" onClick={flow.close}>
      Cancel
    </button>
  );
}
