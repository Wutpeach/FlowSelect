# Electron Runtime Contracts

> Executable contract for replacing FlowSelect's Tauri-native runtime with Electron main + preload while keeping renderer, browser-extension, config, and release boundaries stable.

---

## Source of Truth

- Renderer call sites:
  - `src/App.tsx`
  - `src/pages/SettingsPage.tsx`
  - `src/pages/ContextMenuPage.tsx`
  - `src/contexts/ThemeContext.tsx`
  - `src/main.tsx`
- Native runtime ownership today:
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/native_i18n.rs`
  - `src-tauri/tauri.conf.json`
- Extension transport:
  - `browser-extension/background.js`
- Release packaging today:
  - `.github/workflows/release.yml`
  - `scripts/run-tauri.mjs`
  - `scripts/package-portable.ps1`
  - `scripts/package-macos-open-source-dmg.mjs`

---

## Core Rules

- Electron main owns tray, single-instance behavior, dialogs, shortcuts, autostart, relaunch, updater, loopback WebSocket transport, and config IO.
- Electron preload is the only renderer-facing desktop bridge. Renderer code must not import `electron`, Node built-ins, or `@tauri-apps/*` after migration starts.
- BrowserWindows that expect desktop renderer behavior must keep `preload`, `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: false` aligned with the current preload architecture. If that architecture changes, update this spec in the same task.
- Renderer bootstrap must fail fast when Electron mode is detected but `window.flowselect` is missing. Do not silently fall back to plain-web routing inside a desktop window.
- App events moving from Electron main to renderer must use per-event channels (`flowselect:event:<event>`) instead of one shared multiplexed event channel.
- Preserve current command names, event names, JSON payload keys, window labels, and extension WebSocket actions unless this file changes in the same task.
- Preserve `settings.json` compatibility and the browser-extension loopback endpoint `127.0.0.1:39527`.

---

## Scenario: Electron Foundation Replacement Contract

### 1. Scope / Trigger

- Trigger: Any task that ports FlowSelect runtime ownership from Tauri/Rust into Electron main + preload.
- Why this needs code-spec depth: This migration crosses renderer, native runtime, browser extension, config persistence, and release packaging boundaries. Small drift at any one boundary can silently break the app even if local compilation still passes.

### 2. Signatures

Window labels:

```ts
type FlowSelectWindowLabel = "main" | "settings" | "context-menu" | "ui-lab";
```

Fixed runtime endpoints / paths:

```ts
type FlowSelectWsEndpoint = "ws://127.0.0.1:39527";
type FlowSelectConfigFileName = "settings.json";
```

Preload source-of-truth type:

```ts
type FlowSelectElectronBridge =
  import("../../src/types/electronBridge").FlowSelectElectronBridge;
```

Electron-only IPC channels introduced by the preload bridge:

```ts
type FlowSelectEventChannel = `flowselect:event:${FlowSelectAppEvent}`;
type FlowSelectCurrentWindowPositionChannel = "flowselect:current-window:set-position";
```

Startup-mode contract:

```ts
type FlowSelectStartupWindowMode = "compact" | "full";
```

Required preload surface summary:

```ts
interface FlowSelectElectronBridge {
  commands: {
    invoke<TResult>(
      command: FlowSelectRendererCommand,
      payload?: Record<string, unknown>,
    ): Promise<TResult>;
  };
  events: {
    on<TPayload>(
      event: FlowSelectAppEvent,
      listener: (event: { payload: TPayload }) => void,
    ): Promise<() => void>;
    emit<TPayload>(event: FlowSelectRendererEvent, payload: TPayload): Promise<void>;
  };
  windows: {
    has(label: FlowSelectWindowLabel): Promise<boolean>;
    focus(label: FlowSelectWindowLabel): Promise<void>;
    close(label: "settings" | "context-menu" | "ui-lab"): Promise<void>;
    openSettings(options: FlowSelectSecondaryWindowOptions): Promise<void>;
    openContextMenu(options: FlowSelectContextMenuWindowOptions): Promise<void>;
    openUiLab(options: FlowSelectSecondaryWindowOptions): Promise<void>;
  };
  currentWindow: FlowSelectCurrentWindowApi;
  system: FlowSelectSystemApi;
  clipboard: {
    readImage(): Promise<FlowSelectClipboardImage | null>;
  };
  updater: {
    check(): Promise<AppUpdateInfo | null>;
    downloadAndInstall(): Promise<void>;
  };
}
```

Current-window surface addition:

```ts
interface FlowSelectCurrentWindowApi {
  startupWindowMode(): FlowSelectStartupWindowMode;
}
```

Typed bounds-animation contract:

```ts
interface FlowSelectCurrentWindowApi {
  animateBounds(
    bounds: FlowSelectBounds,
    options?: { durationMs?: number; transitionToken?: number },
  ): Promise<{ transitionToken: number | null }>;
}
```

Current renderer-facing command names that must remain stable through the preload bridge:

```ts
type FlowSelectRendererCommand =
  | "begin_open_output_folder_from_context_menu"
  | "begin_pick_output_folder_from_context_menu"
  | "broadcast_theme"
  | "cancel_download"
  | "cancel_transcode"
  | "check_ytdlp_version"
  | "dev_ui_lab_apply_scenario"
  | "download_image"
  | "export_support_log"
  | "get_autostart"
  | "get_clipboard_files"
  | "get_config"
  | "get_current_shortcut"
  | "get_gallery_dl_info"
  | "get_runtime_dependency_gate_state"
  | "get_runtime_dependency_status"
  | "open_current_output_folder"
  | "open_folder"
  | "process_files"
  | "queue_video_download"
  | "refresh_runtime_dependency_gate_state"
  | "register_shortcut"
  | "remove_transcode"
  | "reset_rename_counter"
  | "save_config"
  | "save_data_url"
  | "set_autostart"
  | "set_window_position"
  | "set_window_size"
  | "start_runtime_dependency_bootstrap"
  | "update_gallery_dl"
  | "update_ytdlp";
```

Current extension request/response envelope:

```json
{
  "action": "video_selected_v2",
  "data": {
    "requestId": "req-123"
  }
}
```

```json
{
  "success": true,
  "message": "Download queued",
  "data": {
    "requestId": "req-123"
  }
}
```

### 3. Contracts

#### Replacement Matrix

| Current Tauri/runtime surface | Current owner | Electron replacement | Contract |
|------------------------------|---------------|----------------------|----------|
| `@tauri-apps/api/core.invoke` | Renderer -> Rust command | `window.flowselect.commands.invoke` | Keep command names + payload keys stable. |
| `@tauri-apps/api/event.listen` / `emit` | Renderer/global event bus | `window.flowselect.events.on` / `emit` | Keep event names + payload shapes stable. |
| `WebviewWindow.getByLabel(...)` | Renderer | `window.flowselect.windows.has` / `focus` | Keep labels `main`, `settings`, `context-menu`. |
| `new WebviewWindow("settings", ...)` | Renderer | `window.flowselect.windows.openSettings(...)` | BrowserWindow creation is main-owned only. |
| `new WebviewWindow("context-menu", ...)` | Renderer | `window.flowselect.windows.openContextMenu(...)` | BrowserWindow creation is main-owned only. |
| `getCurrentWindow()` / `currentMonitor()` / `PhysicalPosition` | Renderer | `window.flowselect.currentWindow.*` + `window.flowselect.system.currentMonitor()` | Keep logical-coordinate contract at renderer boundary. |
| `plugin-dialog.open(...)` | Renderer plugin call | `window.flowselect.system.openDialog(...)` | Dialogs stay main-owned. |
| `plugin-opener.openUrl(...)` | Renderer plugin call | `window.flowselect.system.openExternal(...)` | External opens stay main-owned. |
| `plugin-process.relaunch()` | Renderer plugin call | `window.flowselect.system.relaunch()` | Relaunch stays main-owned. |
| `plugin-updater.check()` / `Update.downloadAndInstall(...)` | Renderer plugin call | `window.flowselect.updater.check()` / `downloadAndInstall()` | Do not leak raw Electron updater handles into renderer. |
| `plugin-clipboard-manager.readImage()` | Renderer plugin call | `window.flowselect.clipboard.readImage()` | Return serializable pixel payload only. |
| Tauri tray/plugin runtime | Rust/Tauri | Electron main (`Tray`, `Menu`, `globalShortcut`, login-item/autostart, single-instance lock, dialog, shell, ws`) | Preserve user-visible behavior unless this spec documents an intentional break. |

#### Window Ownership Contract

- `main` remains the canonical primary window label.
- `settings` and `context-menu` remain the stable user-facing secondary window labels.
- `ui-lab` is a development-only secondary window label:
  - available only when `!app.isPackaged`
  - not exposed through production UI entry points or packaged runtime flows
- `main` keeps the current compact shell behavior:
  - transparent where the platform compositor can render it reliably
  - always-on-top
  - non-resizable
  - close request hides instead of quitting
- On Windows, the first startup reveal for `main` must use full native bounds (`200x200`) instead of a cold-start compact native shell.
- The first transition into compact mode after launch must come from the normal idle compact path, not from an immediate startup-only full-to-compact handoff that runs before the window has settled.
- On packaged Windows builds, compact FlowSelect windows should preserve transparent parity with development builds by default, including `main` and `settings`. An opaque fallback background is reserved only for explicit diagnostics / escape-hatch runs enabled through the global fallback switch.
- `main`, `settings`, `context-menu`, and other compact utility windows should default to `show: false` and reveal only after `ready-to-show` or `did-finish-load`, with a bounded timeout fallback for machines that never emit the ideal paint signal.
- Startup reveal gating may differ by environment:
  - packaged `main` should keep the full reveal handshake, including the renderer-ready wait used to avoid showing a half-booted desktop shell
  - development `main` may reveal on the first stable paint / initial reveal signal and must not hold first show behind the full renderer-ready handshake
- If a window closes before those reveal signals or timeout complete, the wait path must resolve quietly and skip listener cleanup against destroyed `BrowserWindow` or destroyed `webContents` handles.
- On Windows, FlowSelect desktop windows are tray-first utility surfaces:
  - `main` must set `skipTaskbar: true`
  - secondary utility windows should default to `skipTaskbar: true` unless a product requirement explicitly opts one into taskbar visibility
- Single-instance behavior stays:
  - if a second instance launches, Electron must focus/show `main`
- Tray behavior stays:
  - tray left-click shows `main`

#### Download Output Naming Contract

- Runtime-owned video downloads in `src/electron-runtime/service.ts` must reserve one output stem per task before engine execution starts.
- The shared stem builder is `buildOutputStem(...)` in `src/electron-runtime/runtimeUtils.ts`; engines must consume the pre-reserved `context.outputStem` instead of inventing per-engine names.
- Title-first contract:
  - when a request provides a usable title, that cleaned title is the primary video output stem for all providers, including Pinterest
  - provider-specific fallback stems such as `pinterest_<shortId>` are used only when title metadata is absent
- Collision handling contract:
  - if the preferred stem already exists on disk, runtime must allocate the next available suffixed variant before the downloader starts
  - active in-memory tasks must also reserve stems, so concurrent same-title or same-pattern tasks cannot pick the same filename
  - sidecar artifacts such as `.txt`, `.json`, `.part`, and `.ytdl` do not count as occupied final outputs
- Config compatibility:
  - when `renameMediaOnDownload === true` or legacy `videoKeepOriginalName === false`, all resource saves must route through the shared rename-rule allocator instead of provider-specific stems
  - `download_image(...)`, `save_data_url(...)`, and `process_files(...)` in `electron/main.mts` share the same rename-rule entrypoint so screenshots and copied files follow the same global rename toggle
  - tray menu contains `show`, `settings`, `quit`
  - tray labels continue to resolve from native locale resources
  - Windows tray and BrowserWindow icons should resolve from packaged app assets, preferring `desktop-assets/icons/icon.ico` so dev and packaged runs do not fall back to the default Electron icon

#### Foreground Task Window Restore Contract

- When a foreground task or direct-processing feedback flow such as download, transcode, image save, or file copy restores `main` from compact icon mode, renderer state must not switch to full-mode visuals before the native BrowserWindow bounds have returned to the full shell size.
- If `main` is still in compact native bounds (`windowResized === true` or equivalent), restore the native bounds first through `currentWindow.animateBounds(...)` or a shared helper that owns that contract, then clear minimized/full-mode renderer state.
- If multiple async compact/full requests can overlap, renderer must attach a monotonic transition token to `currentWindow.animateBounds(...)` and must ignore any completion whose echoed token is no longer current before committing `setIsMinimized(false)`, `setWindowResized(false)`, or compact-shrink follow-up.
- Download, transcode, and direct-processing feedback paths must share the same restore helper so renderer/native ordering cannot drift between task types.
- If a foreground task forced `main` out of compact mode, completion/cancel settlement should return the shell to compact behavior once the transient success/error indicator finishes and no other foreground-task lock remains.
- Once `main` is already in full native bounds, repeated progress events must not trigger redundant resize work or re-arm focus/idle side effects unnecessarily.

#### Dev-only UI Lab Contract

- Electron main may expose a dev-only `ui-lab` window through `window.flowselect.windows.openUiLab(...)`.
- Electron preload/main may expose the dev-only renderer command:
  - `dev_ui_lab_apply_scenario`
- Packaged builds must reject UI Lab entry points:
  - `flowselect:window:open-ui-lab`
  - `dev_ui_lab_apply_scenario`
- UI Lab must drive the real main window instead of rendering duplicate status widgets:
  - scenario application may emit the existing queue/transcode/runtime app events
  - scenario application may temporarily override `get_runtime_dependency_status`, `get_runtime_dependency_gate_state`, `refresh_runtime_dependency_gate_state`, and `start_runtime_dependency_bootstrap`
- While any UI Lab runtime override is active, emitted `runtime-dependency-gate-state` events must keep reflecting the override payload instead of leaking live bootstrap updates back into the preview.
- Non-runtime UI Lab scenarios (`download-*`, `transcode-*`, `mixed-*`) must apply a ready runtime override before emitting task progress so missing live runtimes do not pollute those previews with an unrelated runtime indicator.
- Before each scenario, Electron main must emit `ui-lab-reset` so the main window clears mock progress, queue, and retry/success indicator state before applying new preview data.
- UI Lab scenario application must not reuse the normal `shortcut-show` renderer event path after `showMainWindow()`:
  - preview activation is its own contract, not a user shortcut replay
  - renderer-side shortcut show logic may arm idle/minimize flows that race with preview state application
- While UI Lab preview mode is active, renderer visual state must be forced to full main-window mode until `ui-lab-reset` restores live state:
  - minimized shell clip-path, minimized icon branch, and shrink-on-animation-complete paths must stay suppressed even if internal minimize state is still settling
  - preview tooling must never show task/status content inside the compact circular shell
- `ui-lab-reset` is a main-to-renderer app event only; renderer must not emit it back over `window.flowselect.events.emit(...)`.

#### Autostart Contract

- Renderer-facing command names stay:
  - `get_autostart`
  - `set_autostart`
- Autostart remains runtime-owned OS state and must not be mirrored into `settings.json`.
- On Windows, Electron main must read and write login-item settings against the current executable path with an explicit empty `args` array so the query path matches the write path.
- On Windows, Electron main must use a stable registry entry name `FlowSelect` when writing startup registration so toggling the feature reuses one predictable startup item across installs and updates.
- On Windows, `executableWillLaunchAtLogin` is the source of truth for whether the current executable will actually launch at login. `openAtLogin` alone is not sufficient because it can stay truthy while Startup Approved state or argument matching drifts.
- When Windows returns matching `launchItems` for the current executable or the stable `FlowSelect` entry name, FlowSelect should surface autostart as enabled only if at least one matching item is still `enabled`.
- On macOS, keep the existing `openAtLogin` read/write behavior; do not widen this contract with Windows-only fields.

#### BrowserWindow + Preload Availability Contract

- `main`, `settings`, and `context-menu` must all load the same Electron preload bridge when they render FlowSelect UI.
- Desktop startup state needed before first React render, including whether the main window intentionally launched in compact icon mode, must come from the Electron-owned bridge contract rather than renderer-side first-frame size heuristics.
- Packaged startup work that still belongs on the critical path before first reveal should reuse one parsed startup-config snapshot for all native consumers that need the same config fields during that boot, including:
  - BrowserWindow theme selection
  - tray label/bootstrap language
  - shortcut registration
- Development startup should keep first reveal focused on showing `main`; non-critical native bootstrap tasks such as config-dir creation, tray refresh, and shortcut registration may run immediately after reveal as deferred best-effort work instead of blocking first paint.
- Renderer-side non-critical startup work such as runtime status/gate refresh, automatic managed-runtime bootstrap, and update checks must wait until the initial full-window reveal has settled or a bounded fallback delay has elapsed.
- If a user initiates a foreground action before deferred startup work runs, the renderer may fetch the required runtime state on demand for that action instead of waiting for the deferred startup queue.
- Under the current architecture, each BrowserWindow must set:
  - `preload: <electron preload path>`
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: false`
- Route construction must preserve hash routing for Electron renderer windows in both dev and packaged mode so secondary routes resolve consistently.
- Packaged Electron renderer builds that load via `file:///.../dist/index.html#...` must emit relative asset URLs (`./assets/...`) in `dist/index.html`.
- Do not ship root-relative `/assets/...` URLs in packaged renderer HTML; that causes BrowserWindows to show only the native host background while JS/CSS fail to load from the app bundle.
- Renderer bootstrap must treat Electron detection (`file:` URL or Electron user agent) as a hard contract:
  - if `window.flowselect` exists, continue with desktop bootstrap
  - if `window.flowselect` is missing, render an explicit bridge-failure state and stop booting the normal app shell

#### Renderer Event Delivery Contract

- Electron main must emit app events on `flowselect:event:<eventName>`.
- Electron preload `events.on(event, listener)` must subscribe only to the event-specific channel for that event name.
- The renderer-facing callback payload stays `{ payload }`; do not add a second `event` discriminator field that forces renderer-side filtering.
- Every `events.on(...)` implementation must return an unsubscribe cleanup that removes the exact same listener from the exact same channel.
- Do not route unrelated events through one shared `"flowselect:event"` channel. That pattern scales listener count badly and can trigger `MaxListenersExceededWarning` during normal UI usage.

#### Frameless Window Movement Contract

- Renderer drag activation may wait for a movement threshold, but once dragging starts it must derive movement from screen-space pointer deltas plus the window's initial outer position.
- Read `currentWindow.outerPosition()` once when drag becomes active; do not re-query window coordinates on every move.
- High-frequency movement updates must go through `currentWindow.setPosition({ x, y })`, implemented as fire-and-forget IPC (`ipcRenderer.send(...)` / `ipcMain.on(...)`).
- Short icon-mode window morphs (`80x80 <-> 200x200`) must use `currentWindow.animateBounds({ x, y, width, height }, { durationMs })` against the existing main BrowserWindow.
- Do not reintroduce a dedicated `window-transition-overlay` BrowserWindow for icon-mode expand; Windows DWM cross-window handoff is not the supported contract for FlowSelect.
- Renderer may batch window-position writes with `requestAnimationFrame`, but it must not await request/response IPC inside `pointermove`.
- `currentWindow.startDragging()` is not the hot-path mechanism for FlowSelect's custom frameless drag contract on Electron.
- `pointerup`, `pointercancel`, blur-adjacent cleanup, and other drag-end paths must always clear pending drag state so the window cannot get stuck mid-drag.
- Frameless secondary windows that do not use the main window's manual drag system (for example `ui-lab`) must expose an explicit Chromium drag region on their shell/header and mark interactive controls such as close buttons as `no-drag`.

#### Managed Runtime Bootstrap Network Contract

- Small metadata lookups in the managed runtime bootstrap path, such as the Pinterest runtime manifest request, must fail explicitly after a bounded timeout instead of waiting forever on network stalls.
- Managed runtime asset downloads must use a stall timeout that resets on successful byte progress; if no progress arrives within the timeout window, bootstrap must transition the gate to `failed` with a concrete error message.
- Runtime bootstrap timeout handling must preserve the existing gate contract:
  - active work reports `checking` or `downloading`
  - timeout/fetch failure reports `failed`
  - successful completion still refreshes the live runtime snapshot and gate state

#### Browser Extension WebSocket Contract

- Fixed bind target:
  - host: `127.0.0.1`
  - port: `39527`
- Request envelope:
  - top-level `action: string`
  - optional `data: object`
- Response envelope:
  - `success: boolean`
  - `message?: string | null`
  - `data?: object | null`
- Correlation contract:
  - if the request includes `data.requestId`, the response must echo `data.requestId`
  - failure responses participating in request correlation must include `data.code`
- Inbound actions to preserve:
  - `ping`
  - `get_theme`
  - `get_language`
  - `sync_download_preferences`
  - `save_image`
  - `save_data_url`
  - `protected_image_resolution_result`
  - `video_selected_v2`
- Outbound actions to preserve:
  - `request_download_preferences`
  - `theme_info`
  - `theme_changed`
  - `language_info`
  - `language_changed`
  - `start_picker`
  - `stop_picker`
  - `resolve_protected_image`
- `video_selected_v2` payload fields to preserve:
  - `url`
  - `pageUrl`
  - `title`
  - `videoUrl`
  - `videoCandidates`
  - `selectionScope`
  - `clipStartSec`
  - `clipEndSec`
  - `ytdlpQualityPreference`
  - `cookies`
  - `requestId`

#### Config Compatibility Contract

- Config file path:
  - keep effective file name `settings.json` under the app config directory
  - preserve one-time migration from legacy path `<configDir>/com.flowselect.app/settings.json`
- String transport contract:
  - `get_config` returns raw JSON string
  - `save_config` accepts raw JSON string payload
- Compatibility-critical keys:

| Key | Status | Contract |
|-----|--------|----------|
| `outputPath` | Canonical | Preserve exact key and current fallback to `<Desktop>/FlowSelect_Received` when absent. |
| `theme` | Canonical | Preserve `black` / `white`. |
| `language` | Canonical | Preserve `en` / `zh-CN`; normalize language variants on read. |
| `shortcut` | Canonical | Preserve current accelerator string semantics. |
| `renameMediaOnDownload` | Canonical | Keep as primary rename-toggle key. |
| `videoKeepOriginalName` | Legacy inverse key | Continue reading/writing until a dedicated cleanup migration removes it. |
| `renameRulePreset` | Canonical | Preserve `desc_number`, `asc_number`, `prefix_number`. |
| `renamePrefix` | Canonical | Preserve string semantics. |
| `renameSuffix` | Canonical | Preserve string semantics. |
| `defaultVideoDownloadQuality` | Canonical | Preserve as current desktop/extension quality preference key. |
| `ytdlpQualityPreference` | Legacy fallback | Continue tolerating as legacy fallback during migration. |
| `aeFriendlyConversionEnabled` | Canonical | Preserve current bool semantics. |
| `aePortalEnabled` | Canonical | Preserve current bool semantics. |
| `aeExePath` | Canonical | Preserve current string semantics. |
| `devMode` | Canonical | Preserve current bool semantics for devtools gating. |
| `clipDownloadMode` | Legacy tolerated key | Continue tolerating existing values; do not make it a new source of truth. |

- Non-config state that must stay runtime-owned:
  - autostart
  - updater/install state
  - tray/menu state
  - WebSocket server running state

#### Packaging / Updater Direction Contract

- Windows:
  - canonical packaged artifact: Electron Builder `nsis`
  - portable ZIP remains manual-distribution only
  - in-app auto-update is supported only for installed NSIS builds
  - packaged runtime files must include the Windows icon asset used at runtime (`desktop-assets/icons/icon.ico`) if Electron main loads that asset after launch
- macOS:
  - canonical packaged artifacts remain arch-specific DMGs
  - because the current repo ships unsigned open-source DMGs, Electron in-app auto-update is intentionally out of scope until code signing/notarization exists
  - macOS users stay on manual release install flow in Phase 1
- Release workflow continuity:
  - GitHub Releases stays the canonical distribution channel
  - `release-notes/v<version>.md` stays mandatory
  - browser-extension ZIP stays a separate release asset
- Renderer-facing updater contract:
  - on Windows installer builds, preload updater API may surface an available update
  - on macOS unsigned builds, preload updater API should resolve `null` instead of presenting a broken update path

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Renderer imports `electron` or `@tauri-apps/*` directly after migration starts | Code review / type review | Desktop runtime stays preload-mediated | Route through `window.flowselect` only |
| Command name or payload key changes during transport migration | Renderer command call path | Existing TS call sites keep working | Preserve names/keys or update this spec and call sites together |
| Window labels drift from `main` / `settings` / `context-menu` | Window lookup/focus path | Existing focus/close logic still works | Keep labels stable |
| `ui-lab` is reachable in packaged builds | Dev-only preview boundary | Production builds stay free of internal preview tooling | Gate window open + scenario commands behind `!app.isPackaged` and hide renderer route/UI entry points outside dev |
| Main close quits the app instead of hiding | Tray lifecycle | Current compact-tray behavior regresses | Keep hide-on-close for `main` |
| Windows utility windows surface taskbar entries by default | Windows desktop shell behavior | FlowSelect stays tray-first and does not pin floating utility windows into the taskbar | Set `skipTaskbar: true` for `main` and default secondary windows on Windows unless explicitly overridden |
| Packaged Windows transparent frameless windows become invisible even though tray/process state is healthy | Main/settings packaged startup on affected machines | FlowSelect should keep transparent parity by default and use the opaque path only when the explicit diagnostic escape hatch is enabled | Keep the default transparent-shell path intact and gate the opaque fallback behind the global override |
| Electron resolves tray/window icons to missing or generic assets on Windows | Tray icon + window chrome review | FlowSelect uses the project icon instead of the Electron default icon in dev and packaged runs | Prefer `desktop-assets/icons/icon.ico` at runtime and package that asset with the app |
| BrowserWindow boots FlowSelect UI without the matching preload/sandbox contract | Main/settings/context-menu startup | Desktop actions fail immediately instead of degrading into inert web UI | Keep BrowserWindow webPreferences aligned with the preload bridge contract |
| Reveal-wait cleanup runs after a window has already closed | Main/settings/context-menu startup teardown | The main process does not throw `TypeError: Object has been destroyed` while cleaning up reveal listeners | Stop waiting on `closed` and skip listener cleanup on destroyed `BrowserWindow` / `webContents` objects |
| Development startup waits for the full renderer-ready handshake before first show | Electron dev startup reveal path | Dev cold start reaches a visible main window on the first stable paint instead of waiting on extra renderer-ready work | Let dev `main` reveal after the initial paint/reveal signal and keep the stricter renderer-ready wait for packaged startup |
| Packaged startup re-reads config independently for window theme, tray labels, and shortcut registration | Packaged Electron first-reveal path | First visible window is not delayed by repeated config IO/parsing on the critical path | Read one startup-config snapshot and fan it out to native startup consumers |
| Packaged `dist/index.html` still references `/assets/...` while BrowserWindow loads `file:///.../dist/index.html` | Packaged `main` / `settings` renderer startup | React UI loads bundled JS/CSS from the app directory instead of showing only the host window background | Set a `file://`-safe Vite build base such as `./` and verify emitted HTML |
| Renderer continues normal bootstrap when Electron is detected but `window.flowselect` is missing | Renderer startup | Bridge failures are visible and diagnosable | Fail fast with explicit bridge error UI |
| App events are multiplexed through one shared IPC channel | Renderer event subscriptions | No listener leak warning during ordinary usage | Use `flowselect:event:<event>` channels |
| UI Lab invents duplicate renderer-only mock components | Preview-tooling review | Preview remains representative of the real main-window UI | Drive the existing main window with real app events / runtime-command overrides |
| Non-runtime UI Lab preview leaks the live runtime indicator into download/transcode scenes | Preview-tooling review | Each preview shows only the state it is meant to demonstrate | Apply a ready runtime override for non-runtime scenarios and emit the override on every gate event while preview mode is active |
| UI Lab scenario replay reuses `shortcut-show` or renderer preview mode does not suppress minimized visuals | Preview-tooling review | Preview opens once and stays in full main-window mode without circular-shell clipping, disappearance, or first-click flicker | Keep preview activation on the dedicated `ui-lab-reset` path and force renderer visual state to full mode while preview is active |
| Renderer clears minimized/full-mode task or processing state before compact native bounds are restored during download/transcode/direct-processing | Main window enters a foreground feedback mode from compact icon mode | Foreground UI never appears cropped inside the compact native window | Restore BrowserWindow bounds first, then flip renderer state through one shared foreground-task helper |
| A stale compact/full bounds completion resolves after a newer request | Main window compact/full transition | Late async work cannot reapply stale `80x80` / `200x200` bounds or renderer state | Carry and validate a transition token across the `currentWindow.animateBounds(...)` request/response contract |
| Windows autostart reads only `openAtLogin` | Settings autostart status | UI can show enabled even when the current executable will not actually launch at login | Query the current executable path and treat `executableWillLaunchAtLogin` plus matching `launchItems.enabled` as the effective status |
| Windows autostart write path omits a stable registry name or Startup Approved state | Settings autostart toggle | Re-enabling can create drifted entries or fail to reactivate the existing startup item cleanly | Write explicit `name`, `path`, `args`, and `enabled` fields together |
| Frameless drag awaits `invoke(...)` or `set_window_position` on every pointer move | Main window drag path | Drag remains smooth and continuous | Use `currentWindow.setPosition(...)` fire-and-forget IPC, optionally RAF-batched |
| Frameless `ui-lab` window has no declared drag region | Secondary window UX | The dev-only child window can still be repositioned like the other floating surfaces | Put a drag region on the header/shell and mark action buttons as `no-drag` |
| Managed runtime manifest lookup or asset download stalls indefinitely | Runtime bootstrap path | The gate does not stay in `checking`/`downloading` forever | Add bounded manifest timeout plus progress-based download stall timeout and convert timeout to `failed` |
| WebSocket host/port changes from `127.0.0.1:39527` | Browser extension connect path | Extension reconnect logic keeps working | Keep fixed loopback endpoint |
| Request correlation omits echoed `requestId` | Extension pending-request map | Background promise resolution breaks | Echo `data.requestId` on correlated responses |
| Failure response omits `data.code` for request/response actions | Extension error handling | Background cannot classify failure reliably | Include stable `data.code` values |
| `get_config` stops returning raw JSON string | Renderer bootstrap | Theme/language/config bootstrap breaks | Keep string contract |
| Legacy rename or quality keys stop being read | Existing user config | Old installs silently change behavior | Continue reading legacy keys during migration |
| Pinterest video naming reuses repeated UI titles such as `Pin 图卡片` | Electron runtime output path selection | Distinct Pinterest downloads settle to unique final files instead of failing after the first same-title save | Derive `pinterest_<shortId>` from the Pinterest URL and reserve stems before engine execution |
| Two active downloads choose the same output stem before either file exists on disk | Electron runtime queue concurrency | Concurrent tasks do not race into one filename or produce false `output file missing` failures | Serialize stem reservation and include active reserved stems in availability checks |
| Only `.part` / `.txt` / `.json` / `.ytdl` artifacts exist for a stem | Output path allocation | Retry or cleanup metadata does not force unnecessary suffix bumps | Ignore sidecar-only artifacts when selecting the preferred final stem |
| macOS updater enabled without signed/notarized distribution | Packaged runtime | Broken or misleading in-app updates | Return `null` for unsigned macOS updater check |
| Portable Windows build advertises in-app update install | Packaged runtime | Update flow can corrupt portable expectations | Keep portable builds manual-only |
| Preload exposes raw Electron objects/functions to renderer | Security review | Renderer gets overly privileged runtime access | Expose only serializable contract surface |

### 5. Good / Base / Bad Cases

- Good:
  - Renderer code replaces `invoke(...)` / `listen(...)` imports with `window.flowselect` calls while command names and payload types remain unchanged.
  - Electron renderer startup surfaces an explicit bridge-failure screen if preload is missing instead of mounting an inert app shell.
  - On Windows startup, `main` reveals at full native bounds first, then only enters compact mode through the same idle path used later in the session.
  - Electron dev startup reaches a visible `main` window on first stable paint without waiting for the full packaged-only renderer-ready handshake.
  - Non-critical startup status widgets do not mount until the initial full-window reveal has settled, but a user-triggered foreground action can still force the needed runtime refresh on demand.
  - Packaged startup reads config once for first-window theme, tray labels, and shortcut registration instead of serializing multiple config parses before the first reveal.
  - On Windows, the app exposes only the tray icon during normal idle/show-hide usage while `main`, `settings`, and other utility windows stay off the taskbar.
  - On Windows, the tray icon and any BrowserWindow icon surfaces use the FlowSelect app icon instead of the Electron default icon.
  - Download/transcode progress and direct-processing feedback restore `main` through one shared helper, so the full-size shell never renders inside compact native bounds.
  - Frameless main-window dragging stays smooth because pointer moves use `currentWindow.setPosition(...)` over fire-and-forget IPC instead of request/response invoke loops.
  - In development, Settings opens `ui-lab`, the lab applies `dev_ui_lab_apply_scenario`, and the real main window reflects the mocked runtime/download/transcode states.
  - Repeatedly switching UI Lab scenarios keeps the real main window in full-mode visuals, with no circular minimized shell wrapped around preview content.
  - Main/settings/context-menu can all subscribe to app events without `MaxListenersExceededWarning`.
  - Browser extension still connects to `ws://127.0.0.1:39527`, `get_language` succeeds, and `video_selected_v2` responses echo `requestId`.
  - Windows installer builds support in-app updates while portable ZIP remains manual-only.
  - macOS DMG builds stay manual-install artifacts with updater disabled cleanly.
  - Existing `settings.json` with legacy rename or quality keys still behaves the same after migration.
  - Pinterest downloads with a real title use that title first, while title-less Pinterest requests still fall back to stable names such as `pinterest_7f3a2c.mp4`.
- Base:
  - Electron main uses different implementation details internally, but renderer, config, and extension contracts stay stable.
  - Child-window creation moves out of renderer and into Electron main without changing labels or visible behavior.
  - Startup may still compact after the normal idle delay, but it does not perform a startup-only immediate shrink as part of first reveal.
  - Packaged startup may still perform native tray/shortcut setup work around first reveal, but shared config-derived startup decisions come from one snapshot instead of repeated config reads.
  - Dev-only tooling may add one extra secondary label as long as packaged builds reject it cleanly.
  - Foreground events may arrive before the first visible progress payload or before a direct-processing spinner/check state, but the window-restore ordering stays centralized.
  - Title-bearing video downloads continue using title-first stems, while title-less Pinterest requests may still use the provider-specific short-id fallback.
- Bad:
  - Windows startup reveals `main` in an `80x80` native compact shell before the user has had any full-window settle time.
  - Startup reveals the full window and then immediately forces a startup-only compact transition before the regular idle timer has a chance to govern compacting.
  - Dev startup keeps the first show blocked on a long renderer-ready handshake even though a stable first paint was already available.
  - Deferred startup checks stay delayed even after a user-triggered action needs runtime status immediately, so the first foreground action fails on missing cached state.
  - Packaged startup re-parses the same config separately for theme, tray, and shortcut setup, stretching the first visible frame for no user-visible gain.
  - `main` or `settings` shows a Windows taskbar entry even though the product is meant to behave like a tray utility.
  - Electron main loads a runtime icon path that is not shipped in packaged builds, causing Windows to show the default Electron icon.
  - A BrowserWindow enables the default sandbox while still assuming the current preload bridge will expose `window.flowselect`.
  - Renderer silently falls back to plain browser behavior when the Electron bridge is missing.
  - All app events share one `"flowselect:event"` channel and rely on renderer-side event-name filtering.
  - UI Lab is shipped as a production-facing route or button.
  - UI Lab preview shows status/task content while the shell is still clipped to the compact circular icon shape.
  - Download, transcode, or direct-processing feedback sets renderer full-mode state first and only resizes the native window afterward, so the panel is visibly cropped.
  - Pointer-move drag updates await `invoke(...)` round-trips.
  - Renderer starts importing `ipcRenderer` directly.
  - A random/dynamic port replaces `39527`.
  - `get_config` starts returning parsed JSON objects instead of strings.
  - `videoKeepOriginalName` stops being honored before a dedicated config migration exists.
  - Pinterest downloads still default to repeated titles like `Pin 图卡片`, so the second save can fail unless the user manually deletes the first file.
  - Output stem allocation depends only on files already present on disk and ignores other active queued/running tasks.
  - macOS unsigned builds show a working-looking auto-update button that cannot install.

### 6. Tests Required (with assertion points)

- Type checks:
  - `npm run type-check` passes with `src/types/electronBridge.ts` as the preload source of truth.
  - No post-migration renderer file introduces fresh `@tauri-apps/*` imports.
- Runtime behavior:
  - Start Electron dev for `main`, `settings`, `context-menu`, and `ui-lab` and assert `window.flowselect` exists before the normal UI boot path continues.
  - On Windows first launch, assert `main` reveals at `200x200` native bounds and does not immediately shrink to compact before the normal idle timeout expires.
  - In Electron dev, cold-start the app and assert `main` becomes visible on the first stable paint without waiting for tray/shortcut bootstrap completion.
  - Leave the startup-full window before the first idle compact and assert the app re-arms idle compact instead of collapsing immediately on that first pointer leave.
  - After the first idle compact has happened, hover-expand and pointer-leave `main` again and assert the normal immediate compact interaction still works.
  - Confirm runtime status/gate refresh and app update checks do not mount visible startup status indicators until the initial full-window reveal settle delay has elapsed.
  - Trigger a Pinterest download before the deferred startup runtime refresh has naturally run and assert the renderer fetches runtime state on demand instead of failing only because cached status is still `null`.
  - Repeatedly open/close compact windows during startup or reveal wait and assert the main process does not throw `TypeError: Object has been destroyed`.
  - Temporarily break preload availability and assert the renderer shows an explicit bridge-failure state instead of a half-working UI shell.
  - Inspect packaged `dist/index.html` and assert script/stylesheet URLs are relative (`./assets/...`) before using that build for `file://` BrowserWindow validation.
  - On packaged startup, log or inspect the boot path and assert theme/tray/shortcut setup all consume one startup-config snapshot instead of independently re-reading config before `main` is shown.
  - Close `main` and assert the app hides instead of quitting.
  - On packaged Windows, launch the app normally and assert `main` and `settings` keep the transparent-shell path; then enable the diagnostic opaque override and assert the escape hatch still forces the opaque path when explicitly requested.
  - On Windows, show/hide `main` from the tray and assert the app does not create a taskbar button for `main`.
  - On Windows, open `settings` from the tray and assert it stays off the taskbar unless a future window explicitly opts into taskbar visibility.
  - Launch a second instance and assert the existing `main` window is focused/shown.
  - Open `settings` and `context-menu` and assert label-based focus/close behavior still works.
  - On Windows, assert the tray icon and BrowserWindow icon surfaces use the FlowSelect app icon instead of the default Electron icon in both dev and packaged runs.
  - In development, open `ui-lab`, apply each preset, and assert the main window updates through the real runtime/download/transcode UI.
  - In development, click multiple UI Lab scenario buttons back-to-back and assert the first click reveals the main preview without needing retries or producing a circular minimized shell.
  - Open `ui-lab` and assert the header can drag the frameless child window while the close button remains clickable.
  - Start from compact icon mode, trigger download progress, and assert `main` returns to full native bounds before the full task panel becomes visible.
  - Start from compact icon mode, trigger transcode progress, and assert the same no-crop restore contract holds.
  - Start from compact icon mode, trigger a direct image/file processing path, and assert the processing feedback UI does not render inside compact native bounds.
  - Keep `main` already expanded and emit repeated download/transcode progress updates; assert no redundant full-size resize loop or focus steal occurs.
  - With live managed runtimes missing, apply a non-runtime UI Lab preset and assert no runtime indicator leaks into the preview; then apply a runtime preset and assert the runtime indicator still appears with the mocked gate payload.
  - Reset from `ui-lab` and assert the main window clears preview state and refreshes live runtime context.
  - In a packaged build, assert UI Lab entry points are not exposed and direct IPC attempts are rejected.
  - Drag the frameless main window continuously and assert movement remains smooth without getting stuck mid-drag.
  - Simulate a stalled runtime manifest request or stalled runtime asset download and assert the gate transitions to `failed` within the timeout window instead of remaining active indefinitely.
  - Repeatedly open UI surfaces that subscribe to app events and assert the Electron process does not emit `MaxListenersExceededWarning`.
  - Queue two concurrent Pinterest downloads with different pin URLs but the same title and assert `context.outputStem` resolves to distinct `pinterest_<shortId>` values.
  - Pre-create `pinterest_<shortId>.mp4` in the output directory, queue the same Pinterest download again, and assert the next run resolves a suffixed final name instead of failing before settlement.
  - Leave only `pinterest_<shortId>.txt` / `.part` sidecar artifacts in the output directory and assert the next Pinterest run still chooses the unsuffixed `pinterest_<shortId>` final stem.
- Extension compatibility:
  - Start the desktop runtime and assert the extension connects to `ws://127.0.0.1:39527`.
  - Send `get_language` and assert a `language_info` response.
  - Send `video_selected_v2` with `requestId` and assert the response echoes `requestId`.
- Config compatibility:
  - Start from a config file containing `videoKeepOriginalName`, `ytdlpQualityPreference`, and `clipDownloadMode` and assert behavior still matches current semantics.
  - Start from the legacy config path and assert one-time migration to the current app config directory still occurs.
- Packaging / updater:
  - Windows NSIS build surfaces updater availability only for installed builds.
  - Windows portable build does not advertise in-app updater install.
  - macOS unsigned build resolves no available in-app updater path and still exposes manual release links.

### 7. Wrong vs Correct

#### Wrong

```ts
import { ipcRenderer } from "electron";
import { invoke } from "@tauri-apps/api/core";

const config = await ipcRenderer.invoke("get-config-json");
const win = new BrowserWindow();
```

```ts
const ws = new WebSocket(`ws://127.0.0.1:${Math.floor(Math.random() * 10000)}`);
```

#### Correct

```ts
const configStr = await window.flowselect!.commands.invoke<string>("get_config");
const hasSettings = await window.flowselect!.windows.has("settings");

if (!hasSettings) {
  await window.flowselect!.windows.openSettings({
    title: "Settings",
    width: 360,
    height: 420,
    center: true,
    alwaysOnTop: true,
  });
}
```

```ts
const ws = new WebSocket("ws://127.0.0.1:39527");
```

```ts
setIsMinimized(false);
await currentWindow.animateBounds({ x, y, width: 200, height: 200 });
```

Why wrong:
- Renderer can render full-size task content while the native window is still compact-sized.
- Separate task paths can drift if each listener owns its own restore sequence.

```ts
await prepareMainWindowForForegroundTask();
setDownloadProgressByTrace((current) => ({
  ...current,
  [payload.traceId]: payload,
}));
```
