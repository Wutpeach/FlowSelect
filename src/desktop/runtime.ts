import type { AppUpdateInfo } from "../types/appUpdate";
import type {
  FlowSelectAppEvent,
  FlowSelectClipboardImage,
  FlowSelectContextMenuWindowOptions,
  FlowSelectCurrentWindowApi,
  FlowSelectDialogOpenOptions,
  FlowSelectDisplay,
  FlowSelectDroppedFolderPathResult,
  FlowSelectElectronBridge,
  FlowSelectEventPayload,
  FlowSelectRendererCommand,
  FlowSelectRendererEvent,
  FlowSelectSecondaryWindowOptions,
  FlowSelectWindowLabel,
} from "../types/electronBridge";

const resolveElectronBridge = (): FlowSelectElectronBridge => {
  if (typeof window === "undefined" || !window.flowselect) {
    throw new Error("FlowSelect Electron bridge is unavailable");
  }
  return window.flowselect;
};

export const isElectronRenderer = (): boolean => (
  typeof window !== "undefined" && Boolean(window.flowselect)
);

export const desktopCommands = {
  async invoke<TResult>(
    command: FlowSelectRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult> {
    return resolveElectronBridge().commands.invoke<TResult>(command, payload);
  },
};

export const desktopEvents = {
  async on<TPayload>(
    event: FlowSelectAppEvent,
    listener: (event: FlowSelectEventPayload<TPayload>) => void,
  ): Promise<() => void> {
    return resolveElectronBridge().events.on<TPayload>(event, listener);
  },
  async emit<TPayload>(
    event: FlowSelectRendererEvent,
    payload: TPayload,
  ): Promise<void> {
    await resolveElectronBridge().events.emit(event, payload);
  },
};

export const desktopCurrentWindow: FlowSelectCurrentWindowApi = {
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
  async animateBounds(bounds, options) {
    await resolveElectronBridge().currentWindow.animateBounds(bounds, options);
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
};

export const desktopSystem = {
  async currentMonitor(): Promise<FlowSelectDisplay | null> {
    return resolveElectronBridge().system.currentMonitor();
  },
  async openDialog(
    options: FlowSelectDialogOpenOptions,
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
  async consumePendingFolderDrop(): Promise<FlowSelectDroppedFolderPathResult | null> {
    return resolveElectronBridge().drop.consumePendingFolderDrop();
  },
};

export const desktopClipboard = {
  async readImage(): Promise<FlowSelectClipboardImage | null> {
    return resolveElectronBridge().clipboard.readImage();
  },
};

export const desktopUpdater = {
  async check(): Promise<AppUpdateInfo | null> {
    return resolveElectronBridge().updater.check();
  },
  async downloadAndInstall(): Promise<void> {
    await resolveElectronBridge().updater.downloadAndInstall();
  },
};

export const desktopWindows = {
  async has(label: FlowSelectWindowLabel): Promise<boolean> {
    return resolveElectronBridge().windows.has(label);
  },
  async focus(label: FlowSelectWindowLabel): Promise<void> {
    await resolveElectronBridge().windows.focus(label);
  },
  async close(label: "settings" | "context-menu" | "ui-lab"): Promise<void> {
    await resolveElectronBridge().windows.close(label);
  },
  async openSettings(options: FlowSelectSecondaryWindowOptions): Promise<void> {
    await resolveElectronBridge().windows.openSettings(options);
  },
  async openContextMenu(options: FlowSelectContextMenuWindowOptions): Promise<void> {
    await resolveElectronBridge().windows.openContextMenu(options);
  },
  async openUiLab(options: FlowSelectSecondaryWindowOptions): Promise<void> {
    await resolveElectronBridge().windows.openUiLab(options);
  },
};
