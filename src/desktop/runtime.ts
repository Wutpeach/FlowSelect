import type { AppUpdateInfo, AppUpdateStatePayload } from "../types/appUpdate";
import type {
  AmeowAppEvent,
  AmeowClipboardImage,
  AmeowContextMenuWindowOptions,
  AmeowCurrentWindowApi,
  AmeowDialogOpenOptions,
  AmeowDisplay,
  AmeowDroppedFolderPathResult,
  AmeowElectronBridge,
  AmeowEventPayload,
  AmeowRendererCommand,
  AmeowRendererEvent,
  AmeowSecondaryWindowOptions,
  AmeowWindowLabel,
} from "../types/electronBridge";

const resolveElectronBridge = (): AmeowElectronBridge => {
  if (typeof window === "undefined" || !window.ameow) {
    throw new Error("Ameow Electron bridge is unavailable");
  }
  return window.ameow;
};

export const isElectronRenderer = (): boolean => (
  typeof window !== "undefined" && Boolean(window.ameow)
);

export const desktopCommands = {
  async invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult> {
    return resolveElectronBridge().commands.invoke<TResult>(command, payload);
  },
};

export const desktopEvents = {
  async on<TPayload>(
    event: AmeowAppEvent,
    listener: (event: AmeowEventPayload<TPayload>) => void,
  ): Promise<() => void> {
    return resolveElectronBridge().events.on<TPayload>(event, listener);
  },
  async emit<TPayload>(
    event: AmeowRendererEvent,
    payload: TPayload,
  ): Promise<void> {
    await resolveElectronBridge().events.emit(event, payload);
  },
};

export const desktopCurrentWindow: AmeowCurrentWindowApi = {
  async outerPosition() {
    return resolveElectronBridge().currentWindow.outerPosition();
  },
  async outerSize() {
    return resolveElectronBridge().currentWindow.outerSize();
  },
  async scaleFactor() {
    return resolveElectronBridge().currentWindow.scaleFactor();
  },
  async startDragging() {
    await resolveElectronBridge().currentWindow.startDragging();
  },
  setPosition(position) {
    resolveElectronBridge().currentWindow.setPosition(position);
  },
  setInteractionMode(mode) {
    resolveElectronBridge().currentWindow.setInteractionMode(mode);
  },
  async ensureMainWindowCompactReachable(options) {
    return resolveElectronBridge().currentWindow.ensureMainWindowCompactReachable(options);
  },
  cancelCompactReachability() {
    resolveElectronBridge().currentWindow.cancelCompactReachability();
  },
  async rendererReady() {
    await resolveElectronBridge().currentWindow.rendererReady();
  },
  async close() {
    await resolveElectronBridge().currentWindow.close();
  },
  async hide() {
    await resolveElectronBridge().currentWindow.hide();
  },
  async onFocusChanged(listener) {
    return resolveElectronBridge().currentWindow.onFocusChanged(listener);
  },
  async onBlur(listener) {
    return resolveElectronBridge().currentWindow.onBlur(listener);
  },
  async onPointerBoundaryChanged(listener) {
    return resolveElectronBridge().currentWindow.onPointerBoundaryChanged(listener);
  },
};

export const desktopSystem = {
  async currentMonitor(): Promise<AmeowDisplay | null> {
    return resolveElectronBridge().system.currentMonitor();
  },
  async openDialog(
    options: AmeowDialogOpenOptions,
  ): Promise<string | string[] | null> {
    return resolveElectronBridge().system.openDialog(options);
  },
  async openExternal(url: string): Promise<void> {
    await resolveElectronBridge().system.openExternal(url);
  },
  async relaunch(): Promise<void> {
    await resolveElectronBridge().system.relaunch();
  },
};

export const desktopDrop = {
  async consumePendingFileDropPaths(): Promise<string[]> {
    return resolveElectronBridge().drop.consumePendingFileDropPaths();
  },
  async consumePendingFolderDrop(): Promise<AmeowDroppedFolderPathResult | null> {
    return resolveElectronBridge().drop.consumePendingFolderDrop();
  },
};

export const desktopClipboard = {
  async readImage(): Promise<AmeowClipboardImage | null> {
    return resolveElectronBridge().clipboard.readImage();
  },
};

export const desktopUpdater = {
  async check(): Promise<AppUpdateInfo | null> {
    return resolveElectronBridge().updater.check();
  },
  async getState(): Promise<AppUpdateStatePayload> {
    return resolveElectronBridge().updater.getState();
  },
  async notifyPreferenceChanged(): Promise<AppUpdateStatePayload> {
    return resolveElectronBridge().updater.notifyPreferenceChanged();
  },
  async downloadAndInstall(): Promise<void> {
    await resolveElectronBridge().updater.downloadAndInstall();
  },
};

export const desktopWindows = {
  async has(label: AmeowWindowLabel): Promise<boolean> {
    return resolveElectronBridge().windows.has(label);
  },
  async focus(label: AmeowWindowLabel): Promise<void> {
    await resolveElectronBridge().windows.focus(label);
  },
  async close(label: "settings" | "context-menu"): Promise<void> {
    await resolveElectronBridge().windows.close(label);
  },
  async openSettings(options: AmeowSecondaryWindowOptions): Promise<void> {
    await resolveElectronBridge().windows.openSettings(options);
  },
  async openContextMenu(options: AmeowContextMenuWindowOptions): Promise<void> {
    await resolveElectronBridge().windows.openContextMenu(options);
  },
};
