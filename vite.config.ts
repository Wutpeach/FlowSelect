import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "./" : "/",
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
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. ignore generated desktop assets and local build roots
      ignored: ["**/desktop-assets/**", "**/build/**"],
    },
  },
}));
