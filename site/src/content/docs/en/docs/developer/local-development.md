---
title: Local Development
description: Ameow's dev server startup chain, preflight process, development ports, and renderer URL override.
---

## Quick Start

```bash
npm install        # Install root dependencies
npm run dev        # Start the full development environment
```

`npm run dev` is equivalent to `npm run electron:dev`. Both run a preflight via the `predev` / `preelectron:dev` hooks.

## Dev Server Startup Chain

`npm run dev` executes the following sequence (`scripts/run-electron-dev.mjs`):

1. **Preflight** (`scripts/dev-preflight.mjs`): checks if locales are stale (runs `locales:sync` only if needed), ensures the bundled Python runtime is cached.
2. **Vite renderer**: starts Vite dev server at `127.0.0.1:1420` (`strictPort` — fails if the port is taken).
3. **TypeScript compile**: initial `tsc -p tsconfig.electron.json`, waits for compiled output.
4. **Electron launch**: injects `AMEOW_ELECTRON_DEV_SERVER_URL=http://127.0.0.1:1420`, starts the Electron main process to load the renderer.
5. **tsc watch**: enters watch mode; on successful TypeScript rebuild, Electron automatically restarts.

If you change Electron code (`electron/` directory) but don't see effects, the tsc watch is likely still rebuilding — wait for the rebuild success message in the console, and Electron will restart automatically.

## Renderer-Only Development

If you only need to debug the frontend (React renderer) without the Electron main process:

```bash
npm run dev:renderer    # Starts Vite only, port 1420
```

## Development Ports

| Port | Purpose | Source |
| --- | --- | --- |
| 1420 | Vite renderer dev server (strictPort, 127.0.0.1 only) | `vite.config.ts` |
| 39527 | Extension↔desktop loopback WebSocket (architecture contract, not a dev config) | `electron/main.mts` |

Port 39527 is the loopback WebSocket port for browser extension↔desktop communication. It is created by the Electron main process at startup — it's not something you configure manually. If troubleshooting "extension can't connect to desktop," check whether this port is occupied. Architecture details: [Electron Runtime Foundation](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-runtime-foundation.md).

## Renderer URL Override

When debugging a packaged app, use `AMEOW_FRONTEND_URL` to override the renderer URL Electron loads:

```bash
AMEOW_FRONTEND_URL=http://localhost:3000 npm run electron:build && electron .
```

Electron resolves the renderer URL in this priority (`electron/windowRouting.mts`):

1. `AMEOW_FRONTEND_URL` (explicit override)
2. `AMEOW_ELECTRON_DEV_SERVER_URL` (dev server injection)
3. `http://127.0.0.1:1420` (default dev server)

## Preflight

Preflight runs automatically before each `npm run dev` and does two things:

1. **Locales sync**: checks timestamps of `locales/` source files vs. extension resources — runs `locales:sync` only if stale.
2. **Python runtime cache**: ensures the bundled Python runtime is downloaded and cached. Skipped if already cached.

Force Python runtime re-verification:

```bash
AMEOW_FORCE_DEV_PREFLIGHT=1 npm run dev
```

This is the only way to force the preflight within the full dev flow. `--force` is detected in `dev-preflight.mjs` via `process.argv`, but `npm run dev -- --force` passes `--force` to `run-electron-dev.mjs` (which does not read it), not to the preflight hook — so it does **not** work through `npm run dev -- --force`. To run the preflight standalone with force:

```bash
node ./scripts/dev-preflight.mjs --force
```

## Browser Presentation Lab (dev:lab)

`npm run dev:lab` starts a standalone development browser page (entry `lab.html`, source in `src/lab/`) via `vite.lab.config.ts`. It is a pure browser environment: no Electron bridge, no downloader runtime — used to preview and debug shared presentation components and assets without launching the desktop app.

This Lab is still under active development; its tooling and scenarios change frequently, so building long-term workflows around it is not recommended. The historical UI Lab (DEV-only route `/ui-lab`) and its scenario-injection mechanism were removed from main (`30e0e5459`).
