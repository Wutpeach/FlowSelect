import { APP_VERSION } from "../constants/appVersion";
import type { AppUpdateInfo } from "../types/appUpdate";
import type {
  FlowSelectAppEvent,
  FlowSelectClipboardImage,
  FlowSelectContextMenuWindowOptions,
  FlowSelectCurrentWindowApi,
  FlowSelectDialogOpenOptions,
  FlowSelectDisplay,
  FlowSelectEventPayload,
  FlowSelectRendererCommand,
  FlowSelectRendererEvent,
  FlowSelectSecondaryWindowOptions,
  FlowSelectWindowLabel,
} from "../types/electronBridge";

type TauriUpdateHandle = {
  currentVersion?: string | null;
  version: string;
  body?: string | null;
  date?: string | null;
  downloadAndInstall(): Promise<void>;
  close(): Promise<void>;
};

type TauriEventTarget = {
  listen<TPayload>(
    event: string,
    listener: (event: FlowSelectEventPayload<TPayload>) => void,
  ): Promise<() => void>;
};

let tauriPendingUpdate: TauriUpdateHandle | null = null;

let tauriCorePromise: Promise<typeof import("@tauri-apps/api/core")> | null = null;
let tauriEventPromise: Promise<typeof import("@tauri-apps/api/event")> | null = null;
let tauriWindowPromise: Promise<typeof import("@tauri-apps/api/window")> | null = null;
let tauriWebviewPromise: Promise<typeof import("@tauri-apps/api/webviewWindow")> | null = null;
let tauriDialogPromise: Promise<typeof import("@tauri-apps/plugin-dialog")> | null = null;
let tauriOpenerPromise: Promise<typeof import("@tauri-apps/plugin-opener")> | null = null;
let tauriProcessPromise: Promise<typeof import("@tauri-apps/plugin-process")> | null = null;
let tauriClipboardPromise: Promise<typeof import("@tauri-apps/plugin-clipboard-manager")> | null = null;
let tauriUpdaterPromise: Promise<typeof import("@tauri-apps/plugin-updater")> | null = null;

const loadTauriCore = () => (
  tauriCorePromise ??= import("@tauri-apps/api/core")
);

const loadTauriEvent = () => (
  tauriEventPromise ??= import("@tauri-apps/api/event")
);

const loadTauriWindow = () => (
  tauriWindowPromise ??= import("@tauri-apps/api/window")
);

const loadTauriWebviewWindow = () => (
  tauriWebviewPromise ??= import("@tauri-apps/api/webviewWindow")
);

const loadTauriDialog = () => (
  tauriDialogPromise ??= import("@tauri-apps/plugin-dialog")
);

const loadTauriOpener = () => (
  tauriOpenerPromise ??= import("@tauri-apps/plugin-opener")
);

const loadTauriProcess = () => (
  tauriProcessPromise ??= import("@tauri-apps/plugin-process")
);

const loadTauriClipboard = () => (
  tauriClipboardPromise ??= import("@tauri-apps/plugin-clipboard-manager")
);

const loadTauriUpdater = () => (
  tauriUpdaterPromise ??= import("@tauri-apps/plugin-updater")
);

const resolveElectronBridge = () => (
  typeof window !== "undefined" ? window.flowselect : undefined
);

export const isElectronRenderer = (): boolean => Boolean(resolveElectronBridge());

const closePendingTauriUpdate = async (nextUpdate: TauriUpdateHandle | null) => {
  if (tauriPendingUpdate && tauriPendingUpdate !== nextUpdate) {
    try {
      await tauriPendingUpdate.close();
    } catch (error) {
      console.error("Failed to dispose pending Tauri updater handle:", error);
    }
  }
  tauriPendingUpdate = nextUpdate;
};

const buildAppUpdateInfo = (update: TauriUpdateHandle): AppUpdateInfo => ({
  current: update.currentVersion || APP_VERSION,
  latest: update.version,
  notes: update.body ?? null,
  publishedAt: update.date ?? null,
});

export const desktopCommands = {
  async invoke<TResult>(
    command: FlowSelectRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.commands.invoke<TResult>(command, payload);
    }

    const { invoke } = await loadTauriCore();
    return invoke<TResult>(command, payload);
  },
};

export const desktopEvents = {
  async on<TPayload>(
    event: FlowSelectAppEvent,
    listener: (event: FlowSelectEventPayload<TPayload>) => void,
  ): Promise<() => void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.events.on<TPayload>(event, listener);
    }

    const { listen } = await loadTauriEvent();
    return listen<TPayload>(event, listener);
  },
  async emit<TPayload>(
    event: FlowSelectRendererEvent,
    payload: TPayload,
  ): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.events.emit(event, payload);
      return;
    }

    const { emit } = await loadTauriEvent();
    await emit(event, payload);
  },
};

