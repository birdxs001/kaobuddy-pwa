import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "sw-version",
      closeBundle() {
        const swPath = "backend/static/sw.js";
        try {
          let content = readFileSync(swPath, "utf-8");
          if (content.includes("__BUILD_TS__")) {
            content = content.replaceAll("__BUILD_TS__", String(Date.now()));
            writeFileSync(swPath, content);
          }
        } catch {
          // sw.js may not exist (e.g. dev mode) — skip silently.
        }
      },
    },
  ],
  build: {
    outDir: "backend/static",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000"
    }
  }
});
