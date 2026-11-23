import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import type { ReactNode } from "react";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: WEEK,
      // Show cached data offline; refetch when back online.
      networkMode: "offlineFirst",
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Fail fast offline instead of pausing silently.
      networkMode: "always",
      retry: 0,
    },
  },
});

/** Last loaded data survives reloads and offline starts (IndexedDB). */
const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => ((await get<string>(key)) ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: "foodtracker-cache",
  throttleTime: 2000,
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: WEEK, buster: "v1" }}>
      {children}
    </PersistQueryClientProvider>
  );
}
