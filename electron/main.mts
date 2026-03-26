import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BRIDGE_CHANNEL = "flowselect:bridge";
const EVENT_CHANNEL_PREFIX = "flowselect:event:";
const WINDOW_FOCUS_CHANNEL = "flowselect:window:focus-changed";
const WINDOW_BLUR_CHANNEL = "flowselect:window:blur";

const DEFAULT_OUTPUT_FOLDER_NAME = "FlowSelect_Received";
const SETTINGS_FILE_NAME = "settings.json";
const LEGACY_CONFIG_DIR_NAME = "com.flowselect.app";
const PREVIEW_MARKER = "electron-preview";

type WindowLabel = "main" | "settings" | "context-menu";
type AppLanguage = "en" | "zh-CN";

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

type Display = {
  position: Point;
  size: Size;
  scaleFactor: number;
};

type DialogOpenOptions = {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
};

type SecondaryWindowOptions = {
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

type ContextMenuWindowOptions = SecondaryWindowOptions & {
  parent: "main";
};

type RuntimeDependencyStatusEntry = {
  state: "ready" | "missing";
  source: "bundled" | "managed" | "system_path" | null;
  path: string | null;
  error: string | null;
};

type RuntimeDependencyStatusSnapshot = {
  ytDlp: RuntimeDependencyStatusEntry;
  ffmpeg: RuntimeDependencyStatusEntry;
  deno: RuntimeDependencyStatusEntry;
  pinterestDownloader: RuntimeDependencyStatusEntry;
};

type RuntimeDependencyGateState = {
  phase: "idle" | "checking" | "awaiting_confirmation" | "downloading" | "ready" | "blocked_by_user" | "failed";
  missingComponents: string[];
  lastError: string | null;
  updatedAtMs: number;
  currentComponent: "ffmpeg" | "deno" | "pinterest-dl" | null;
  currentStage: "checking" | "downloading" | "verifying" | "installing" | null;
  progressPercent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  nextComponent: "ffmpeg" | "deno" | "pinterest-dl" | null;
};

type YtdlpVersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
};

type PinterestDownloaderInfo = {
  current: string;
  packageName: string;
  flowselectSidecarVersion: string;
  updateChannel: "managed_runtime";
};

type BridgeRequest = {
  method: string;
  command?: string;
  event?: string;
  label?: WindowLabel;
  payload?: unknown;
  options?: unknown;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.mjs");
const rendererBuildDir = path.resolve(
  repositoryRoot,
  process.env.FLOWSELECT_ELECTRON_BUILD_DIR || "dist",
);
const rendererDevServerUrl = process.env.FLOWSELECT_ELECTRON_DEV_SERVER_URL?.trim() || null;

const windows = new Map<WindowLabel, BrowserWindow>();
let registeredShortcut = "";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const getString = (value: unknown): string | null => (
  typeof value === "string" ? value : null
);

const getBoolean = (value: unknown): boolean | null => (
  typeof value === "boolean" ? value : null
);

const toEventEnvelope = <TPayload,>(payload: TPayload) => ({ payload });

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
};

const normalizeAppLanguage = (value: unknown): AppLanguage | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-")) {
    return "zh-CN";
  }

  return null;
};

