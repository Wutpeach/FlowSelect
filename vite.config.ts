import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "./" : "/",
  // The Browser Presentation Lab (lab.html + src/lab/) is a dev-only browser
  // entry served by vite.lab.config.ts on port 1421. Pin the production build
  // to exactly the one production entry so a packaged Electron renderer never
  // includes or depends on the Lab.
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL("./index.html", import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/dist-electron/**"],
  },

  // Vite options tailored for the Electron renderer dev server.
  //
  // 1. prevent Vite from obscuring Electron/Node build errors
  clearScreen: false,
  // 2. Electron dev expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    watch: {
      // 3. ignore generated desktop assets and local build roots
      ignored: ["**/desktop-assets/**", "**/build/**"],
    },
  },
}));