export const desktopCurrentWindow: FlowSelectCurrentWindowApi = {
  async outerPosition() {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.currentWindow.outerPosition();
    }

    const { getCurrentWindow } = await loadTauriWindow();
    const position = await getCurrentWindow().outerPosition();
    return {
      x: position.x,
      y: position.y,
    };
  },
  async outerSize() {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.currentWindow.outerSize();
    }

    const { getCurrentWindow } = await loadTauriWindow();
    const size = await getCurrentWindow().outerSize();
    return {
      width: size.width,
      height: size.height,
    };
  },
  async scaleFactor() {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.currentWindow.scaleFactor();
    }

    const { getCurrentWindow } = await loadTauriWindow();
    return getCurrentWindow().scaleFactor();
  },
  async startDragging() {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.currentWindow.startDragging();
      return;
    }

    const { getCurrentWindow } = await loadTauriWindow();
    await getCurrentWindow().startDragging();
  },
  async close() {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.currentWindow.close();
      return;
    }

    const { getCurrentWindow } = await loadTauriWindow();
    await getCurrentWindow().close();
  },
  async hide() {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.currentWindow.hide();
      return;
    }

    const { getCurrentWindow } = await loadTauriWindow();
    await getCurrentWindow().hide();
  },
  async onFocusChanged(listener) {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.currentWindow.onFocusChanged(listener);
    }

    const { getCurrentWindow } = await loadTauriWindow();
    return getCurrentWindow().onFocusChanged(listener);
  },
  async onBlur(listener) {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.currentWindow.onBlur(listener);
    }

    const { getCurrentWindow } = await loadTauriWindow();
    const currentWindow = getCurrentWindow() as unknown as TauriEventTarget;
    return currentWindow.listen<void>("tauri://blur", () => {
      listener();
    });
  },
};

export const desktopSystem = {
  async currentMonitor(): Promise<FlowSelectDisplay | null> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.system.currentMonitor();
    }

    const { currentMonitor } = await loadTauriWindow();
    const monitor = await currentMonitor();
    if (!monitor) {
      return null;
    }

    return {
      position: {
        x: monitor.position.x,
        y: monitor.position.y,
      },
      size: {
        width: monitor.size.width,
        height: monitor.size.height,
      },
      scaleFactor: monitor.scaleFactor,
    };
  },
  async openDialog(
    options: FlowSelectDialogOpenOptions,
  ): Promise<string | string[] | null> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.system.openDialog(options);
    }

    const { open } = await loadTauriDialog();
    return open(options);
  },
  async openExternal(url: string): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.system.openExternal(url);
      return;
    }

    const { openUrl } = await loadTauriOpener();
    await openUrl(url);
  },
  async relaunch(): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.system.relaunch();
      return;
    }

    const { relaunch } = await loadTauriProcess();
    await relaunch();
  },
};

export const desktopClipboard = {
  async readImage(): Promise<FlowSelectClipboardImage | null> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.clipboard.readImage();
    }

    const { readImage } = await loadTauriClipboard();
    const clipboardImage = await readImage();
    if (!clipboardImage) {
      return null;
    }

    const [{ width, height }, rgba] = await Promise.all([
      clipboardImage.size(),
      clipboardImage.rgba(),
    ]);

    return {
      width,
      height,
      rgba: Array.from(rgba),
    };
  },
};

export const desktopUpdater = {
  async check(): Promise<AppUpdateInfo | null> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.updater.check();
    }

    const { check } = await loadTauriUpdater();
    const nextUpdate = await check();
    if (!nextUpdate) {
      await closePendingTauriUpdate(null);
      return null;
    }

    const typedUpdate = nextUpdate as TauriUpdateHandle;
    await closePendingTauriUpdate(typedUpdate);
    return buildAppUpdateInfo(typedUpdate);
  },
  async downloadAndInstall(): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.updater.downloadAndInstall();
      return;
    }

    if (!tauriPendingUpdate) {
      throw new Error("No pending app update is available");
    }

    try {
      await tauriPendingUpdate.downloadAndInstall();
    } finally {
      await closePendingTauriUpdate(null);
    }
  },
};

export const desktopWindows = {
  async has(label: FlowSelectWindowLabel): Promise<boolean> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      return electronBridge.windows.has(label);
    }

    const { WebviewWindow } = await loadTauriWebviewWindow();
    return Boolean(await WebviewWindow.getByLabel(label));
  },
  async focus(label: FlowSelectWindowLabel): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.windows.focus(label);
      return;
    }

    const { WebviewWindow } = await loadTauriWebviewWindow();
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
    }
  },
  async close(label: "settings" | "context-menu"): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.windows.close(label);
      return;
    }

    const { WebviewWindow } = await loadTauriWebviewWindow();
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.close();
    }
  },
  async openSettings(options: FlowSelectSecondaryWindowOptions): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.windows.openSettings(options);
      return;
    }

    const { WebviewWindow } = await loadTauriWebviewWindow();
    new WebviewWindow("settings", {
      url: "/settings",
      title: options.title,
      width: options.width,
      height: options.height,
      x: options.x,
      y: options.y,
      center: options.center,
      decorations: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: options.alwaysOnTop ?? true,
      focus: options.focus,
      shadow: false,
      skipTaskbar: options.skipTaskbar ?? false,
    });
  },
  async openContextMenu(options: FlowSelectContextMenuWindowOptions): Promise<void> {
    const electronBridge = resolveElectronBridge();
    if (electronBridge) {
      await electronBridge.windows.openContextMenu(options);
      return;
    }

    const { WebviewWindow } = await loadTauriWebviewWindow();
    new WebviewWindow("context-menu", {
      url: "/context-menu",
      title: options.title,
      width: options.width,
      height: options.height,
      x: options.x,
      y: options.y,
      center: options.center,
      decorations: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: options.alwaysOnTop ?? true,
      focus: options.focus ?? true,
      shadow: false,
      skipTaskbar: options.skipTaskbar ?? true,
      parent: options.parent,
    });
  },
};
