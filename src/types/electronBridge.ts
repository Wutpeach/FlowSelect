import type { AppUpdateInfo } from "./appUpdate";

export type FlowSelectWindowLabel = "main" | "settings" | "context-menu";

// These command names intentionally preserve the stable renderer command vocabulary
// while the transport stays fully Electron-owned.
export type FlowSelectRendererCommand =
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
  | "get_pinterest_downloader_info"
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
  | "retry_transcode"
  | "save_config"
  | "save_data_url"
  | "set_autostart"
  | "set_window_position"
  | "set_window_size"
  | "start_runtime_dependency_bootstrap"
  | "update_ytdlp";

export type FlowSelectAppEvent =
  | "context-menu-closed"
  | "devmode-changed"
  | "language-changed"
  | "output-path-changed"
  | "rename-setting-changed"
  | "runtime-dependency-gate-state"
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

export type FlowSelectRendererEvent =
  | "context-menu-closed"
  | "output-path-changed"
  | "rename-setting-changed"
  | "theme-changed"
  | "ytdlp-version-refresh";

export type FlowSelectEventPayload<TPayload> = {
  payload: TPayload;
};

export type FlowSelectPoint = {
  x: number;
  y: number;
};

export type FlowSelectSize = {
  width: number;
  height: number;
};

export type FlowSelectDisplay = {
  position: FlowSelectPoint;
  size: FlowSelectSize;
  scaleFactor: number;
};

export type FlowSelectDialogFilter = {
  name: string;
  extensions: string[];
};

export type FlowSelectDialogOpenOptions = {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  filters?: FlowSelectDialogFilter[];
};

export type FlowSelectClipboardImage = {
  width: number;
  height: number;
  rgba: number[];
};

export type FlowSelectSecondaryWindowOptions = {
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  center?: boolean;
  alwaysOnTop?: boolean;
  focus?: boolean;
  skipTaskbar?: boolean;
};

export type FlowSelectContextMenuWindowOptions = FlowSelectSecondaryWindowOptions & {
  parent: "main";
};

export interface FlowSelectCurrentWindowApi {
  outerPosition(): Promise<FlowSelectPoint>;
  outerSize(): Promise<FlowSelectSize>;
  scaleFactor(): Promise<number>;
  startDragging(): Promise<void>;
  setPosition(position: FlowSelectPoint): void;
  close(): Promise<void>;
  hide(): Promise<void>;
  onFocusChanged(
    listener: (event: FlowSelectEventPayload<boolean>) => void,
  ): Promise<() => void>;
  onBlur(listener: () => void): Promise<() => void>;
}

export interface FlowSelectSystemApi {
  currentMonitor(): Promise<FlowSelectDisplay | null>;
  openDialog(
    options: FlowSelectDialogOpenOptions,
  ): Promise<string | string[] | null>;
  openExternal(url: string): Promise<void>;
  relaunch(): Promise<void>;
}

export interface FlowSelectElectronBridge {
  commands: {
    invoke<TResult>(
      command: FlowSelectRendererCommand,
      payload?: Record<string, unknown>,
    ): Promise<TResult>;
  };
  events: {
    on<TPayload>(
      event: FlowSelectAppEvent,
      listener: (event: FlowSelectEventPayload<TPayload>) => void,
    ): Promise<() => void>;
    emit<TPayload>(event: FlowSelectRendererEvent, payload: TPayload): Promise<void>;
  };
  windows: {
    has(label: FlowSelectWindowLabel): Promise<boolean>;
    focus(label: FlowSelectWindowLabel): Promise<void>;
    close(label: "settings" | "context-menu"): Promise<void>;
    openSettings(options: FlowSelectSecondaryWindowOptions): Promise<void>;
    openContextMenu(options: FlowSelectContextMenuWindowOptions): Promise<void>;
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
