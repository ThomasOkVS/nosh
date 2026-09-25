import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defaultClientConditions, defaultServerConditions } from "vite";

// "source" makes workspace packages (@nosh/units) resolve to their TypeScript
// source via their package.json `exports` instead of their compiled dist/, so
// the frontend never needs a separate build step for them. See
// docs/decisions.md#shared-units-package.
const workspaceSourceCondition = "source";

export default defineConfig({
  resolve: {
    conditions: [workspaceSourceCondition, ...defaultClientConditions],
  },
  ssr: {
    resolve: {
      conditions: [workspaceSourceCondition, ...defaultServerConditions],
    },
  },
  server: {
    // The browser calls the API on the page's own origin under /api, exactly
    // as in production, where frontend/nginx.conf does this forwarding. So
    // dev needs no CORS either. API_PROXY_TARGET is where the backend is
    // reachable from the Vite process: `backend:3001` inside docker-compose,
    // localhost when Vite runs on the host. Same idea as Angular CLI's
    // proxy.conf.json. The Origin header is passed through untouched (no
    // changeOrigin), which is what the backend's origin check compares
    // against FRONTEND_ORIGINS.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
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
      // Our own service worker (src/sw.ts) rather than a generated one — it
      // needs push-notification handlers. The plugin still builds it and
      // injects the precache manifest into it.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      // `type: "module"` because in dev the worker is served unbundled,
      // straight from src/sw.ts with its ES imports.
      devOptions: { enabled: true, type: "module" },
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
