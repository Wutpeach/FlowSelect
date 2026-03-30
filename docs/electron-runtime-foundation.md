# Electron Runtime Foundation

This document freezes the runtime boundary for FlowSelect after the Electron cutover. It should be treated as the repo-visible contract for the current desktop runtime, preload bridge, and packaging flow.

## Current Ownership Snapshot

- Renderer runtime access now flows through:
  - `src/desktop/runtime.ts`
  - `src/types/electronBridge.ts`
- Native runtime ownership lives in:
  - `electron/main.mts`
  - `electron/preload.mts`
- Repo-visible desktop assets live in:
  - `desktop-assets/binaries/`
  - `desktop-assets/icons/`
- Browser-extension transport currently lives in:
  - `browser-extension/background.js`
- Current release/build packaging lives in:
  - `.github/workflows/release.yml`
  - `electron-builder.config.mjs`
  - `scripts/run-electron-dev.mjs`
  - `scripts/package-portable.ps1`
  - `scripts/package-macos-open-source-dmg.mjs`

## Compatibility Matrix

| Legacy surface | Electron replacement | Contract |
|-----------------|----------------------|----------|
| Legacy renderer invoke boundary | `window.flowselect.commands.invoke` | Keep current command names and payload keys stable across the Electron runtime. |
| Legacy renderer event boundary | `window.flowselect.events.on` / `emit` | Keep current event names and payload shapes stable. |
| `WebviewWindow.getByLabel(...)` | `window.flowselect.windows.has` / `focus` | Keep labels `main`, `settings`, `context-menu`. |
| `new WebviewWindow("settings", ...)` | `window.flowselect.windows.openSettings(...)` | Electron main owns BrowserWindow creation. |
| `new WebviewWindow("context-menu", ...)` | `window.flowselect.windows.openContextMenu(...)` | Electron main owns BrowserWindow creation and parent wiring. |
| `getCurrentWindow()` + `currentMonitor()` | `window.flowselect.currentWindow.*` and `window.flowselect.system.currentMonitor()` | Keep logical-position math in the renderer-facing contract. |
| Legacy desktop dialog open | `window.flowselect.system.openDialog(...)` | Dialog invocation stays main-owned. |
| Legacy clipboard image read | `window.flowselect.clipboard.readImage()` | Return structured pixel data, not Node/Electron handles. |
| Legacy external open | `window.flowselect.system.openExternal(...)` | External opens stay main-owned. |
| Legacy relaunch request | `window.flowselect.system.relaunch()` | Relaunch remains preload-mediated only. |
| Legacy updater check/install surface | `window.flowselect.updater.check()` / `downloadAndInstall()` | Do not leak raw updater objects into renderer. |
| Legacy tray/global-shortcut/autostart/single-instance behavior | Electron main process services | Preserve user-visible behavior unless a later contract change explicitly documents a break. |
| Legacy loopback WS server | Electron main `ws` server | Keep host, port, action names, and `requestId` correlation stable. |

## Preload Bridge

The concrete renderer-facing preload surface lives in `src/types/electronBridge.ts`.

Required namespaces:

- `window.flowselect.commands`
- `window.flowselect.events`
- `window.flowselect.windows`
- `window.flowselect.currentWindow`
- `window.flowselect.system`
- `window.flowselect.clipboard`
- `window.flowselect.updater`

Renderer rule:

- New Electron-migrated renderer files must use the preload bridge.
- New renderer code must not import `electron`, Node built-ins, or deprecated desktop-runtime packages directly.

## Browser Extension Compatibility

- Fixed endpoint: `ws://127.0.0.1:39527`
- Electron must preserve the current request/response envelope:

Request:

```json
{
  "action": "video_selected_v2",
  "data": {
    "requestId": "req-123"
  }
}
```

Response:

```json
{
  "success": true,
  "message": "Download queued",
  "data": {
    "requestId": "req-123"
  }
}
```

Rules:

- If a request includes `data.requestId`, the response must echo `data.requestId`.
- Failure responses participating in request correlation must include `data.code`.
- Preserve these extension-facing actions:
  - inbound: `ping`, `get_theme`, `get_language`, `sync_download_preferences`, `save_image`, `save_data_url`, `protected_image_resolution_result`, `video_selected_v2`
  - outbound: `request_download_preferences`, `theme_info`, `theme_changed`, `language_info`, `language_changed`, `start_picker`, `stop_picker`, `resolve_protected_image`

## Config Compatibility

- Keep the effective config file name as `settings.json` under the app config directory.
- Preserve one-time migration from `<configDir>/com.flowselect.app/settings.json`.
- Keep `get_config` returning a raw JSON string.
- Keep `save_config({ json })` accepting a raw JSON string.

Compatibility-critical keys:

- `outputPath`
- `theme`
- `language`
- `shortcut`
- `renameMediaOnDownload`
- `videoKeepOriginalName` as legacy inverse fallback
- `renameRulePreset`
- `renamePrefix`
- `renameSuffix`
- `defaultVideoDownloadQuality`
- `ytdlpQualityPreference` as legacy fallback
- `aeFriendlyConversionEnabled`
- `aePortalEnabled`
- `aeExePath`
- `devMode`
- `clipDownloadMode` as tolerated legacy key

Autostart remains runtime-owned OS state, not a `settings.json` key.

## Packaging And Updater Direction

- Windows:
  - canonical packaged artifact: Electron Builder `nsis`
  - portable ZIP remains manual-only under `dist-release/portable/`
  - in-app auto-update is supported only for installed Windows builds through the repo-generated `latest.json` manifest
- macOS:
  - canonical packaged artifacts are architecture-specific Electron Builder ZIPs plus the repo's custom unsigned DMGs
  - because the current repo ships unsigned open-source DMGs, Electron in-app auto-update is intentionally out of scope until code signing/notarization exists
  - macOS users stay on the manual release-install path in Phase 1
- Keep GitHub Releases and `release-notes/v<version>.md` as the canonical release flow.
- Keep the browser-extension ZIP as a separate release asset.
- Keep Electron packaging `asar = false` so the packaged app can continue resolving `dist/`, `locales/`, and `desktop-assets/binaries/` through the existing repo-root-relative runtime contract.

Renderer updater contract:

- Windows installer builds may surface an update from `window.flowselect.updater.check()`.
- macOS unsigned builds should return `null` from `window.flowselect.updater.check()` and keep manual release links as the visible update path.

## Download Runtime Core

- The Electron-owned runtime core now lives under `src/electron-runtime/`.
- It is intentionally transport-agnostic: the package exposes queue/runtime services without importing `electron` directly, so preload/main integration can wrap it later.
- `src/electron-runtime/commandRouter.ts` is the current compatibility adapter for stable renderer command names. It owns the runtime-backed mapping for `queue_video_download`, `cancel_download`, and runtime dependency status/bootstrap commands while tolerating both camelCase and snake_case payload keys during the migration.
- Current package responsibilities:
  - bundled-vs-managed runtime path resolution
  - runtime dependency gate state
  - hidden CLI spawning via Node (`windowsHide`)
  - direct-download execution
  - yt-dlp execution and progress parsing
  - gallery-dl execution for Pinterest-first extraction paths
  - queue concurrency and cancel semantics
- Current decision:
  - legacy runtime proxy binaries are no longer part of the supported Electron runtime path
  - runtime spawning, packaging, and release scripts should treat the Electron-owned bridge and `desktop-assets/` as the only desktop source of truth
