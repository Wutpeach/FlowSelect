## Scenario: Electron Proxy Resolution Contract

_Part 4 of 4._

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Renderer imports `electron` or `@tauri-apps/*` directly after migration starts | Code review / type review | Desktop runtime stays preload-mediated | Route through `window.ameow` only |
| Command name or payload key changes during transport migration | Renderer command call path | Existing TS call sites keep working | Preserve names/keys or update this spec and call sites together |
| Window labels drift from `main` / `settings` / `context-menu` | Window lookup/focus path | Existing focus/close logic still works | Keep labels stable |
| Dev-only UI Lab (`ui-lab` window / `openUiLab` / `dev_ui_lab_apply_scenario` / `ui-lab-reset`) reappears | Dev-only preview boundary | The Electron UI Lab is retired; dev preview/export lives in the Browser Lab (plain Vite, no Electron, no desktop bridge) | Keep the bridge surface free of any UI Lab label/command; Browser Lab scenarios use production state/payload types plus applicable selectors/helpers/projections and render through the production surface |
| Main close quits the app instead of hiding | Tray lifecycle | Current compact-tray behavior regresses | Keep hide-on-close for `main` |
| Windows utility windows surface taskbar entries by default | Windows desktop shell behavior | Ameow stays tray-first and does not pin floating utility windows into the taskbar | Set `skipTaskbar: true` for `main` and default secondary windows on Windows unless explicitly overridden |
| Packaged Windows transparent frameless windows become invisible even though tray/process state is healthy | Main/settings packaged startup on affected machines | Ameow should keep transparent parity by default and use the opaque path only when the explicit diagnostic escape hatch is enabled | Keep the default transparent-shell path intact and gate the opaque fallback behind the global override |
| Electron resolves tray/window icons to missing or generic assets on Windows | Tray icon + window chrome review | Ameow uses the project icon instead of the Electron default icon in dev and packaged runs | Prefer `desktop-assets/icons/icon.ico` at runtime and package that asset with the app |
| BrowserWindow boots Ameow UI without the matching preload/sandbox contract | Main/settings/context-menu startup | Desktop actions fail immediately instead of degrading into inert web UI | Keep BrowserWindow webPreferences aligned with the preload bridge contract |
| Reveal-wait cleanup runs after a window has already closed | Main/settings/context-menu startup teardown | The main process does not throw `TypeError: Object has been destroyed` while cleaning up reveal listeners | Stop waiting on `closed` and skip listener cleanup on destroyed `BrowserWindow` / `webContents` objects |
| Development startup waits for the full renderer-ready handshake before first show | Electron dev startup reveal path | Dev cold start reaches a visible main window on the first stable paint instead of waiting on extra renderer-ready work | Let dev `main` reveal after the initial paint/reveal signal and keep the stricter renderer-ready wait for packaged startup |
| Packaged startup re-reads config independently for window theme, tray labels, and shortcut registration | Packaged Electron first-reveal path | First visible window is not delayed by repeated config IO/parsing on the critical path | Read one startup-config snapshot and fan it out to native startup consumers |
| Packaged `dist/index.html` still references `/assets/...` while BrowserWindow loads `file:///.../dist/index.html` | Packaged `main` / `settings` renderer startup | React UI loads bundled JS/CSS from the app directory instead of showing only the host window background | Set a `file://`-safe Vite build base such as `./` and verify emitted HTML |
| Renderer continues normal bootstrap when Electron is detected but `window.ameow` is missing | Renderer startup | Bridge failures are visible and diagnosable | Fail fast with explicit bridge error UI |
| App events are multiplexed through one shared IPC channel | Renderer event subscriptions | No listener leak warning during ordinary usage | Use `ameow:event:<event>` channels |
| Dev-only preview re-introduces duplicate renderer-only mock components | Preview-tooling review | Preview remains representative of the real main-window UI | Browser Lab mounts the production `ExpandedPresentationSurface` and shared overlay components as-is; it synthesizes typed state/payload fixtures and uses applicable production selectors/helpers/projections, never duplicate widgets |
| Dev-only preview leaks the live runtime indicator into download/transcode scenes | Preview-tooling review | Each preview shows only the state it is meant to demonstrate | Browser Lab fixtures drive the same production selectors; runtime/transcode surfaces are DOM-based, so their shader stays idle (asserted in validation) |
| Dev-only scenario replay reuses `shortcut-show` or bypasses the lifecycle | Preview-tooling review | Preview stays self-contained without touching production lifecycle/native paths | Browser Lab runs in a plain browser page (no Electron); it never emits production events, never overrides runtime commands, and leaves the lifecycle authority untouched |
| Foreground feedback paints before explicit full intent is reduced | Main window enters a foreground feedback mode from compact icon mode | Foreground UI never appears cropped inside the compact shell | Issue explicit full intent through the presentation lifecycle before outcome state paints; the lifecycle owns the transition recipe |
| A stale compact reachability correction resolves after the surface expanded again | Main window compact/full transition | Late async work cannot move a newer full surface | Returning to interactive mode cancels the active correction; the semantic reachability operation carries a `requestEpoch` guard; no generic renderer bounds animation exists |
| Windows autostart reads only `openAtLogin` | Settings autostart status | UI can show enabled even when the current executable will not actually launch at login | Query the current executable path and treat `executableWillLaunchAtLogin` plus matching `launchItems.enabled` as the effective status |
| Windows autostart write path omits a stable registry name or Startup Approved state | Settings autostart toggle | Re-enabling can create drifted entries or fail to reactivate the existing startup item cleanly | Write explicit `name`, `path`, `args`, and `enabled` fields together |
| Frameless drag awaits `invoke(...)` or `set_window_position` on every pointer move | Main window drag path | Drag remains smooth and continuous | Use `currentWindow.setPosition(...)` fire-and-forget IPC, optionally RAF-batched |
| Frameless dev-only windows reintroduce a non-draggable child surface | Secondary window UX | Dev-only preview stays outside Electron, so no secondary dev window exists to drag | Browser Lab is a plain Vite page; no new frameless BrowserWindow is created |
| Managed runtime manifest lookup or asset download stalls indefinitely | Runtime bootstrap path | The gate does not stay in `checking`/`downloading` forever | Add bounded manifest timeout plus progress-based download stall timeout and convert timeout to `failed` |
| WebSocket host/port changes from `127.0.0.1:39527` | Browser extension connect path | Extension reconnect logic keeps working | Keep fixed loopback endpoint |
| Request correlation omits echoed `requestId` | Extension pending-request map | Background promise resolution breaks | Echo `data.requestId` on correlated responses |
| Failure response omits `data.code` for request/response actions | Extension error handling | Background cannot classify failure reliably | Include stable `data.code` values |
| `chrome.runtime.onMessage` handles a request with async `sendResponse` but does not return `true` | Extension content-script to background messaging | Chrome may close the message port before the response arrives, surfacing `runtime.lastError` to injected controls | Return `true` from every branch that resolves `sendResponse` asynchronously |
| `get_config` stops returning raw JSON string | Renderer bootstrap | Theme/language/config bootstrap breaks | Keep string contract |
| Legacy rename or quality keys stop being read | Existing user config | Old installs silently change behavior | Continue reading legacy keys during migration |
| Pinterest video naming reuses repeated UI titles such as `Pin 图卡片` | Electron runtime output path selection | Distinct Pinterest downloads settle to unique final files instead of failing after the first same-title save | Derive `pinterest_<shortId>` from the Pinterest URL and reserve stems before engine execution |
| Two active downloads choose the same output stem before either file exists on disk | Electron runtime queue concurrency | Concurrent tasks do not race into one filename or produce false `output file missing` failures | Serialize stem reservation and include active reserved stems in availability checks |
| Only `.part` / `.txt` / `.json` / `.ytdl` artifacts exist for a stem | Output path allocation | Retry or cleanup metadata does not force unnecessary suffix bumps | Ignore sidecar-only artifacts when selecting the preferred final stem |
| macOS updater enabled without signed/notarized distribution | Packaged runtime | Broken or misleading in-app updates | Return `null` for unsigned macOS updater check |
| Portable Windows build advertises in-app update install | Packaged runtime | Update flow can corrupt portable expectations if it opens the installer or overwrites a locked/unsafe path | Use the portable ZIP strategy only after marker, checksum, same-volume staging, and helper-spawn checks pass; otherwise surface a manual fallback |
| Preload exposes raw Electron objects/functions to renderer | Security review | Renderer gets overly privileged runtime access | Expose only serializable contract surface |