const parseConfigObject = (configRaw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(configRaw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getConfigDir = () => app.getPath("userData");

const getConfigPath = async (): Promise<string> => {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, SETTINGS_FILE_NAME);

  if (!(await pathExists(configPath))) {
    const legacyConfigPath = path.join(
      app.getPath("appData"),
      LEGACY_CONFIG_DIR_NAME,
      SETTINGS_FILE_NAME,
    );
    if (await pathExists(legacyConfigPath)) {
      await fs.mkdir(configDir, { recursive: true });
      await fs.copyFile(legacyConfigPath, configPath);
    }
  }

  await fs.mkdir(configDir, { recursive: true });
  return configPath;
};

const resolveLanguageFromConfigString = (configRaw: string): AppLanguage | null => {
  const config = parseConfigObject(configRaw);
  return normalizeAppLanguage(config.language);
};

const resolveDevModeFromConfigString = (configRaw: string): boolean | null => {
  const config = parseConfigObject(configRaw);
  return typeof config.devMode === "boolean" ? config.devMode : null;
};

const readConfigString = async (): Promise<string> => {
  const configPath = await getConfigPath();
  if (!(await pathExists(configPath))) {
    return "{}";
  }

  return fs.readFile(configPath, "utf8");
};

const broadcastEvent = <TPayload,>(eventName: string, payload: TPayload) => {
  for (const [label, window] of windows.entries()) {
    if (window.isDestroyed()) {
      windows.delete(label);
      continue;
    }

    window.webContents.send(
      `${EVENT_CHANNEL_PREFIX}${eventName}`,
      toEventEnvelope(payload),
    );
  }
};

const writeConfigString = async (json: string): Promise<void> => {
  const previousConfig = await readConfigString().catch(() => "{}");
  const previousLanguage = resolveLanguageFromConfigString(previousConfig);
  const previousDevMode = resolveDevModeFromConfigString(previousConfig);
  const configPath = await getConfigPath();
  await fs.writeFile(configPath, json, "utf8");

  const nextLanguage = resolveLanguageFromConfigString(json);
  if (nextLanguage && nextLanguage !== previousLanguage) {
    broadcastEvent("language-changed", { language: nextLanguage });
  }

  const nextDevMode = resolveDevModeFromConfigString(json);
  if (nextDevMode !== null && nextDevMode !== previousDevMode) {
    broadcastEvent("devmode-changed", { enabled: nextDevMode });
  }
};

const buildRuntimeDependencyEntry = (): RuntimeDependencyStatusEntry => ({
  state: "ready",
  source: "managed",
  path: PREVIEW_MARKER,
  error: null,
});

const buildRuntimeDependencyStatus = (): RuntimeDependencyStatusSnapshot => ({
  ytDlp: buildRuntimeDependencyEntry(),
  ffmpeg: buildRuntimeDependencyEntry(),
  deno: buildRuntimeDependencyEntry(),
  pinterestDownloader: buildRuntimeDependencyEntry(),
});

const buildRuntimeDependencyGateState = (): RuntimeDependencyGateState => ({
  phase: "ready",
  missingComponents: [],
  lastError: null,
  updatedAtMs: Date.now(),
  currentComponent: null,
  currentStage: null,
  progressPercent: null,
  downloadedBytes: null,
  totalBytes: null,
  nextComponent: null,
});

const buildYtdlpVersionInfo = (): YtdlpVersionInfo => ({
  current: PREVIEW_MARKER,
  latest: null,
  updateAvailable: null,
  latestError: "Unavailable in Electron shell preview",
});

const buildPinterestDownloaderInfo = (): PinterestDownloaderInfo => ({
  current: PREVIEW_MARKER,
  packageName: "pinterest-dl",
  flowselectSidecarVersion: PREVIEW_MARKER,
  updateChannel: "managed_runtime",
});

const resolveCurrentOutputFolderPath = async (): Promise<string> => {
  const config = parseConfigObject(await readConfigString());
  const configuredOutputPath = getString(config.outputPath);
  if (configuredOutputPath && configuredOutputPath.trim()) {
    return configuredOutputPath;
  }

  return path.join(app.getPath("desktop"), DEFAULT_OUTPUT_FOLDER_NAME);
};

const persistOutputPath = async (nextOutputPath: string): Promise<boolean> => {
  const config = parseConfigObject(await readConfigString());
  const previousOutputPath = getString(config.outputPath) ?? "";
  if (previousOutputPath === nextOutputPath) {
    return false;
  }

  config.outputPath = nextOutputPath;
  await writeConfigString(JSON.stringify(config));
  broadcastEvent("output-path-changed", { path: nextOutputPath });
  return true;
};

const openFolder = async (targetPath: string): Promise<void> => {
  const result = await shell.openPath(targetPath);
  if (result) {
    throw new Error(result);
  }
};

const exportSupportLog = async (): Promise<string> => {
  const configDir = getConfigDir();
  const logsDir = path.join(configDir, "logs");
  await fs.mkdir(logsDir, { recursive: true });

  const logPath = path.join(logsDir, `support-${Date.now()}.log`);
  const configPath = await getConfigPath();
  const logLines = [
    "FlowSelect Electron Shell Preview",
    `generatedAt=${new Date().toISOString()}`,
    `appVersion=${app.getVersion()}`,
    `platform=${process.platform}`,
    `userData=${configDir}`,
    `configPath=${configPath}`,
  ];
  await fs.writeFile(logPath, logLines.join("\n"), "utf8");
  return logPath;
};

const getWindowByLabel = (label: WindowLabel): BrowserWindow | null => {
  const existing = windows.get(label);
  if (!existing) {
    return null;
  }
  if (existing.isDestroyed()) {
    windows.delete(label);
    return null;
  }
  return existing;
};

const getWindowFromSender = (event: IpcMainInvokeEvent): BrowserWindow | null => (
  BrowserWindow.fromWebContents(event.sender)
);

const getDisplayForWindow = (window: BrowserWindow): Display => {
  const display = screen.getDisplayMatching(window.getBounds());
  return {
    position: {
      x: display.bounds.x,
      y: display.bounds.y,
    },
    size: {
      width: display.bounds.width,
      height: display.bounds.height,
    },
    scaleFactor: display.scaleFactor,
  };
};

const sendWindowFocusState = (window: BrowserWindow, focused: boolean) => {
  if (!window.isDestroyed()) {
    window.webContents.send(
      WINDOW_FOCUS_CHANNEL,
      toEventEnvelope(focused),
    );
  }
};

const attachWindowLifecycle = (label: WindowLabel, window: BrowserWindow) => {
  windows.set(label, window);
  window.on("focus", () => {
    sendWindowFocusState(window, true);
  });
  window.on("blur", () => {
    sendWindowFocusState(window, false);
    if (!window.isDestroyed()) {
      window.webContents.send(WINDOW_BLUR_CHANNEL);
    }
  });
  window.on("closed", () => {
    windows.delete(label);
    if (label === "context-menu") {
      broadcastEvent("context-menu-closed", undefined);
    }
  });
};

const loadRendererRoute = async (
  window: BrowserWindow,
  route: "/" | "/settings" | "/context-menu",
): Promise<void> => {
  if (rendererDevServerUrl) {
    await window.loadURL(`${rendererDevServerUrl}#${route}`);
    return;
  }

  const entryUrl = pathToFileURL(path.join(rendererBuildDir, "index.html"));
  entryUrl.hash = route;
  await window.loadURL(entryUrl.toString());
};

const createRendererWindow = async (
  label: WindowLabel,
  route: "/" | "/settings" | "/context-menu",
  options: SecondaryWindowOptions,
  parentLabel?: WindowLabel,
): Promise<BrowserWindow> => {
  const existing = getWindowByLabel(label);
  if (existing) {
    if (options.focus !== false) {
      existing.focus();
    }
    return existing;
  }

  const parent = parentLabel ? getWindowByLabel(parentLabel) ?? undefined : undefined;
  const window = new BrowserWindow({
    width: Math.round(options.width),
    height: Math.round(options.height),
    x: options.x != null ? Math.round(options.x) : undefined,
    y: options.y != null ? Math.round(options.y) : undefined,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    alwaysOnTop: options.alwaysOnTop ?? true,
    skipTaskbar: options.skipTaskbar ?? false,
    title: options.title,
    backgroundColor: "#00000000",
    parent,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  window.setMenuBarVisibility(false);
  attachWindowLifecycle(label, window);

  if (options.center) {
    window.center();
  }

  window.once("ready-to-show", () => {
    window.show();
    if (options.focus !== false) {
      window.focus();
    }
  });

  await loadRendererRoute(window, route);
  return window;
};

const createMainWindow = async (): Promise<BrowserWindow> => (
  createRendererWindow("main", "/", {
    title: "FlowSelect",
    width: 200,
    height: 200,
    alwaysOnTop: true,
    focus: true,
    skipTaskbar: false,
  })
);

const closeContextMenuWindow = () => {
  const contextMenuWindow = getWindowByLabel("context-menu");
  if (contextMenuWindow) {
    contextMenuWindow.close();
  }
};

const toggleMainWindowFromShortcut = async () => {
  const mainWindow = await createMainWindow();
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
  broadcastEvent("shortcut-show", undefined);
};

const unregisterCurrentShortcut = () => {
  if (!registeredShortcut) {
    return;
  }

  globalShortcut.unregister(registeredShortcut);
  registeredShortcut = "";
};

const registerShortcut = (shortcut: string) => {
  unregisterCurrentShortcut();
  if (!shortcut) {
    return;
  }

  const success = globalShortcut.register(shortcut, () => {
    void toggleMainWindowFromShortcut().catch((error) => {
      console.error("Failed to handle FlowSelect shortcut:", error);
    });
  });

  if (!success) {
    throw new Error(`Failed to register shortcut: ${shortcut}`);
  }

  registeredShortcut = shortcut;
};

const restoreConfiguredShortcut = async () => {
  const config = parseConfigObject(await readConfigString());
  const shortcut = getString(config.shortcut);
  if (!shortcut) {
    return;
  }

  try {
    registerShortcut(shortcut);
  } catch (error) {
    console.error("Failed to restore FlowSelect shortcut:", error);
  }
};

const getAutostartEnabled = (): boolean => {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
};

const setAutostartEnabled = (enabled: boolean) => {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch (error) {
    console.error("Failed to update login item settings:", error);
  }
};

const openDialogForWindow = async (
  parentWindow: BrowserWindow | null,
  options: DialogOpenOptions,
): Promise<string | string[] | null> => {
  const properties: Array<"openDirectory" | "openFile" | "multiSelections"> = [
    options.directory ? "openDirectory" : "openFile",
    ...(options.multiple ? ["multiSelections"] as const : []),
  ];
  const dialogOptions = {
    title: options.title,
    filters: options.filters,
    properties,
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled) {
    return null;
  }
  if (options.multiple) {
    return result.filePaths;
  }

  return result.filePaths[0] ?? null;
};

const readClipboardImage = () => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }

  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const rgba: number[] = [];

  // Electron nativeImage bitmaps are BGRA; normalize to RGBA for the renderer.
  for (let index = 0; index < bitmap.length; index += 4) {
    rgba.push(
      bitmap[index + 2],
      bitmap[index + 1],
      bitmap[index],
      bitmap[index + 3],
    );
  }

  return {
    width,
    height,
    rgba,
  };
};

const openSettingsWindow = async (options: SecondaryWindowOptions) => {
  await createRendererWindow("settings", "/settings", options);
};

const openContextMenuWindow = async (options: ContextMenuWindowOptions) => {
  await createRendererWindow("context-menu", "/context-menu", options, options.parent);
};

const pickOutputFolderFromContextMenu = async (): Promise<void> => {
  closeContextMenuWindow();

  const mainWindow = getWindowByLabel("main");
  const restoreAlwaysOnTop = mainWindow?.isAlwaysOnTop() ?? false;

  if (mainWindow) {
    if (restoreAlwaysOnTop) {
      mainWindow.setAlwaysOnTop(false);
    }
    mainWindow.focus();
  }

  try {
    const selectedPath = await openDialogForWindow(mainWindow, {
      directory: true,
      multiple: false,
    });

    if (typeof selectedPath === "string" && selectedPath) {
      await persistOutputPath(selectedPath);
    }
  } finally {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (restoreAlwaysOnTop) {
        mainWindow.setAlwaysOnTop(true);
      }
      mainWindow.focus();
    }
  }
};

