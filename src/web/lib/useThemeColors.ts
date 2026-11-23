import { useSyncExternalStore } from "react";

/** Resolved theme colors for SVG charts (CSS variables can't be used everywhere). */
export interface ThemeColors {
  dark: boolean;
  accent: string;
  orange: string;
  blue: string;
  label: string;
  label2: string;
  label3: string;
  separator: string;
  fill: string;
  card: string;
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let cache: { dark: boolean; colors: ThemeColors } | null = null;

function read(): ThemeColors {
  const dark = media?.matches ?? false;
  if (cache && cache.dark === dark) return cache.colors;
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const colors = {
    dark,
    accent: v("--accent"),
    orange: v("--orange"),
    blue: v("--blue"),
    label: v("--label"),
    label2: v("--label-2"),
    label3: v("--label-3"),
    separator: v("--separator"),
    fill: v("--fill-2"),
    card: v("--card"),
  };
  cache = { dark, colors };
  return colors;
}

function subscribe(callback: () => void) {
  media?.addEventListener("change", callback);
  return () => media?.removeEventListener("change", callback);
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, read, read);
}
