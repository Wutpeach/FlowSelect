import type { AppUpdateInfo, AppUpdateStatePayload } from "./appUpdate.js";

export type AmeowWindowLabel =
  | "main"
  | "settings"
  | "context-menu";

// These command names intentionally preserve the stable renderer command vocabulary
// while the transport stays fully Electron-owned.
export type AmeowRendererCommand =
  | "begin_open_output_folder_from_context_menu"
  | "begin_pick_output_folder_from_context_menu"
  | "broadcast_theme"
  | "cancel_download"
  | "cancel_transcode"
  | "check_ytdlp_version"
  | "copy_error_diagnostics"
  | "download_image"
  | "export_support_log"
  | "get_douyin_session_state"
  | "get_site_session_registry"
  | "get_site_session_diagnostics"
  | "get_site_session_state"
  | "get_autostart"
  | "get_clipboard_files"
  | "get_config"
  | "get_current_shortcut"
  | "get_gallery_dl_info"
  | "get_network_proxy_state"
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
  | "clear_douyin_session"
  | "clear_site_session"
  | "remove_transcode"
  | "reset_rename_counter"
  | "retry_transcode"
  | "save_config"
  | "save_data_url"
  | "select_advanced_quality_option"
  | "set_autostart"
  | "set_window_position"
  | "set_window_size"
  | "start_runtime_dependency_bootstrap"
  | "sync_site_session_from_extension";

export type AmeowAppEvent =
  | "app-update-preference-changed"
  | "app-update-state"
  | "context-menu-closed"
  | "devmode-changed"
  | "language-changed"
  | "network-proxy-state-changed"
  | "output-path-changed"
  | "rename-setting-changed"
  | "runtime-dependency-gate-state"
  | "settings-page-requested"
  | "site-session-state-changed"
  | "shortcut-show"
  | "theme-changed"
  | "video-download-complete"
  | "video-download-progress"
  | "video-queue-count"
  | "video-queue-detail"
  | "video-transcode-complete"
  | "video-transcode-failed"
  | "video-transcode-progress"
  | "video-transcode-queue-count"
  | "video-transcode-queue-detail"
  | "video-transcode-queued"
  | "video-transcode-removed"
  | "video-transcode-retried"
  | "ytdlp-version-refresh";

export type AmeowRendererEvent =
  | "app-update-preference-changed"
  | "context-menu-closed"
  | "output-path-changed"
  | "rename-setting-changed"
  | "settings-page-requested"
  | "theme-changed"
  | "ytdlp-version-refresh";

export type AmeowEventPayload<TPayload> = {
  payload: TPayload;
};

export type AmeowPoint = {
  x: number;
  y: number;
};

export type AmeowSize = {
  width: number;
  height: number;
};

export type AmeowBounds = AmeowPoint & AmeowSize;

export type AmeowDisplay = {
  position: AmeowPoint;
  size: AmeowSize;
  scaleFactor: number;
};

export type AmeowDialogFilter = {
  name: string;
  extensions: string[];
};

export type AmeowDialogOpenOptions = {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  filters?: AmeowDialogFilter[];
};

export type AmeowClipboardImage = {
  width: number;
  height: number;
  rgba: number[];
};

export type AmeowDroppedFolderPathFailureReason =
  | "EMPTY_PATH"
  | "UNRESOLVED_DROP"
  | "PRELOAD_ERROR"
  | "NOT_DIRECTORY"
  | "NOT_FOUND"
  | "STAT_FAILED";

export type AmeowDroppedFolderPathResult =
  | {
      success: true;
      path: string;
      name: string;
    }
  | {
      success: false;
      path: string;
      error: string;
      reason: AmeowDroppedFolderPathFailureReason;
    };

export type AmeowSecondaryWindowOptions = {
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  center?: boolean;
  alwaysOnTop?: boolean;
  focus?: boolean;
  routePath?: string;
  skipTaskbar?: boolean;
};

export type AmeowContextMenuWindowOptions = AmeowSecondaryWindowOptions & {
  parent: "main";
};

export type AmeowCompactReachableOptions = {
  reachableFrameSize: number;
  edgePadding: number;
  reducedMotion: boolean;
  requestEpoch: number;
};

export type AmeowCompactReachableResult = {
  requestEpoch: number;
  position: AmeowPoint;
};

export type AmeowCurrentWindowInteractionMode = "interactive" | "compact-passthrough";

export type AmeowCurrentWindowPointerBoundary = {
  inside: boolean;
};

export interface AmeowCurrentWindowApi {
  outerPosition(): Promise<AmeowPoint>;
  outerSize(): Promise<AmeowSize>;
  scaleFactor(): Promise<number>;
  startDragging(): Promise<void>;
  setPosition(position: AmeowPoint): void;
  setInteractionMode(mode: AmeowCurrentWindowInteractionMode): void;
  ensureMainWindowCompactReachable(
    options: AmeowCompactReachableOptions,
  ): Promise<AmeowCompactReachableResult>;
  cancelCompactReachability(): void;
  rendererReady(): Promise<void>;
  close(): Promise<void>;
  hide(): Promise<void>;
  onFocusChanged(
    listener: (event: AmeowEventPayload<boolean>) => void,
  ): Promise<() => void>;
  onBlur(listener: () => void): Promise<() => void>;
  onPointerBoundaryChanged(
    listener: (event: AmeowEventPayload<AmeowCurrentWindowPointerBoundary>) => void,
  ): Promise<() => void>;
}

export interface AmeowSystemApi {
  currentMonitor(): Promise<AmeowDisplay | null>;
  openDialog(
    options: AmeowDialogOpenOptions,
  ): Promise<string | string[] | null>;
  openExternal(url: string): Promise<void>;
  relaunch(): Promise<void>;
}

export interface AmeowDropApi {
  consumePendingFileDropPaths(): Promise<string[]>;
  consumePendingFolderDrop(): Promise<AmeowDroppedFolderPathResult | null>;
}

export interface AmeowElectronBridge {
  commands: {
    invoke<TResult>(
      command: AmeowRendererCommand,
      payload?: Record<string, unknown>,
    ): Promise<TResult>;
  };
  events: {
    on<TPayload>(
      event: AmeowAppEvent,
      listener: (event: AmeowEventPayload<TPayload>) => void,
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
  drop: AmeowDropApi;
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