const invokePreviewCommand = async (command: string): Promise<unknown> => {
  switch (command) {
    case "cancel_download":
    case "cancel_transcode":
    case "remove_transcode":
    case "retry_transcode":
      return false;
    case "queue_video_download":
      return {
        accepted: false,
        traceId: PREVIEW_MARKER,
      };
    case "get_clipboard_files":
      return [];
    case "reset_rename_counter":
      return true;
    case "get_runtime_dependency_status":
      return buildRuntimeDependencyStatus();
    case "get_runtime_dependency_gate_state":
    case "refresh_runtime_dependency_gate_state":
    case "start_runtime_dependency_bootstrap":
      return buildRuntimeDependencyGateState();
    case "check_ytdlp_version":
      return buildYtdlpVersionInfo();
    case "get_pinterest_downloader_info":
      return buildPinterestDownloaderInfo();
    case "broadcast_theme":
      return undefined;
    case "update_ytdlp":
    case "download_image":
    case "process_files":
    case "save_data_url":
      throw new Error(`${command} is not implemented in the Electron shell preview`);
    default:
      throw new Error(`Unsupported FlowSelect bridge command: ${command}`);
  }
};

const handleCommandInvocation = async (
  event: IpcMainInvokeEvent,
  command: string,
  payload: unknown,
): Promise<unknown> => {
  const senderWindow = getWindowFromSender(event);
  const payloadRecord = isRecord(payload) ? payload : {};

  switch (command) {
    case "get_config":
      return readConfigString();
    case "save_config": {
      const json = getString(payloadRecord.json) ?? "{}";
      await writeConfigString(json);
      return undefined;
    }
    case "open_current_output_folder":
      await openFolder(await resolveCurrentOutputFolderPath());
      return undefined;
    case "open_folder": {
      const folderPath = getString(payloadRecord.path);
      if (!folderPath) {
        throw new Error("open_folder requires a path");
      }
      await openFolder(folderPath);
      return undefined;
    }
    case "begin_open_output_folder_from_context_menu":
      closeContextMenuWindow();
      await openFolder(await resolveCurrentOutputFolderPath());
      return undefined;
    case "begin_pick_output_folder_from_context_menu": {
      await pickOutputFolderFromContextMenu();
      return undefined;
    }
    case "get_autostart":
      return getAutostartEnabled();
    case "set_autostart": {
      const enabled = getBoolean(payloadRecord.enabled);
      if (enabled == null) {
        throw new Error("set_autostart requires an enabled boolean");
      }
      setAutostartEnabled(enabled);
      return undefined;
    }
    case "get_current_shortcut": {
      const config = parseConfigObject(await readConfigString());
      return getString(config.shortcut) ?? "";
    }
    case "register_shortcut": {
      const shortcut = getString(payloadRecord.shortcut) ?? "";
      registerShortcut(shortcut);
      return undefined;
    }
    case "set_window_size": {
      const width = Number(payloadRecord.width);
      const height = Number(payloadRecord.height);
      const targetWindow = senderWindow ?? getWindowByLabel("main");
      if (!targetWindow || Number.isNaN(width) || Number.isNaN(height)) {
        throw new Error("set_window_size requires a sender window and numeric width/height");
      }
      targetWindow.setSize(Math.round(width), Math.round(height));
      return undefined;
    }
    case "set_window_position": {
      const x = Number(payloadRecord.x);
      const y = Number(payloadRecord.y);
      const targetWindow = senderWindow ?? getWindowByLabel("main");
      if (!targetWindow || Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error("set_window_position requires a sender window and numeric x/y");
      }
      targetWindow.setPosition(Math.round(x), Math.round(y));
      return undefined;
    }
    case "export_support_log":
      return exportSupportLog();
    default:
      return invokePreviewCommand(command);
  }
};

