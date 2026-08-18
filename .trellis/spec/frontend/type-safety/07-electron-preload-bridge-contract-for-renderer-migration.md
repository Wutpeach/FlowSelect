## Scenario: Electron Preload Bridge Contract For Renderer Migration

### 1. Scope / Trigger

- Trigger: Any renderer file replaces direct `@tauri-apps/*` imports with the Electron preload bridge, or any new desktop-only renderer code is added after the Electron foundation task.
- Why this needs code-spec depth: The migration moves desktop ownership from Tauri plugins into Electron preload/main, but renderer behavior still depends on stable command names, event names, and child-window semantics.

### 2. Signatures

Source-of-truth types:

```ts
import type {
  AmeowElectronBridge,
  AmeowRendererCommand,
  AmeowAppEvent,
} from "../types/electronBridge";
```

Canonical renderer bridge usage:

```ts
const configStr = await window.ameow!.commands.invoke<string>("get_config");

const unlisten = await window.ameow!.events.on<Theme>(
  "theme-changed",
  (event) => {
    setTheme(event.payload);
  },
);

await window.ameow!.windows.openSettings({
  title: "Settings",
  width: 360,
  height: 420,
  center: true,
  alwaysOnTop: true,
});

const selection = await window.ameow!.system.openDialog({
  directory: true,
  multiple: false,
  title: "Choose Output Folder",
});

const update = await window.ameow!.updater.check();
await window.ameow!.updater.downloadAndInstall();
```

Current-window compact reachability typing:

```ts
const result = await window.ameow!.currentWindow.ensureMainWindowCompactReachable({
  reachableFrameSize,
  edgePadding: 8,
  reducedMotion,
  requestEpoch,
});

if (result.requestEpoch !== requestEpoch) {
  return;
}
```

The renderer cannot request arbitrary native width/height, target bounds, easing, or duration. Electron main owns monitor selection, clamping, and position-only interpolation; returning to interactive mode cancels any active correction.

### 3. Contracts

- New Electron-migrated renderer files must not import:
  - `@tauri-apps/api/*`
  - `@tauri-apps/plugin-*`
  - `electron`
  - Node built-ins
- Use `window.ameow!.commands.invoke<T>(...)` for desktop commands and keep current command names stable while transport changes.
- Use `window.ameow!.events.on<T>(...)` / `emit(...)` for app events and keep current event names stable while transport changes.
- Desktop bootstrap code that detects Electron must fail fast if `window.ameow` is missing; do not silently mount the normal app shell as if it were plain web mode.
- Event subscriptions must treat each event name as its own channel contract. Do not rely on a single renderer listener that receives unrelated event names and filters them ad hoc.
- Secondary windows must go through:
  - `window.ameow!.windows.has(...)`
  - `window.ameow!.windows.focus(...)`
  - `window.ameow!.windows.openSettings(...)`
  - `window.ameow!.windows.openContextMenu(...)`
- Dev-only preview/export tooling does not use the Electron bridge: the Browser Lab (plain Vite, port 1421, `lab.html` + `src/lab/`) is a standalone browser page with no desktop bridge import. It synthesizes typed production state/payload fixtures, applies the relevant production selectors/helpers/projections, and renders through the production `ExpandedPresentationSurface`. The retired Electron UI Lab surface (`openUiLab`, `dev_ui_lab_apply_scenario`, `ui-lab-reset`) must not be reintroduced on the bridge.
- The Browser Lab must remain a dev-only surface gated behind the `vite.lab.config.ts` entry; the production build input is pinned to `index.html`, so Lab code is excluded from production bundles and no packaged route or settings entry point exposes it.
- `window.ameow!.clipboard.readImage()` must return serializable pixel data only; renderer remains responsible for converting that into a `data:` URL for existing image-save flows.
- `window.ameow!.updater.check()` must return serializable `AppUpdateInfo | null`; renderer must not expect a raw updater handle object with platform-specific methods.
- App-update channel preference contract:
  - Settings persists the opt-in flag under config key `receivePrereleaseUpdates`.
  - Settings must write that key through `window.ameow!.commands.invoke<void>("save_config", { json })`; do not invent a dedicated updater-settings command unless the typed command surface is updated in the same change.
  - Renderer config parsing for desktop bootstrap/settings must tolerate invalid JSON and fall back to `{}` before reading `receivePrereleaseUpdates`.
  - Settings must emit `window.ameow!.events.emit("app-update-preference-changed", { receivePrereleaseUpdates: boolean })` after a successful save so already-mounted surfaces can refresh update state without restart.
  - Main-window listeners may treat `app-update-preference-changed` as a stateless refresh signal and re-run `window.ameow!.updater.check()`, but they must not assume the emitted payload is the source of truth over persisted config.
