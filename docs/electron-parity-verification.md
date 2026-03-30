# Electron Parity Verification

This document records the final parity and release-acceptance gate used to remove the obsolete Tauri runtime surface.

## Decision

- Electron is the only supported desktop runtime.
- The old Tauri source, scripts, dependencies, and release wiring were removed only after the Electron build, packaging, bundled downloader, and acceptance checks were green on this task branch.
- `desktop-assets/` is now the only repo-visible source of truth for desktop icons and bundled runtime binaries.

## Verification Matrix

| Area | Electron source of truth | Evidence | Status |
| --- | --- | --- | --- |
| Main window | `electron/main.mts`, `electron/preload.mts`, `src/App.tsx` | Electron build and packaged app generation passed after cleanup. | Passed |
| Settings window | `electron/main.mts`, `src/pages/SettingsPage.tsx` | Shared preload bridge remains typed; build, lint, and tests passed after removing Tauri fallback code. | Passed |
| Context menu window | `electron/main.mts`, `src/App.tsx` | Secondary-window routing stays Electron-owned and compiles/tests clean after cleanup. | Passed |
| Browser-extension connectivity | `electron/main.mts`, `browser-extension/` | WebSocket endpoint contract remains `127.0.0.1:39527`; browser-extension packaging passed. | Passed |
| Download flows | `src/electron-runtime/`, `electron/main.mts`, `desktop-assets/binaries/` | App build, runtime path tests, and bundled downloader smoke checks passed after moving assets out of `src-tauri/`. | Passed |
| Config persistence | `electron/main.mts` | Electron main still preserves the legacy `com.flowselect.app/settings.json` migration path and compiles/tests clean. | Passed |
| Updater, build, and release behavior | `.github/workflows/release.yml`, `electron-builder.config.mjs`, `scripts/package-portable.ps1` | Windows installer packaging, portable packaging, and release workflow wiring all target Electron artifacts only. | Passed |

## Automated Gate Evidence

Prerequisite release and acceptance checks were green before Tauri removal on this branch:

```bash
npm ci
npm run type-check
npm run lint
npm test
npm run build
node ./scripts/build-gallery-dl-binary.mjs --target x86_64-pc-windows-msvc
node ./scripts/smoke-gallery-dl-binary.mjs --target x86_64-pc-windows-msvc
npm run package:browser-extension
npm run package:win
npm run package:portable:skip-build
```

Post-cleanup regression gate that must stay green:

```bash
npm run locales:sync
npm run type-check
npm run lint
npm test
npm run build
node ./scripts/build-gallery-dl-binary.mjs --target x86_64-pc-windows-msvc
node ./scripts/smoke-gallery-dl-binary.mjs --target x86_64-pc-windows-msvc
npm run package:browser-extension
npm run package:win
npm run package:portable:skip-build
```

## Cleanup Boundary

The following conditions are now true:

- Renderer runtime access is Electron-only through `window.flowselect`.
- Desktop packaging no longer reads from `src-tauri/`.
- Release automation no longer depends on Tauri CLI, Cargo manifests, or Tauri bundle output paths.
- Locale sync no longer emits desktop resources into `src-tauri/resources/locales`.
- Repo assets required by packaging/runtime live under `desktop-assets/`.

With those gates satisfied, deleting `src-tauri/` and removing Tauri packages is a supported cleanup, not an early migration step.