ipcMain.handle(BRIDGE_CHANNEL, async (event, request: BridgeRequest) => {
  switch (request.method) {
    case "command.invoke":
      return handleCommandInvocation(event, request.command ?? "", request.payload);
    case "event.emit":
      broadcastEvent(request.event ?? "", request.payload);
      return undefined;
    case "window.has":
      return Boolean(request.label && getWindowByLabel(request.label));
    case "window.focus": {
      const targetWindow = request.label ? getWindowByLabel(request.label) : null;
      targetWindow?.focus();
      return undefined;
    }
    case "window.close": {
      const targetWindow = request.label ? getWindowByLabel(request.label) : null;
      targetWindow?.close();
      return undefined;
    }
    case "window.openSettings":
      await openSettingsWindow(request.options as SecondaryWindowOptions);
      return undefined;
    case "window.openContextMenu":
      await openContextMenuWindow(request.options as ContextMenuWindowOptions);
      return undefined;
    case "currentWindow.outerPosition": {
      const currentWindow = getWindowFromSender(event);
      if (!currentWindow) {
        return { x: 0, y: 0 };
      }
      const [x, y] = currentWindow.getPosition();
      return { x, y };
    }
    case "currentWindow.outerSize": {
      const currentWindow = getWindowFromSender(event);
      if (!currentWindow) {
        return { width: 0, height: 0 };
      }
      const [width, height] = currentWindow.getSize();
      return { width, height };
    }
    case "currentWindow.scaleFactor": {
      const currentWindow = getWindowFromSender(event);
      if (!currentWindow) {
        return 1;
      }
      return getDisplayForWindow(currentWindow).scaleFactor;
    }
    case "currentWindow.startDragging":
      return undefined;
    case "currentWindow.close": {
      const currentWindow = getWindowFromSender(event);
      currentWindow?.close();
      return undefined;
    }
    case "currentWindow.hide": {
      const currentWindow = getWindowFromSender(event);
      currentWindow?.hide();
      return undefined;
    }
    case "system.currentMonitor": {
      const currentWindow = getWindowFromSender(event);
      if (!currentWindow) {
        return null;
      }
      return getDisplayForWindow(currentWindow);
    }
    case "system.openDialog":
      return openDialogForWindow(
        getWindowFromSender(event),
        request.options as DialogOpenOptions,
      );
    case "system.openExternal": {
      const payloadRecord = isRecord(request.payload) ? request.payload : {};
      const url = getString(payloadRecord.url);
      if (!url) {
        throw new Error("system.openExternal requires a URL");
      }
      await shell.openExternal(url);
      return undefined;
    }
    case "system.relaunch":
      app.relaunch();
      app.exit(0);
      return undefined;
    case "clipboard.readImage":
      return readClipboardImage();
    case "updater.check":
      return null;
    case "updater.downloadAndInstall":
      throw new Error("App updater is not implemented in the Electron shell preview");
    default:
      throw new Error(`Unsupported FlowSelect bridge method: ${request.method}`);
  }
});

app.whenReady().then(async () => {
  await createMainWindow();
  await restoreConfiguredShortcut();

  app.on("activate", () => {
    void createMainWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
