---
title: Testing & Validation
description: Ameow's unit test, lint, and type-check commands, and how test files are organized.
---

## Basic Commands

```bash
npm run test          # Run unit tests (vitest run --passWithNoTests)
npm run lint          # ESLint (src/ + vite.config.ts, .ts/.tsx)
npm run type-check    # TypeScript type checking (tsc --noEmit × 2: renderer + electron)
```

`type-check` runs `tsc --noEmit` twice: once for the renderer (`tsconfig.json`) and once for the Electron main process (`tsconfig.electron.json`).

## Test Framework

Tests use [Vitest](https://vitest.dev/). Test files are co-located with source code, named `*.test.ts` / `*.test.mts` / `*.test.js`, across:

- `src/` — renderer and core logic
- `electron/` — Electron main process
- `scripts/` — build/tooling scripts
- `browser-extension/` — browser extension

`vitest run` runs in non-watch mode (suitable for CI). `--passWithNoTests` ensures no error when no test files exist.

## Architecture Guard Test

`browser-extension/architecture-guard.test.js` is a special architecture guard test enforcing:

- WebSocket transport may only be constructed by desktop-client files
- Runtime neutrality constraints
- Port boundary constraints

These are architecture-level constraints, not regular unit tests. Architecture details: [Electron Runtime Foundation](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-runtime-foundation.md).

## Runtime Smoke Validation

Runtime smoke tests validate the bundled Python runtime and downloader capabilities. These are maintainer operations — see the maintainer runbook.
