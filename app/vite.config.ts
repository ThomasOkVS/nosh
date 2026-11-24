import { defineConfig, defaultClientConditions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath } from "node:url";

const api = "http://localhost:3001";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    conditions: ["source", ...defaultClientConditions],
  },
  define: {
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(process.env.COMMIT_SHA ?? "dev"),
  },
  server: {
    proxy: { "/api": api, "/health": api },
  },
});
