import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    // Docker Desktop's bind mount doesn't reliably deliver filesystem change
    // events into the container (content syncs; inotify doesn't) — chokidar
    // falls back to silently never noticing an edit. Polling doesn't depend
    // on those events at all, just re-stats files on an interval. Harmless
    // outside Docker too, just a touch more CPU than native watching.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // autoUpdate = the new service worker skips waiting and takes over
      // open tabs as soon as it's installed, so an overnight redeploy is
      // picked up on next load rather than parked behind the old version.
      registerType: "autoUpdate",
      devOptions: { enabled: true },
      workbox: {
        // The SPA fallback answers any navigation with the cached index.html.
        // /api is the backend's (same origin once nginx proxies it), so a
        // navigation there — e.g. opening an image URL — must hit the network.
        // Nothing under /api is precached or runtime-cached either, so a
        // stale auth response can never be served from the cache.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: "Nosh",
        short_name: "Nosh",
        description: "A self-hosted recipe manager",
        start_url: "/",
        display: "standalone",
        // Cookbook Editorial (2026-08-26) — paper page background, sauce-red
        // brand accent, replacing Citrus Pop's neutral-25/orange.
        background_color: "#f6f1e7",
        theme_color: "#b23a2e",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
