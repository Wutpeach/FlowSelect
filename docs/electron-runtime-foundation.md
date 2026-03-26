# Electron Runtime Foundation

This document freezes the runtime boundary for FlowSelect's Tauri-to-Electron migration. It is the tracked counterpart to the local Trellis task artifacts and should be treated as the repo-visible contract for later implementation tasks.

## Current Ownership Snapshot

- Renderer files currently depend on Tauri APIs/plugins from:
  - `src/App.tsx`
  - `src/pages/SettingsPage.tsx`
  - `src/pages/ContextMenuPage.tsx`
  - `src/contexts/ThemeContext.tsx`
  - `src/main.tsx`
- Native runtime ownership currently lives in:
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/native_i18n.rs`
  - `src-tauri/tauri.conf.json`
- Browser-extension transport currently lives in:
  - `browser-extension/background.js`
- Current release/build packaging lives in:
  - `.github/workflows/release.yml`
  - `scripts/run-tauri.mjs`
  - `scripts/package-portable.ps1`
  - `scripts/package-macos-open-source-dmg.mjs`

## Replacement Matrix

| Current surface | Electron replacement | Contract |
|-----------------|----------------------|----------|
| `@tauri-apps/api/core.invoke` | `window.flowselect.commands.invoke` | Keep current command names and payload keys stable during migration. |
| `@tauri-apps/api/event.listen` / `emit` | `window.flowselect.events.on` / `emit` | Keep current event names and payload shapes stable. |
| `WebviewWindow.getByLabel(...)` | `window.flowselect.windows.has` / `focus` | Keep labels `main`, `settings`, `context-menu`. |
| `new WebviewWindow("settings", ...)` | `window.flowselect.windows.openSettings(...)` | Electron main owns BrowserWindow creation. |
| `new WebviewWindow("context-menu", ...)` | `window.flowselect.windows.openContextMenu(...)` | Electron main owns BrowserWindow creation and parent wiring. |
| `getCurrentWindow()` + `currentMonitor()` | `window.flowselect.currentWindow.*` and `window.flowselect.system.currentMonitor()` | Keep logical-position math in the renderer-facing contract. |
| `plugin-dialog.open(...)` | `window.flowselect.system.openDialog(...)` | Dialog invocation stays main-owned. |
| `plugin-clipboard-manager.readImage()` | `window.flowselect.clipboard.readImage()` | Return structured pixel data, not Node/Electron handles. |
| `plugin-opener.openUrl(...)` | `window.flowselect.system.openExternal(...)` | External opens stay main-owned. |
| `plugin-process.relaunch()` | `window.flowselect.system.relaunch()` | Relaunch remains preload-mediated only. |
| `plugin-updater.check()` / `Update.downloadAndInstall(...)` | `window.flowselect.updater.check()` / `downloadAndInstall()` | Do not leak raw updater objects into renderer. |
| Tauri tray/global-shortcut/autostart/single-instance plugins | Electron main process services | Preserve user-visible behavior unless a later contract change explicitly documents a break. |
| Rust loopback WS server | Electron main `ws` server | Keep host, port, action names, and `requestId` correlation stable. |

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
- New renderer code must not import `electron`, Node built-ins, or `@tauri-apps/*`.

## Browser Extension Compatibility

- Fixed endpoint: `ws://127.0.0.1:39527`
- Electron must preserve the current request/response envelope:

Request:

```json
{
  "action": "video_selected",
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
  - inbound: `ping`, `get_theme`, `get_language`, `sync_download_preferences`, `save_image`, `save_data_url`, `protected_image_resolution_result`, `video_selected`
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
  - portable ZIP remains manual-only
  - in-app auto-update is supported only for installed NSIS builds
- macOS:
  - canonical packaged artifacts remain architecture-specific DMGs
  - because the current repo ships unsigned open-source DMGs, Electron in-app auto-update is intentionally out of scope until code signing/notarization exists
  - macOS users stay on the manual release-install path in Phase 1
- Keep GitHub Releases and `release-notes/v<version>.md` as the canonical release flow.
- Keep the browser-extension ZIP as a separate release asset.

Renderer updater contract:

- Windows installer builds may surface an update from `window.flowselect.updater.check()`.
- macOS unsigned builds should return `null` from `window.flowselect.updater.check()` and keep manual release links as the visible update path.
