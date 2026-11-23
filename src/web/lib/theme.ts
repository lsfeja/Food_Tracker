import { useSyncExternalStore } from "react";

/** Appearance: follow the system or force light/dark (stored per device). */
export type ThemePreference = "system" | "light" | "dark";

const KEY = "theme";
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const listeners = new Set<() => void>();

export function themePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export const isDarkTheme = () => document.documentElement.dataset.theme === "dark";

/** Sets data-theme on <html> (the CSS reads it) and the status bar color. */
export function applyTheme() {
  const preference = themePreference();
  const dark = preference === "dark" || (preference === "system" && (media?.matches ?? false));
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#F2F2F7");
  for (const listener of listeners) listener();
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // Private mode: applies until the app is closed.
  }
  current = preference;
  applyTheme();
}

let current: ThemePreference = typeof window !== "undefined" ? themePreference() : "system";

/** Follows system changes while "system" is selected. */
export function initTheme() {
  applyTheme();
  media?.addEventListener("change", () => {
    if (current === "system") applyTheme();
  });
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, () => current, () => "system");
}
