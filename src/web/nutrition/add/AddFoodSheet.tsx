import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import type { Day } from "../../../shared/days";
import { NavBar } from "../../components/NavBar";
import { Sheet, SheetScroll } from "../../components/Sheet";
import { Spinner } from "../../components/ui";
import { type AddFoodFlow, type AddFoodMode, type AddFoodRoute, FlowContext, FlowLeading, initialStack } from "./flow";
import { FoodEditorScreen } from "./FoodEditorScreen";
import { FoodSearchScreen } from "./FoodSearchScreen";
import { PortionScreen } from "./PortionScreen";
import { QuickAddScreen } from "./QuickAddScreen";

// Camera and OCR code is loaded on demand.
const BarcodeScreen = lazy(() => import("../scan/BarcodeScreen"));
const LabelScreen = lazy(() => import("../scan/LabelScreen"));

export function AddFoodSheet({ mode, day, onClose }: { mode: AddFoodMode; day: Day; onClose: () => void }) {
  const [stack, setStack] = useState<AddFoodRoute[]>(() => initialStack(mode));

  const push = useCallback((route: AddFoodRoute) => setStack((s) => [...s, route]), []);
  const replaceTop = useCallback((route: AddFoodRoute) => setStack((s) => [...s.slice(0, -1), route]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const flow = useMemo<AddFoodFlow>(
    () => ({ day, depth: stack.length, push, replaceTop, pop, finish: onClose, close: onClose }),
    [day, stack.length, push, replaceTop, pop, onClose],
  );

  const top = stack[stack.length - 1];
  return (
    <Sheet onClose={onClose} label="Add food" full={top.kind === "barcode"}>
      <FlowContext.Provider value={flow}>
        <div key={stack.length} className={`flow-screen ${stack.length > 1 ? "pushed" : ""}`}>
          <Suspense fallback={<LoadingScreen />}>
            <Screen route={top} />
          </Suspense>
        </div>
      </FlowContext.Provider>
    </Sheet>
  );
}

function Screen({ route }: { route: AddFoodRoute }) {
  switch (route.kind) {
    case "search":
      return <FoodSearchScreen />;
    case "portion":
      return <PortionScreen food={route.food} source={route.source} />;
    case "newFood":
      return <FoodEditorScreen draft={route.draft} source={route.source} />;
    case "editFood":
      return <FoodEditorScreen food={route.food} />;
    case "quickAdd":
      return <QuickAddScreen />;
    case "barcode":
      return <BarcodeScreen />;
    case "label":
      return <LabelScreen barcode={route.barcode} />;
  }
}

function LoadingScreen() {
  return (
    <>
      <NavBar inSheet title="" leading={<FlowLeading />} />
      <SheetScroll>
        <div className="empty-state">
          <Spinner />
        </div>
      </SheetScroll>
    </>
  );
}
