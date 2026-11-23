import { Barcode, ChevronRight, EyeOff, Pencil, PlusCircle, Plus, ScanText, Search, SquarePen, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { FoodDTO } from "../../../shared/api";
import { emptyDraft, type FoodDraft } from "../../../shared/food";
import * as Format from "../../../shared/format";
import { errorMessage } from "../../api/client";
import { draftToFoodInput, offApi, useFoods, useHideFood, useSaveFood } from "../../api/nutrition";
import { NavBar } from "../../components/NavBar";
import { SheetScroll } from "../../components/Sheet";
import { SwipeRow } from "../../components/SwipeRow";
import { useToast } from "../../components/Toast";
import { Row, Section, Spinner } from "../../components/ui";
import { shortDay } from "../../lib/dates";
import { useToday } from "../../lib/useToday";
import { FlowLeading, useFlow } from "./flow";

type Online = { query: string; phase: "loading" } | { query: string; phase: "loaded"; drafts: FoodDraft[] } | { query: string; phase: "failed"; message: string };

export function foodSubtitle(food: Pick<FoodDTO, "brand" | "kcal100">): string {
  const energy = `${Format.kcal(food.kcal100)} kcal / 100 g`;
  return food.brand ? `${food.brand} · ${energy}` : energy;
}

/** Root of the add-food sheet: quick actions, recent/frequent foods and search. */
export function FoodSearchScreen() {
  const flow = useFlow();
  const today = useToday();
  const foods = useFoods();
  const hide = useHideFood();
  const save = useSaveFood();
  const toast = useToast();
  const [text, setText] = useState("");
  const [online, setOnline] = useState<Online | null>(null);
  const query = text.trim();
  const all = foods.data ?? [];

  const suggestions = useMemo(() => {
    const recent = all
      .filter((f) => f.lastUsedAt !== null)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, 8);
    const recentIds = new Set(recent.map((f) => f.id));
    const frequent = all
      .filter((f) => f.useCount >= 2 && !recentIds.has(f.id))
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 8);
    const shown = new Set([...recentIds, ...frequent.map((f) => f.id)]);
    const others = all.filter((f) => !shown.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { recent, frequent, others };
  }, [all]);

  const matches = useMemo(() => {
    if (!query) return [];
    const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const q = normalize(query);
    return all
      .filter((food) => {
        const haystack = normalize(`${food.name} ${food.brand ?? ""} ${food.barcode ?? ""}`);
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => {
        const ap = normalize(a.name).startsWith(q);
        const bp = normalize(b.name).startsWith(q);
        if (ap !== bp) return ap ? -1 : 1;
        if (a.useCount !== b.useCount) return b.useCount - a.useCount;
        return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
      });
  }, [all, query]);

  const searchOnline = async () => {
    const term = query;
    if (!term) return;
    setOnline({ query: term, phase: "loading" });
    try {
      const drafts = await offApi.search(term);
      setOnline((current) => (current?.query === term ? { query: term, phase: "loaded", drafts } : current));
    } catch (error) {
      setOnline((current) => (current?.query === term ? { query: term, phase: "failed", message: errorMessage(error) } : current));
    }
  };

  const pickDraft = async (draft: FoodDraft) => {
    try {
      const food = await save.mutateAsync({ food: draftToFoodInput(draft) });
      flow.push({ kind: "portion", food, source: "manual" });
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  const foodRow = (food: FoodDTO) => (
    <SwipeRow
      key={food.id}
      actions={[
        { label: "Hide", icon: <EyeOff size={18} />, color: "gray", onSelect: () => hide.mutate(food) },
        { label: "Edit", icon: <Pencil size={18} />, color: "accent", onSelect: () => flow.push({ kind: "editFood", food }) },
      ]}
    >
      <Row onClick={() => flow.push({ kind: "portion", food, source: "manual" })}>
        <div className="grow stack" style={{ gap: 3 }}>
          <span className="truncate">{food.name}</span>
          <span className="footnote secondary truncate">{foodSubtitle(food)}</span>
        </div>
        {food.lastAmountG !== null && <span className="footnote tertiary tabular">{Format.grams(food.lastAmountG)} g</span>}
        <ChevronRight className="chevron" size={18} strokeWidth={2.5} />
      </Row>
    </SwipeRow>
  );

  const title = flow.day === today ? "Add Food" : `Add to ${shortDay(flow.day)}`;
  const newFood = () => flow.push({ kind: "newFood", draft: emptyDraft({ name: query }), source: "manual" });

  return (
    <>
      <NavBar inSheet flat title={title} leading={<FlowLeading />} />
      <div className="sheet-search">
        <label className="search-field">
          <Search size={17} />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search foods"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
                void searchOnline();
              }
            }}
          />
          {text && (
            <button type="button" aria-label="Clear" onClick={() => setText("")} className="tertiary" style={{ display: "flex" }}>
              <X size={16} />
            </button>
          )}
        </label>
      </div>
      <SheetScroll>
        <div style={{ height: 16 }} />
        <div className="quick-actions">
          <QuickAction icon={<Barcode size={22} />} title="Scan" onClick={() => flow.push({ kind: "barcode" })} />
          <QuickAction icon={<ScanText size={22} />} title="Label" onClick={() => flow.push({ kind: "label", barcode: null })} />
          <QuickAction icon={<SquarePen size={22} />} title="New Food" onClick={newFood} />
          <QuickAction icon={<Zap size={22} />} title="Quick Add" onClick={() => flow.push({ kind: "quickAdd" })} />
        </div>

        {!query && (
          <>
            {foods.isPending && (
              <div className="empty-state">
                <Spinner />
              </div>
            )}
            {foods.isSuccess && all.length === 0 && (
              <Section>
                <div className="list-row footnote secondary">Your foods will appear here. Scan a barcode, photograph a label or create a food.</div>
              </Section>
            )}
            {suggestions.recent.length > 0 && <Section header="Recent">{suggestions.recent.map(foodRow)}</Section>}
            {suggestions.frequent.length > 0 && <Section header="Frequent">{suggestions.frequent.map(foodRow)}</Section>}
            {suggestions.others.length > 0 && <Section header="My Foods">{suggestions.others.map(foodRow)}</Section>}
          </>
        )}

        {query && (
          <>
            <Section header="My Foods">
              {matches.length === 0 && <div className="list-row secondary">No saved food matches “{query}”.</div>}
              {matches.map(foodRow)}
              <Row onClick={newFood} className="action">
                <Plus size={20} />
                <span className="row-title">Create “{query}”</span>
              </Row>
            </Section>
            <Section header="Open Food Facts">
              {online?.query !== query ? (
                <Row onClick={() => void searchOnline()} className="action">
                  <Search size={20} />
                  <span className="row-title">Search online for “{query}”</span>
                </Row>
              ) : online.phase === "loading" ? (
                <div className="list-row">
                  <Spinner />
                  <span className="secondary">Searching…</span>
                </div>
              ) : online.phase === "failed" ? (
                <div className="list-row stack" style={{ alignItems: "flex-start", gap: 6 }}>
                  <span className="footnote secondary">Search failed. {online.message}</span>
                  <button type="button" className="accent" onClick={() => void searchOnline()}>
                    Try Again
                  </button>
                </div>
              ) : online.drafts.length === 0 ? (
                <div className="list-row secondary">No results.</div>
              ) : (
                online.drafts.map((draft, index) => (
                  <Row key={`${draft.barcode ?? draft.name}-${index}`} onClick={() => void pickDraft(draft)} disabled={save.isPending}>
                    <div className="grow stack" style={{ gap: 3 }}>
                      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{draft.name}</span>
                      <span className="footnote secondary truncate">{foodSubtitle({ brand: draft.brand, kcal100: draft.kcal ?? 0 })}</span>
                    </div>
                    <PlusCircle size={22} className="accent" style={{ flex: "none" }} />
                  </Row>
                ))
              )}
            </Section>
          </>
        )}
      </SheetScroll>
    </>
  );
}

function QuickAction({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" className="quick-action" onClick={onClick}>
      {icon}
      <span>{title}</span>
    </button>
  );
}
