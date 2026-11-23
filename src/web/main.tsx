import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { QueryProvider } from "./api/queryClient";
import { App } from "./App";
import { initTheme } from "./lib/theme";
import "./styles/global.css";

// App shell offline; updates install in the background and apply on the next start.
registerSW({ immediate: true });
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
