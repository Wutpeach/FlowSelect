## Scenario: Electron Foundation Replacement Contract

### 1. Scope / Trigger

- Trigger: Any task that ports Ameow runtime ownership from Tauri/Rust into Electron main + preload.
- Why this needs code-spec depth: This migration crosses renderer, native runtime, browser extension, config persistence, and release packaging boundaries. Small drift at any one boundary can silently break the app even if local compilation still passes.

### 2. Signatures

Window labels:

```ts
type AmeowWindowLabel = "main" | "settings" | "context-menu";
```

Fixed runtime endpoints / paths:

```ts
type AmeowWsEndpoint = "ws://127.0.0.1:39527";
type AmeowConfigFileName = "settings.json";
```

Preload source-of-truth type:

```ts
type AmeowElectronBridge =
  import("../../src/types/electronBridge").AmeowElectronBridge;
```

Electron-only IPC channels introduced by the preload bridge:

```ts
type AmeowEventChannel = `ameow:event:${AmeowAppEvent}`;
type AmeowCurrentWindowPositionChannel = "ameow:current-window:set-position";
```

Startup viewport contract:

- The Main Window always starts with the stable full outer viewport; the
  dormant compact native startup path and its `startupWindowMode()` resolver
  were removed. Normal full↔compact morphs are renderer-visual-only and never
  change native width/height.

Required preload surface summary:

```ts
interface AmeowElectronBridge {
  commands: {
    invoke<TResult>(
      command: AmeowRendererCommand,
      payload?: Record<string, unknown>,
    ): Promise<TResult>;
  };
  events: {
    on<TPayload>(
      event: AmeowAppEvent,
      listener: (event: { payload: TPayload }) => void,
    ): Promise<() => void>;
    emit<TPayload>(event: AmeowRendererEvent, payload: TPayload): Promise<void>;
  };
  windows: {
    has(label: AmeowWindowLabel): Promise<boolean>;
    focus(label: AmeowWindowLabel): Promise<void>;
    close(label: "settings" | "context-menu"): Promise<void>;
    openSettings(options: AmeowSecondaryWindowOptions): Promise<void>;
    openContextMenu(options: AmeowContextMenuWindowOptions): Promise<void>;
  };
  currentWindow: AmeowCurrentWindowApi;
  system: AmeowSystemApi;
  clipboard: {
    readImage(): Promise<AmeowClipboardImage | null>;
  };
  updater: {
    check(): Promise<AppUpdateInfo | null>;
    getState(): Promise<AppUpdateStatePayload>;
    notifyPreferenceChanged(): Promise<AppUpdateStatePayload>;
    downloadAndInstall(): Promise<void>;
  };
}
```

Current-window compact-reachability contract:

```ts
type AmeowCompactReachableOptions = {
  reachableFrameSize: number;
  edgePadding: number;
  reducedMotion: boolean;
  requestEpoch: number;
};

type AmeowCompactReachableResult = {
  requestEpoch: number;
  position: AmeowPoint;
};

interface AmeowCurrentWindowApi {
  ensureMainWindowCompactReachable(
    options: AmeowCompactReachableOptions,
  ): Promise<AmeowCompactReachableResult>;
  cancelCompactReachability(): void;
}
```

This is the only native placement operation: monitor clamp + position-only
interpolation owned by `electron/mainWindowSurfacePolicy.mts`, cancelable and
`requestEpoch`-guarded. There is no generic renderer bounds-animation API
(`animateBounds`) and no `startupWindowMode()` bridge method; both were removed
with the dormant compact native startup path.

Current-window interaction-mode contract:

```ts
type AmeowCurrentWindowInteractionMode = "interactive" | "compact-passthrough";

interface AmeowCurrentWindowApi {
  setInteractionMode(mode: AmeowCurrentWindowInteractionMode): void;
}
```

Current renderer-facing command names that must remain stable through the preload bridge:

```ts
type AmeowRendererCommand =
  | "begin_open_output_folder_from_context_menu"
  | "begin_pick_output_folder_from_context_menu"
  | "broadcast_theme"
  | "cancel_download"
  | "cancel_transcode"
  | "check_ytdlp_version"
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
  | "queue_pasted_video_download"
  | "queue_video_download"
  | "refresh_runtime_dependency_gate_state"
  | "resolve_xiaohongshu_drag_media"
  | "register_shortcut"
  | "remove_transcode"
  | "reset_rename_counter"
  | "save_config"
  | "save_data_url"
  | "set_autostart"
  | "set_window_position"
  | "set_window_size"
  | "start_runtime_dependency_bootstrap";
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

Extension injection-debug config WS actions:

```json
{
  "action": "get_extension_debug_config",
  "data": {
    "requestId": "req-123"
  }
}
```

```json
{
  "success": true,
  "message": null,
  "data": {
    "action": "extension_debug_config_info",
    "enabled": true,
    "requestId": "req-123"
  }
}
```

```json
{
  "action": "extension_debug_config_changed",
  "data": {
    "enabled": true
  }
}
```

### 3. Contracts

#### Replacement Matrix

| Current Tauri/runtime surface | Current owner | Electron replacement | Contract |
|------------------------------|---------------|----------------------|----------|
| `@tauri-apps/api/core.invoke` | Renderer -> Rust command | `window.ameow.commands.invoke` | Keep command names + payload keys stable. |
| `@tauri-apps/api/event.listen` / `emit` | Renderer/global event bus | `window.ameow.events.on` / `emit` | Keep event names + payload shapes stable. |
| `WebviewWindow.getByLabel(...)` | Renderer | `window.ameow.windows.has` / `focus` | Keep labels `main`, `settings`, `context-menu`. |
| `new WebviewWindow("settings", ...)` | Renderer | `window.ameow.windows.openSettings(...)` | BrowserWindow creation is main-owned only. |
| `new WebviewWindow("context-menu", ...)` | Renderer | `window.ameow.windows.openContextMenu(...)` | BrowserWindow creation is main-owned only. |

#### Folder-Open Command Contract

- Commands:
  - `open_current_output_folder`
  - `open_folder`
- Electron API boundary:
  - `shell.openPath(path)` returns an empty string on success and a non-empty error string on failure.