### 5. Good / Base / Bad Cases

- Good:
  - Renderer code replaces `invoke(...)` / `listen(...)` imports with `window.ameow` calls while command names and payload types remain unchanged.
  - Electron renderer startup surfaces an explicit bridge-failure screen if preload is missing instead of mounting an inert app shell.
  - On Windows startup, `main` reveals at the stable full viewport first, then only enters compact mode through the same lifecycle path used later in the session.
  - Electron dev startup reaches a visible `main` window on first stable paint without waiting for the full packaged-only renderer-ready handshake.
  - Non-critical startup status widgets do not mount until the initial full-window reveal has settled, but a user-triggered foreground action can still force the needed runtime refresh on demand.
  - Packaged startup reads config once for first-window theme, tray labels, and shortcut registration instead of serializing multiple config parses before the first reveal.
  - On Windows, the app exposes only the tray icon during normal idle/show-hide usage while `main`, `settings`, and other utility windows stay off the taskbar.
  - On Windows, the tray icon and any BrowserWindow icon surfaces use the Ameow app icon instead of the Electron default icon.
  - Download/transcode progress and direct-processing feedback restore `main` through one shared lifecycle intent, so the full shell never renders inside the compact presentation.
  - Frameless main-window dragging stays smooth because pointer moves use `currentWindow.setPosition(...)` over fire-and-forget IPC instead of request/response invoke loops.
  - Dev preview/export lives entirely in the Browser Lab (plain Vite, port 1421, no Electron): scenario fixtures drive the production surface/selectors and the one-click 4x PNG export preserves the 200x200 CSS composition.
  - The production Electron surface carries no UI Lab label, command, event, or route; production bundles exclude all Lab code.
  - Main/settings/context-menu can all subscribe to app events without `MaxListenersExceededWarning`.
  - Browser extension still connects to `ws://127.0.0.1:39527`, `get_language` succeeds, and `video_selected_v2` responses echo `requestId`.
  - Windows installer builds support in-app updates through the NSIS installer asset, while Windows portable builds support portable ZIP self-update through the external helper path.
  - macOS DMG builds stay manual-install artifacts with updater disabled cleanly.
  - Existing `settings.json` with legacy rename or quality keys still behaves the same after migration.
  - Pinterest downloads with a real title use that title first, while title-less Pinterest requests still fall back to stable names such as `pinterest_7f3a2c.mp4`.