- High-frequency frameless-window motion must use the typed current-window bridge (`outerPosition()` + `setPosition(...)`) rather than `commands.invoke("set_window_position")`.
- Normal full↔compact morphs are renderer-visual-only with a stable BrowserWindow viewport; there is no renderer-facing generic bounds animation API. The only native placement operation is the semantic `ensureMainWindowCompactReachable(...)` (monitor clamp + position-only interpolation) plus `cancelCompactReachability()`.
- Compact lifecycle completion has one acknowledgement: the matching Renderer Motion collapse completion, epoch-checked in the presentation lifecycle. Native compact reachability is independent, cancellable OS work; it never gates the lifecycle or passthrough, and its request/response `requestEpoch` guard prevents stale corrections from moving a newer full surface.
- If Electron main repositions `main` natively outside the renderer drag path, such as the `shortcut-show` summon flow, renderer presentation helpers issue explicit full intent through the lifecycle; no cached renderer position is reused for native placement because Electron main owns the corrected position.
- The optional global `window.ameow` is the migration boundary. Do not scatter ad hoc fallback branches across components; use a small adapter layer or fail fast where the bridge is required.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Migrated file still imports `@tauri-apps/*` | Code review / literal search | Renderer boundary stays preload-mediated | Replace imports with `window.ameow` usage |
| Preload command name drifts from current Rust command name | Runtime invoke path | Existing renderer call site still works | Keep current command string stable |
| Electron mode is detected but `window.ameow` is missing | Renderer bootstrap | Failure is explicit and diagnosable | Fail fast instead of silently mounting browser-mode UI |
| Event listener implementation depends on one shared desktop IPC channel | Re-render / subscription churn | Listener counts stay bounded and event payloads stay local to their contract | Use event-specific channels and matching cleanup |
| Child window created with raw Electron/Tauri APIs | Window lifecycle path | Window ownership stays centralized | Route through `window.ameow!.windows.*` |
| Dev-only preview route is registered in production | Renderer bootstrap / routing | Internal tooling stays hidden from packaged users | Production build input is pinned to `index.html`; the Browser Lab entry (`lab.html` + `src/lab/`) is excluded from production bundles |
| Scenario preview uses an untyped command or ad hoc event name | Preview boundary | Browser Lab scenarios stay on production types and never touch the Electron bridge | Synthesize typed state/payload fixtures and use applicable production selectors/helpers/projections; no `dev_ui_lab_apply_scenario` / `ui-lab-reset` contract exists on the bridge |
| Clipboard bridge returns non-serializable platform handle | Renderer paste path | Renderer can still convert to `data:` URL | Return structured `{ width, height, rgba }` only |
| Updater bridge leaks provider-specific object shape | Update UI path | Renderer remains platform-agnostic | Return `AppUpdateInfo | null` and expose install separately |
| Settings writes prerelease preference through ad hoc local state only | Update channel toggle path | Preference is lost on refresh/restart | Persist `receivePrereleaseUpdates` through `get_config` / `save_config` |
| Renderer crashes on invalid config JSON while reading app-update preference | Desktop bootstrap / Settings mount | UI still renders and defaults to stable-only updates | Parse config defensively and fall back to `{}` |
| Settings emits `app-update-preference-changed` before save succeeds | Cross-window refresh path | Main window may refresh against stale persisted config | Emit the event only after `save_config` resolves |
| Main window treats the emitted payload as canonical without rechecking updater state | Update-indicator path | UI can drift from the actual available update result | Re-run `window.ameow!.updater.check()` on the event |
| Frameless drag uses `commands.invoke("set_window_position")` inside `pointermove` | Main window interaction | Drag stays smooth | Use `currentWindow.setPosition(...)` fire-and-forget |
| Icon-mode expand introduces a second temporary overlay BrowserWindow | Main window transition path | Expand remains a single-HWND morph with no cross-window handoff | Keep the stable main BrowserWindow; morph is renderer-visual-only |
| Stale compact reachability correction resolves after the surface expanded again | Main window transition path | Late OS work cannot move a newer full surface | Returning to interactive mode cancels the active correction; `requestEpoch` guards async results |
| Renderer requests arbitrary native width/height or duration | Main window transition path | Renderer cannot control native size animation | Only the semantic `ensureMainWindowCompactReachable(...)` placement op is exposed |
| `window.ameow` absence handled differently in many components | Migration review | Bridge failures stay predictable | Centralize access behind one adapter or fail fast consistently |

