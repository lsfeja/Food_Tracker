import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      // Behind Cloudflare Access the manifest request must carry the Access cookie.
      useCredentials: true,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Foodtracker",
        short_name: "Foodtracker",
        description: "Nutrition tracking, training plan and stats.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F2F2F7",
        theme_color: "#28AD5A",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Android long-press shortcuts (iOS: bookmark these URLs to the Home Screen instead).
        shortcuts: [
          { name: "Log Food", url: "/add", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
          { name: "Scan Barcode", url: "/add?mode=barcode", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
          { name: "Training Plan", url: "/plan", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
        ],
      },
      workbox: {
        // App shell only; API data is cached by the client (TanStack Query persister).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // OCR engine + language data (~15 MB) are cached on first use, not precached.
        globIgnores: ["ocr/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/ocr/"),
            handler: "CacheFirst",
            options: { cacheName: "ocr", expiration: { maxEntries: 10 } },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // `npm run dev` (Vite) + `npm run dev:worker` (wrangler dev on :8787)
    proxy: { "/api": "http://localhost:8787" },
  },
});