- Base:
  - Electron main uses different implementation details internally, but renderer, config, and extension contracts stay stable.
  - Child-window creation moves out of renderer and into Electron main without changing labels or visible behavior.
  - Startup may still compact after the normal lifecycle settle path, but it does not perform a startup-only immediate shrink as part of first reveal.
  - Packaged startup may still perform native tray/shortcut setup work around first reveal, but shared config-derived startup decisions come from one snapshot instead of repeated config reads.
  - Dev-only tooling may add one extra secondary label as long as packaged builds reject it cleanly.
  - Foreground events may arrive before the first visible progress payload or before a direct-processing spinner/check state, but the window-restore ordering stays centralized.
  - Title-bearing video downloads continue using title-first stems, while title-less Pinterest requests may still use the provider-specific short-id fallback.
- Bad:
  - The native main window is created at compact icon size instead of the stable full viewport.
  - Startup reveals the full window and then immediately forces a startup-only compact transition before the regular idle timer has a chance to govern compacting.
  - Dev startup keeps the first show blocked on a long renderer-ready handshake even though a stable first paint was already available.
  - Deferred startup checks stay delayed even after a user-triggered action needs runtime status immediately, so the first foreground action fails on missing cached state.
  - Packaged startup re-parses the same config separately for theme, tray, and shortcut setup, stretching the first visible frame for no user-visible gain.
  - `main` or `settings` shows a Windows taskbar entry even though the product is meant to behave like a tray utility.
  - Electron main loads a runtime icon path that is not shipped in packaged builds, causing Windows to show the default Electron icon.
  - A BrowserWindow enables the default sandbox while still assuming the current preload bridge will expose `window.ameow`.
  - Renderer silently falls back to plain browser behavior when the Electron bridge is missing.
  - All app events share one `"ameow:event"` channel and rely on renderer-side event-name filtering.
  - UI Lab is shipped as a production-facing route or button.
  - UI Lab preview shows status/task content while the shell is still clipped to the compact circular icon shape, or preview bypasses the lifecycle with visual overrides.
  - Foreground feedback paints before the lifecycle reduces explicit full intent, so the panel is visibly cropped or flashes inside the compact shell.
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
  - Start Electron dev for `main`, `settings`, and `context-menu` and assert `window.ameow` exists before the normal UI boot path continues.
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
  - On Windows, assert the tray icon and BrowserWindow icon surfaces use the Ameow app icon instead of the default Electron icon in both dev and packaged runs.
  - In the Browser Lab (plain Vite, port 1421), apply each migrated scenario and assert the production surface/selectors render the intended state without any Electron bridge.
  - In the Browser Lab, click multiple scenario buttons back-to-back and assert the preview stays live and the shader/program remains linked.
  - In the Browser Lab, click the one-click 4x PNG export and assert the preview CSS stays 200x200 during the export, the badge landmark lands at exactly 4x its live rect, and the 200-downsample reproduces the live rect.
  - Start from compact icon mode, trigger download progress, and assert `main` returns to full native bounds before the full task panel becomes visible.
  - Start from compact icon mode, trigger transcode progress, and assert the same no-crop restore contract holds.
  - Start from compact icon mode, trigger a direct image/file processing path, and assert the processing feedback UI does not render inside compact native bounds.
  - Keep `main` already expanded and emit repeated download/transcode progress updates; assert no redundant full-size resize loop or focus steal occurs.
  - With live managed runtimes missing, the Browser Lab's runtime-failed fixture shows the runtime indicator with the fixture gate payload (hover popover diagnostic) and no unrelated progress ring; download/transcode fixtures drive the determinate/idle shader modes asserted in validation.
  - In the Browser Lab, export each scenario PNG and assert 912x912 transparent geometry: 200x200 content at 4x plus the production 14px gutter per side, with the live badge landmark preserved at a 56px backing-pixel inset; the export restores preview state afterwards.
  - In the Browser Lab, assert no production Electron entry point (label/command/route) is referenced and the production bundle excludes all Lab code.
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
  - Windows NSIS build surfaces updater availability through the installer strategy.
  - Windows portable build surfaces updater availability through the portable ZIP strategy when the marker and manifest metadata are valid.
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
const configStr = await window.ameow!.commands.invoke<string>("get_config");
const hasSettings = await window.ameow!.windows.has("settings");

if (!hasSettings) {
  await window.ameow!.windows.openSettings({
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
// No renderer-facing generic bounds animation exists; native placement is the
// semantic compact-reachability operation owned by Electron main.
```

Why wrong:
- A foreground path that renders full-size content before the lifecycle reduces explicit full intent can paint inside the compact shell.
- Separate task paths can drift if each listener owns its own restore sequence instead of issuing lifecycle intent.

```ts
await prepareMainWindowForForegroundTask();
setDownloadProgressByTrace((current) => ({
  ...current,
  [payload.traceId]: payload,
}));
```
