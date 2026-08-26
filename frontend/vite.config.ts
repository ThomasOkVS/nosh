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
      registerType: "autoUpdate",
      devOptions: { enabled: true },
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