### 5. Good / Base / Bad Cases

- Good:
  - A migrated component replaces `invoke<string>("get_config")` with `window.ameow!.commands.invoke<string>("get_config")` and keeps the same JSON parsing logic.
  - Settings toggles `receivePrereleaseUpdates`, persists it to config, emits `app-update-preference-changed`, and the main window refreshes update availability without restart.
  - `App.tsx` child-window logic moves from `WebviewWindow` calls to `window.ameow!.windows.has/focus/open*` without changing labels or visible behavior.
  - `src/main.tsx` stops booting the normal desktop shell when Electron is detected but the preload bridge is unavailable.
  - Dev-only preview/export stays out of Electron: the Browser Lab (plain Vite, port 1421) mounts the production surface with fixture state and never imports the desktop bridge; the retired `openUiLab` / `dev_ui_lab_apply_scenario` / `ui-lab-reset` surface is absent from the bridge.
  - Frameless window dragging uses `outerPosition()` + `setPosition(...)` over the typed current-window bridge, so pointer-move updates stay out of the command invoke path.
  - `shortcut-show` issues explicit full intent through the presentation lifecycle, and Electron main owns the corrected compact position through the semantic reachability op.
  - Clipboard-image flows still receive pixel data that the renderer turns into a PNG data URL before calling `save_data_url`.
- Base:
  - Legacy Tauri files may still exist during incremental migration, but any newly migrated file uses the preload bridge exclusively.
- Bad:
  - A migrated file imports `ipcRenderer` directly.
  - Settings stores the prerelease toggle only in React state, so refresh/restart resets the user back to stable updates silently.
  - Main window subscribes to `app-update-preference-changed` but never re-runs the updater check, so the indicator keeps stale stable/prerelease state until the next app launch.
  - A renderer subscribes to one catch-all desktop event listener and switches on event names locally.
  - Renderer calls a removed generic bounds animation API for compact/full presentation; native placement must go through the semantic reachability operation instead.
  - Desktop bootstrap silently falls back to browser-mode routing when `window.ameow` is missing.
  - Renderer update UI depends on an Electron-specific updater object instead of the preload contract.
  - Different components invent different child-window APIs instead of using `window.ameow!.windows`.

### 6. Tests Required (with assertion points)

- `npm run type-check` passes with `src/types/electronBridge.ts` and `src/global.d.ts` included.
- Migrated renderer files contain no fresh `@tauri-apps/*` imports.
- Electron bootstrap path shows an explicit failure state if `window.ameow` is unavailable.
- Child-window flows still open/focus `settings` and `context-menu` through the typed bridge.
- Dev-only preview route is registered only when `import.meta.env.DEV` is true.
- Dev-only preview stays out of Electron entirely: the Browser Lab mounts the production surface in a plain Vite page and production bundles exclude it.
- Frameless drag stays on the typed current-window bridge and avoids per-move `invoke(...)`.
- `ensureMainWindowCompactReachable(...)` keeps the `requestEpoch` request field aligned across renderer, preload, and main process; no generic renderer bounds animation API exists.
- Clipboard-image save flows still receive enough data to produce a PNG data URL.
- Update UI still handles `null` from `window.ameow!.updater.check()` safely.
- Settings prerelease toggle survives invalid existing config JSON by writing a valid object with `receivePrereleaseUpdates`.
- Toggling the prerelease preference emits `app-update-preference-changed` only after `save_config` succeeds.

### 7. Wrong vs Correct

#### Wrong

```ts
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const configStr = await invoke<string>("get_config");
const selected = await open({ directory: true });
```

#### Correct

```ts
const configStr = await window.ameow!.commands.invoke<string>("get_config");
const selected = await window.ameow!.system.openDialog({
  directory: true,
  multiple: false,
});
```
