import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

// Dedicated dev-only Vite server for the MR9 Browser Presentation Lab.
//
// The Lab is a plain-browser page (lab.html -> src/lab/) that mounts the one
// production ExpandedPresentationSurface with synthetic ExpandedPresentationTarget
// inputs. It intentionally has no Electron preload/bridge and no downloader
// runtime: start it with `npm run dev:lab` and open:
//
//   http://127.0.0.1:1421/lab.html
//
// This config never participates in the production build (vite.config.ts pins
// build input to index.html only), so no packaged Electron renderer depends on
// the Lab entry.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  // An explicit Lab build is available for bundle-cost inspection. It never
  // changes the production Vite input, which remains index.html only.
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL("./lab.html", import.meta.url)),
    },
  },
  server: {
    port: 1421,
    strictPort: true,
    host: "127.0.0.1",
  },
}));
