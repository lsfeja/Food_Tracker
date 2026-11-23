import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { type Day, localToday } from "../../../shared/days";
import { AddFoodSheet } from "./AddFoodSheet";
import type { AddFoodMode } from "./flow";

interface Request {
  id: number;
  mode: AddFoodMode;
  day: Day;
}

const Context = createContext<{ open: (mode?: AddFoodMode, day?: Day) => void }>({ open: () => {} });

/** App-wide add-food sheet (opened from the + button, deep links and shortcuts). */
export function AddFoodProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const counter = useRef(0);
  const open = useCallback((mode: AddFoodMode = "search", day: Day = localToday()) => {
    counter.current += 1;
    setRequest({ id: counter.current, mode, day });
  }, []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Context.Provider value={value}>
      {children}
      {request && <AddFoodSheet key={request.id} mode={request.mode} day={request.day} onClose={() => setRequest(null)} />}
    </Context.Provider>
  );
}

export const useAddFood = () => useContext(Context);
