// @ts-nocheck
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import { once } from "node:events";
import { createWriteStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  appendFile,
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";
import {
  buildWindowsAutostartSettings,
  getWindowsAutostartQuery,
  isWindowsAutostartEnabled,
} from "./autostart.mjs";
import {
  normalizeAppLanguage,
  resolveStartupLanguageFromConfig,
} from "./startupLanguage.mjs";
import {
  normalizeVideoCandidateUrls,
  normalizeRequiredVideoRouteUrl,
  normalizeVideoPageUrl,
  normalizeVideoHintUrl,
} from "./videoHintNormalization.mjs";
import {
  VALIDATE_DROPPED_FOLDER_PATH_CHANNEL,
  validateDroppedFolderPath,
} from "./folderDrop.mjs";
import {
  getPackagedWindowRevealDelayMs,
  resolveMainWindowRevealBounds,
  resolvePackagedWindowsOpaqueWindowBackground,
  resolvePackagedWindowsTransparentWindowBackground,
  shouldEnablePackagedStartupDiagnostics,
  shouldUsePackagedWindowsOpaqueWindow,
} from "./windowVisibility.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const WINDOW_LABELS = {
  main: "main",
  settings: "settings",
  contextMenu: "context-menu",
  uiLab: "ui-lab",
};

const FALLBACK_LANGUAGE = "en";
const FALLBACK_THEME = "black";
const WS_PORT = 39527;
const APP_RELEASES_URL = "https://github.com/Wutpeach/FlowSelect/releases";
const APP_UPDATE_ENDPOINT =
  "https://github.com/Wutpeach/FlowSelect/releases/latest/download/latest.json";
const DEFAULT_OUTPUT_FOLDER_NAME = "FlowSelect_Received";
const STARTUP_DIAGNOSTICS_FILE_NAME = "startup-diagnostics-latest.txt";
const SHORTCUT_SHOW_EVENT = "shortcut-show";
const CONTEXT_MENU_CLOSED_EVENT = "context-menu-closed";
const LANGUAGE_CHANGED_EVENT = "language-changed";
const UI_LAB_RESET_EVENT = "ui-lab-reset";
const YTDLP_LATEST_CACHE_FILE_NAME = "ytdlp-latest.json";
const YTDLP_LATEST_RELEASE_API =
  "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const YTDLP_LATEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const YTDLP_WINDOWS_DOWNLOAD_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const YTDLP_MACOS_DOWNLOAD_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
const LOG_DIR_NAME = "logs";
const VIDEO_QUEUE_MAX_CONCURRENT = 3;
const SETTINGS_WINDOW_WIDTH = 320;
const SETTINGS_WINDOW_HEIGHT = 400;
const UI_LAB_WINDOW_WIDTH = 420;
const UI_LAB_WINDOW_HEIGHT = 560;
const PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS = 15_000;
const YTDLP_PROGRESS_PREFIX = "__FLOWSELECT_PROGRESS__=";
const YTDLP_FILE_PATH_PREFIX = "__FLOWSELECT_FILE_PATH__=";
const YTDLP_FORMAT_SELECTOR_BEST = "bestvideo+bestaudio/best";
const YTDLP_FORMAT_SELECTOR_BALANCED = [
  "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height=1080][vcodec^=avc1][ext=mp4]/",
  "b[height=1080][ext=mp4]/",
  "best[height=1080][ext=mp4]/",
  "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height<=1080][vcodec^=avc1][ext=mp4]/",
  "b[height<=1080][ext=mp4]/",
  "best[height<=1080][ext=mp4]/",
  "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[ext=mp4]+ba[ext=m4a]/",
  "b[vcodec^=avc1][ext=mp4]/",
  "b[ext=mp4]/",
  "best[ext=mp4]/",
  "best",
].join("");
const YTDLP_FORMAT_SELECTOR_DATA_SAVER = [
  "bv*[height=360][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=360][ext=mp4]+ba[ext=m4a]/",
  "b[height=360][vcodec^=avc1][ext=mp4]/",
  "b[height=360][ext=mp4]/",
  "best[height=360][ext=mp4]/",
  "bv*[height<360][ext=mp4]+ba[ext=m4a]/",
  "b[height<360][ext=mp4]/",
  "best[height<360][ext=mp4]/",
  "worstvideo[ext=mp4]+ba[ext=m4a]/",
  "worst[ext=mp4]/",
  "worst",
].join("");
const PINTEREST_LOCK_PATH = join(
  repoRoot,
  "desktop-assets",
  "pinterest-sidecar",
  "lock.json",
);
const PINTEREST_RUNTIME_MANIFEST_URL =
  "https://github.com/Wutpeach/FlowSelect/releases/download/runtime-sidecars-manifest-latest/runtime-sidecars-manifest.json";
const BINARY_DIR = join(repoRoot, "desktop-assets", "binaries");
const MANAGED_RUNTIME_BOOTSTRAP_ORDER = ["ffmpeg", "pinterest-dl", "deno"];
const RUNTIME_MANIFEST_FETCH_TIMEOUT_MS = 30_000;
const RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS = 30_000;
const INITIAL_WINDOW_REVEAL_TIMEOUT_MS = 4_000;
const RENDERER_READY_TIMEOUT_MS = 2_500;
const WINDOW_STARTUP_CAPTURE_DELAY_MS = 180;
const STARTUP_DIAGNOSTIC_SETTINGS_OPEN_DELAY_MS = 1_500;
const MAIN_WINDOW_FULL_SIZE = 200;
const MAIN_WINDOW_COMPACT_STARTUP_SIZE = 80;

let tray = null;
let registeredShortcut = "";
let pendingAppUpdate = null;
let nextOpaqueSequence = 1;
let isVideoQueuePumpScheduled = false;
let hasShownMainWindowOnce = false;
let mainWindowUsesTransparentShell = false;

const windows = new Map();
const wsClients = new Set();
const pendingVideoDownloads = [];
const activeVideoDownloads = new Map();
const pendingProtectedImageRequests = new Map();

const runtimeDependencyGateState = {
  phase: "idle",
  missingComponents: [],
  lastError: null,
  updatedAtMs: Date.now(),
  currentComponent: null,
  currentStage: null,
  progressPercent: null,
  downloadedBytes: null,
  totalBytes: null,
  nextComponent: null,
};
let runtimeDependencyBootstrapPromise = null;
let wsServer = null;
let uiLabRuntimeStatusOverride = null;
let uiLabRuntimeGateOverride = null;
let uiLabScenarioActive = false;
let startupDiagnosticsWriteChain = Promise.resolve();
const pendingRendererReadySignals = new Map();
const activeWindowBoundsAnimations = new Map();

const startupDiagnosticsEnabled = shouldEnablePackagedStartupDiagnostics({
  platform: process.platform,
  isPackaged: app.isPackaged,
  argv: process.argv,
  env: process.env,
});
const forceOpaquePackagedWindow = shouldUsePackagedWindowsOpaqueWindow({
  platform: process.platform,
  isPackaged: app.isPackaged,
  argv: process.argv,
  env: process.env,
});

function logInfo(scope, message, details) {
  if (details) {
    console.log(`>>> [${scope}] ${message}: ${details}`);
    return;
  }
  console.log(`>>> [${scope}] ${message}`);
}

function getStartupDiagnosticsPath() {
  return join(getLogsDir(), STARTUP_DIAGNOSTICS_FILE_NAME);
}

function getStartupCapturePath(label, phase) {
  return join(getLogsDir(), `startup-capture-${label}-${phase}.png`);
}

function serializeDiagnosticPayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function queueStartupDiagnostic(scope, message, payload) {
  if (!startupDiagnosticsEnabled) {
    return Promise.resolve();
  }

  const serializedPayload = payload == null ? "" : serializeDiagnosticPayload(payload);
  const line = `[${new Date().toISOString()}] [${scope}] ${message}${serializedPayload ? ` ${serializedPayload}` : ""}`;
  logInfo(scope, message, serializedPayload || undefined);
  startupDiagnosticsWriteChain = startupDiagnosticsWriteChain
    .catch(() => undefined)
    .then(async () => {
      try {
        await appendFile(getStartupDiagnosticsPath(), `${line}\n`, "utf8");
      } catch (error) {
        console.error(">>> [StartupDiag] Failed to append diagnostic:", error);
      }
    });
  return startupDiagnosticsWriteChain;
}

function getWindowSnapshot(win) {
  return {
    title: win.getTitle(),
    bounds: win.getBounds(),
    visible: win.isVisible(),
    minimized: win.isMinimized(),
    focused: win.isFocused(),
    alwaysOnTop: win.isAlwaysOnTop(),
    destroyed: win.isDestroyed(),
    url: win.webContents.getURL(),
  };
}

function summarizeCapturedImage(image) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const pixelCount = width * height;
  let nonTransparentPixelCount = 0;
  let opaquePixelCount = 0;
  let alphaTotal = 0;

  for (let index = 3; index < bitmap.length; index += 4) {
    const alpha = bitmap[index];
    alphaTotal += alpha;
    if (alpha > 0) {
      nonTransparentPixelCount += 1;
    }
    if (alpha === 255) {
      opaquePixelCount += 1;
    }
  }

  return {
    width,
    height,
    pixelCount,
    nonTransparentPixelCount,
    nonTransparentRatio: pixelCount === 0
      ? 0
      : Number((nonTransparentPixelCount / pixelCount).toFixed(4)),
    opaquePixelCount,
    averageAlpha: pixelCount === 0
      ? 0
      : Number((alphaTotal / pixelCount).toFixed(2)),
  };
}

async function captureWindowStartupSurface(win, label, phase) {
  if (!startupDiagnosticsEnabled || win.isDestroyed()) {
    return;
  }

  try {
    const image = await win.webContents.capturePage();
    const capturePath = getStartupCapturePath(label, phase);
    await writeFile(capturePath, image.toPNG());
    await queueStartupDiagnostic("WindowDiag", `${label}:capture-${phase}`, {
      path: capturePath,
      summary: summarizeCapturedImage(image),
    });
  } catch (error) {
    await queueStartupDiagnostic("WindowDiag", `${label}:capture-${phase}-failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function collectRendererStartupSnapshot(win, label, phase) {
  if (!startupDiagnosticsEnabled || win.isDestroyed()) {
    return;
  }

  try {
    const snapshot = await win.webContents.executeJavaScript(
      `(() => {
        const root = document.getElementById("root");
        const body = document.body;
        const doc = document.documentElement;
        const rootStyle = root ? window.getComputedStyle(root) : null;
        const bodyStyle = body ? window.getComputedStyle(body) : null;
        const docStyle = doc ? window.getComputedStyle(doc) : null;
        const rect = root ? root.getBoundingClientRect() : null;

        return {
          href: window.location.href,
          readyState: document.readyState,
          visibilityState: document.visibilityState,
          bodyChildElementCount: body?.childElementCount ?? 0,
          rootChildElementCount: root?.childElementCount ?? 0,
          bodyHtmlLength: body?.innerHTML?.length ?? 0,
          rootHtmlLength: root?.innerHTML?.length ?? 0,
          bodyTextLength: body?.innerText?.length ?? 0,
          rootRect: rect
            ? {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              }
            : null,
          docBackground: docStyle?.background ?? null,
          bodyBackground: bodyStyle?.background ?? null,
          rootBackground: rootStyle?.background ?? null,
          bodyOpacity: bodyStyle?.opacity ?? null,
          rootOpacity: rootStyle?.opacity ?? null,
          bodyVisibility: bodyStyle?.visibility ?? null,
          rootVisibility: rootStyle?.visibility ?? null,
          activeElementTag: document.activeElement?.tagName ?? null,
        };
      })()`,
      true,
    );
    await queueStartupDiagnostic("WindowDiag", `${label}:renderer-snapshot-${phase}`, snapshot);
  } catch (error) {
    await queueStartupDiagnostic("WindowDiag", `${label}:renderer-snapshot-${phase}-failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function collectWindowStartupArtifacts(win, label, phase) {
  if (!startupDiagnosticsEnabled || win.isDestroyed()) {
    return;
  }

  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, WINDOW_STARTUP_CAPTURE_DELAY_MS);
  });
  await collectRendererStartupSnapshot(win, label, phase);
  await captureWindowStartupSurface(win, label, phase);
}

function attachWindowStartupDiagnostics(win, label) {
  if (!startupDiagnosticsEnabled) {
    return;
  }

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    void queueStartupDiagnostic("RendererConsole", `${label}:console-message`, {
      level,
      message,
      line,
      sourceId,
    });
  });
  win.webContents.once("dom-ready", () => {
    void queueStartupDiagnostic("WindowDiag", `${label}:dom-ready`, getWindowSnapshot(win));
  });
  win.once("ready-to-show", () => {
    void queueStartupDiagnostic("WindowDiag", `${label}:ready-to-show`, getWindowSnapshot(win));
  });
  win.once("show", () => {
    void queueStartupDiagnostic("WindowDiag", `${label}:show`, getWindowSnapshot(win));
  });
  win.once("hide", () => {
    void queueStartupDiagnostic("WindowDiag", `${label}:hide`, getWindowSnapshot(win));
  });
  win.webContents.once("did-finish-load", () => {
    void queueStartupDiagnostic("WindowDiag", `${label}:did-finish-load`, getWindowSnapshot(win));
  });
  win.webContents.once(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      void queueStartupDiagnostic("WindowDiag", `${label}:did-fail-load`, {
        errorCode,
        errorDescription,
        validatedURL,
      });
    },
  );
  win.webContents.on("render-process-gone", (_event, details) => {
    void queueStartupDiagnostic("WindowDiag", `${label}:render-process-gone`, details);
  });
  win.on("unresponsive", () => {
    void queueStartupDiagnostic("WindowDiag", `${label}:unresponsive`, getWindowSnapshot(win));
  });
  win.on("responsive", () => {
    void queueStartupDiagnostic("WindowDiag", `${label}:responsive`, getWindowSnapshot(win));
  });
}

function waitForInitialWindowReveal(win) {
  return new Promise((resolveReveal) => {
    let resolved = false;
    let timeoutId = null;

    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      win.removeListener("ready-to-show", finish);
      win.webContents.removeListener("did-finish-load", finish);
      win.webContents.removeListener("did-fail-load", finish);
      resolveReveal(undefined);
    };

    timeoutId = setTimeout(finish, INITIAL_WINDOW_REVEAL_TIMEOUT_MS);
    win.on("ready-to-show", finish);
    win.webContents.on("did-finish-load", finish);
    win.webContents.on("did-fail-load", finish);
  });
}

function waitForRendererReady(win, label) {
  return new Promise((resolveRendererReady) => {
    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      pendingRendererReadySignals.delete(win.webContents.id);
      void queueStartupDiagnostic("WindowDiag", `${label}:renderer-ready-timeout`, {
        timeoutMs: RENDERER_READY_TIMEOUT_MS,
      });
      resolveRendererReady(undefined);
    }, RENDERER_READY_TIMEOUT_MS);

    const finish = (payload) => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(timeoutId);
      pendingRendererReadySignals.delete(win.webContents.id);
      void queueStartupDiagnostic("WindowDiag", `${label}:renderer-ready`, payload ?? getWindowSnapshot(win));
      resolveRendererReady(undefined);
    };

    pendingRendererReadySignals.set(win.webContents.id, finish);

    if (win.isDestroyed()) {
      finish({
        reason: "window-destroyed-before-renderer-ready",
      });
      return;
    }

    win.once("closed", () => {
      finish({
        reason: "window-closed-before-renderer-ready",
      });
    });
  });
}

async function delayTransparentPackagedWindowReveal(label, transparentWindow) {
  const revealDelayMs = getPackagedWindowRevealDelayMs({
    platform: process.platform,
    isPackaged: app.isPackaged,
    transparentWindow,
  });

  if (revealDelayMs <= 0) {
    return;
  }

  void queueStartupDiagnostic("WindowDiag", `${label}:reveal-delay`, {
    delayMs: revealDelayMs,
  });
  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, revealDelayMs);
  });
}

type FlowSelectWindowAppearanceOptions = {
  allowTransparency?: boolean;
  currentTheme: string;
  preferZeroAlphaTransparentBackground?: boolean;
};

type FlowSelectBrowserWindowCreationOptions = {
  routePath: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  center?: boolean;
  title?: string;
  allowTransparency?: boolean;
  frame?: boolean;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
  parentLabel?: string;
  preferZeroAlphaTransparentBackground?: boolean;
};

function shouldForceOpaqueSecondaryWindow(label: string): boolean {
  return label === WINDOW_LABELS.settings
    && process.platform === "win32"
    && app.isPackaged;
}

function resolveWindowAppearance({
  allowTransparency = true,
  currentTheme,
  preferZeroAlphaTransparentBackground = false,
}: FlowSelectWindowAppearanceOptions) {
  const transparentWindow = allowTransparency && !forceOpaquePackagedWindow;
  const backgroundColor = transparentWindow && process.platform === "win32" && app.isPackaged
    ? resolvePackagedWindowsTransparentWindowBackground(
      currentTheme,
      preferZeroAlphaTransparentBackground,
    )
    : !transparentWindow && process.platform === "win32" && app.isPackaged
      ? resolvePackagedWindowsOpaqueWindowBackground(currentTheme)
      : "#00000000";

  return {
    transparentWindow,
    backgroundColor,
    useOpaquePackagedWindow: !transparentWindow && process.platform === "win32" && app.isPackaged,
  };
}

async function createFlowSelectBrowserWindow(label: string, {
  routePath,
  width,
  height,
  x,
  y,
  center = false,
  title,
  allowTransparency = true,
  frame = false,
  resizable = false,
  alwaysOnTop = true,
  skipTaskbar = process.platform === "win32",
  parentLabel,
  preferZeroAlphaTransparentBackground = false,
}: FlowSelectBrowserWindowCreationOptions) {
  const preloadPath = join(__dirname, "preload.mjs");
  const iconPath = getIconPath();
  const currentTheme = await readCurrentTheme();
  const {
    transparentWindow,
    backgroundColor,
    useOpaquePackagedWindow,
  } = resolveWindowAppearance({
    allowTransparency,
    currentTheme,
    preferZeroAlphaTransparentBackground,
  });

  const browserWindow = new BrowserWindow({
    width,
    height,
    x: typeof x === "number" ? Math.round(x) : undefined,
    y: typeof y === "number" ? Math.round(y) : undefined,
    center,
    title,
    transparent: transparentWindow,
    backgroundColor,
    frame,
    resizable,
    alwaysOnTop,
    icon: iconPath ?? undefined,
    skipTaskbar,
    parent: parentLabel ? getWindow(parentLabel) ?? undefined : undefined,
    roundedCorners: process.platform === "win32",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  void queueStartupDiagnostic("WindowDiag", `${label}:create-options`, {
    route: buildRendererRoute(routePath),
    useOpaquePackagedWindow,
    transparentWindow,
    options: {
      transparent: transparentWindow,
      backgroundColor,
      skipTaskbar,
      show: false,
      alwaysOnTop,
      frame,
      roundedCorners: process.platform === "win32",
    },
  });

  registerWindow(label, browserWindow);
  attachWindowStartupDiagnostics(browserWindow, label);

  return {
    browserWindow,
    transparentWindow,
  };
}

async function waitForWindowReadyToReveal(
  win: BrowserWindow,
  label: string,
  transparentWindow: boolean,
) {
  const initialRevealReady = waitForInitialWindowReveal(win);
  const rendererReady = waitForRendererReady(win, label);

  await initialRevealReady;
  await rendererReady;
  await delayTransparentPackagedWindowReveal(label, transparentWindow);
}

function applyMainWindowVisibleZOrder(win: BrowserWindow, reason: string) {
  if (win.isDestroyed()) {
    return;
  }

  if (process.platform === "win32") {
    const level = app.isPackaged && mainWindowUsesTransparentShell
      ? "screen-saver"
      : "floating";
    win.setAlwaysOnTop(true, level);
    if (app.isPackaged && mainWindowUsesTransparentShell) {
      win.moveTop();
    }
    void queueStartupDiagnostic("WindowDiag", `main:z-order-${reason}`, {
      level,
      transparentShell: mainWindowUsesTransparentShell,
      snapshot: getWindowSnapshot(win),
    });
    return;
  }

  win.setAlwaysOnTop(true);
}

function clampWindowBoundsValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(numeric);
}

function easeInOutCubic(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped < 0.5) {
    return 4 * (clamped ** 3);
  }
  return 1 - (((-2 * clamped) + 2) ** 3) / 2;
}

function stopWindowBoundsAnimation(win: BrowserWindow) {
  const activeAnimation = activeWindowBoundsAnimations.get(win.id);
  if (!activeAnimation) {
    return;
  }
  activeAnimation.stop();
  activeWindowBoundsAnimations.delete(win.id);
}

async function animateBrowserWindowBounds(
  win: BrowserWindow,
  targetBounds: { x: number; y: number; width: number; height: number },
  {
    durationMs = 280,
  }: {
    durationMs?: number;
  } = {},
) {
  if (win.isDestroyed()) {
    return;
  }

  stopWindowBoundsAnimation(win);

  const from = win.getBounds();
  const to = {
    x: clampWindowBoundsValue(targetBounds.x, from.x),
    y: clampWindowBoundsValue(targetBounds.y, from.y),
    width: Math.max(1, clampWindowBoundsValue(targetBounds.width, from.width)),
    height: Math.max(1, clampWindowBoundsValue(targetBounds.height, from.height)),
  };
  const effectiveDurationMs = Math.max(0, Number(durationMs) || 0);

  if (
    effectiveDurationMs === 0
    || (
      from.x === to.x
      && from.y === to.y
      && from.width === to.width
      && from.height === to.height
    )
  ) {
    win.setBounds(to, false);
    return;
  }

  await new Promise<void>((resolve) => {
    const startedAtMs = Date.now();
    let frameTimer: NodeJS.Timeout | null = null;
    let stopped = false;

    const finish = () => {
      if (frameTimer !== null) {
        clearTimeout(frameTimer);
        frameTimer = null;
      }
      if (activeWindowBoundsAnimations.get(win.id)?.stop === stop) {
        activeWindowBoundsAnimations.delete(win.id);
      }
      if (!win.isDestroyed()) {
        win.setBounds(to, false);
      }
      resolve();
    };

    const step = () => {
      if (stopped) {
        resolve();
        return;
      }
      if (win.isDestroyed()) {
        if (frameTimer !== null) {
          clearTimeout(frameTimer);
          frameTimer = null;
        }
        if (activeWindowBoundsAnimations.get(win.id)?.stop === stop) {
          activeWindowBoundsAnimations.delete(win.id);
        }
        resolve();
        return;
      }

      const elapsedMs = Date.now() - startedAtMs;
      const progress = Math.min(1, elapsedMs / effectiveDurationMs);
      const easedProgress = easeInOutCubic(progress);
      win.setBounds({
        x: Math.round(from.x + ((to.x - from.x) * easedProgress)),
        y: Math.round(from.y + ((to.y - from.y) * easedProgress)),
        width: Math.round(from.width + ((to.width - from.width) * easedProgress)),
        height: Math.round(from.height + ((to.height - from.height) * easedProgress)),
      }, false);

      if (progress >= 1) {
        finish();
        return;
      }

      frameTimer = setTimeout(step, 1000 / 60);
    };

    const stop = () => {
      stopped = true;
      if (frameTimer !== null) {
        clearTimeout(frameTimer);
        frameTimer = null;
      }
      resolve();
    };

    activeWindowBoundsAnimations.set(win.id, { stop });
    step();
  });
}

function getDesktopNetworkSession() {
  if (!app.isReady()) {
    return null;
  }
  return session.defaultSession ?? null;
}

// Use Chromium's network stack so main-process downloads inherit session/system proxy settings.
async function fetchWithDesktopSession(input, init = {}) {
  const activeSession = getDesktopNetworkSession();
  if (activeSession?.fetch) {
    return activeSession.fetch(input, init);
  }
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Global fetch is unavailable in Electron main process");
  }
  return globalThis.fetch(input, init);
}

async function fetchWithDesktopSessionTimeout(
  input,
  init = {},
  timeoutMs,
  timeoutMessage,
) {
  if (!timeoutMs || timeoutMs <= 0) {
    return fetchWithDesktopSession(input, init);
  }

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let timeoutId = null;
  let timedOut = false;
  let removeAbortListener = null;

  if (upstreamSignal) {
    const forwardAbort = () => {
      controller.abort(upstreamSignal.reason);
    };

    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal.addEventListener("abort", forwardAbort, { once: true });
      removeAbortListener = () => {
        upstreamSignal.removeEventListener("abort", forwardAbort);
      };
    }
  }

  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchWithDesktopSession(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    removeAbortListener?.();
  }
}

function summarizeBootstrapError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

function parseJsonObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function nowTimestampMs() {
  return Date.now();
}

function getUserDataDir() {
  return app.getPath("userData");
}

function getConfigPath() {
  return join(getUserDataDir(), "settings.json");
}

function getLogsDir() {
  return join(getUserDataDir(), LOG_DIR_NAME);
}

function getYtdlpLatestCachePath() {
  return join(getUserDataDir(), YTDLP_LATEST_CACHE_FILE_NAME);
}

async function migrateLegacyConfigIfNeeded() {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    return;
  }

  const legacyPath = join(app.getPath("appData"), "com.flowselect.app", "settings.json");
  if (!existsSync(legacyPath)) {
    return;
  }

  await mkdir(dirname(configPath), { recursive: true });
  await copyFile(legacyPath, configPath);
  logInfo("Electron", "Migrated config", `${legacyPath} -> ${configPath}`);
}

async function ensureUserDataDirs() {
  await migrateLegacyConfigIfNeeded();
  await mkdir(getUserDataDir(), { recursive: true });
  await mkdir(getLogsDir(), { recursive: true });
}

async function readConfigString() {
  await ensureUserDataDirs();
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return "{}";
  }

  const configRaw = await readFile(configPath, "utf8");
  const decision = resolveStartupLanguageFromConfig(configRaw, app.getLocale(), {
    persistResolvedLanguage: true,
  });
  if (decision.nextConfigRaw && decision.nextConfigRaw !== configRaw) {
    await writeFile(configPath, decision.nextConfigRaw, "utf8");
    return decision.nextConfigRaw;
  }

  return configRaw;
}

async function readConfigObject() {
  return parseJsonObject(await readConfigString());
}

function resolveLanguageFromConfigString(raw) {
  return resolveStartupLanguageFromConfig(raw, app.getLocale(), {
    persistResolvedLanguage: false,
  }).language;
}

async function readCurrentLanguage() {
  return resolveLanguageFromConfigString(await readConfigString());
}

async function readCurrentTheme() {
  const config = await readConfigObject();
  return config.theme === "white" || config.theme === "black"
    ? config.theme
    : FALLBACK_THEME;
}

async function saveConfigString(raw) {
  await ensureUserDataDirs();
  const previousLanguage = await readCurrentLanguage();
  await writeFile(getConfigPath(), raw, "utf8");

  const nextLanguage = normalizeAppLanguage(parseJsonObject(raw).language);
  if (nextLanguage && nextLanguage !== previousLanguage) {
    emitAppEvent(LANGUAGE_CHANGED_EVENT, { language: nextLanguage });
    broadcastWsMessage({
      action: "language_changed",
      data: {
        language: nextLanguage,
      },
    });
    updateTrayMenu().catch((error) => {
      console.error(">>> [Electron] Failed to refresh tray language:", error);
    });
  }
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nextOpaqueId(prefix) {
  const safePrefix = normalizeOptionalString(prefix) ?? "electron";
  const identifier = `${safePrefix}-${Date.now()}-${nextOpaqueSequence}`;
  nextOpaqueSequence += 1;
  return identifier;
}

function normalizeSelectionScope(value) {
  return value === "current_item" || value === "playlist" ? value : "auto";
}

function normalizeYtdlpQualityPreference(value) {
  switch (value) {
    case "best":
      return "best";
    case "balanced":
    case "high":
      return "balanced";
    case "data_saver":
    case "standard":
      return "data_saver";
    default:
      return null;
  }
}

function resolveVideoDownloadPreferencesFromConfig(config) {
  return {
    ytdlpQuality:
      normalizeYtdlpQualityPreference(
        normalizeOptionalString(config.defaultVideoDownloadQuality)
          ?? normalizeOptionalString(config.ytdlpQualityPreference),
      )
      ?? "best",
    aeFriendlyConversionEnabled: config.aeFriendlyConversionEnabled === true,
  };
}

function isRenameMediaEnabled(config) {
  if (typeof config.renameMediaOnDownload === "boolean") {
    return config.renameMediaOnDownload;
  }
  if (typeof config.videoKeepOriginalName === "boolean") {
    return !config.videoKeepOriginalName;
  }
  return false;
}

async function syncIncomingDownloadPreferences(data) {
  const incomingQuality = normalizeYtdlpQualityPreference(
    normalizeOptionalString(data?.ytdlpQualityPreference)
      ?? normalizeOptionalString(data?.defaultVideoDownloadQuality),
  );
  const incomingAeFriendly = typeof data?.aeFriendlyConversionEnabled === "boolean"
    ? data.aeFriendlyConversionEnabled
    : null;

  if (!incomingQuality && incomingAeFriendly == null) {
    return null;
  }

  const config = await readConfigObject();
  if (incomingQuality) {
    config.defaultVideoDownloadQuality = incomingQuality;
  }
  if (incomingAeFriendly != null) {
    config.aeFriendlyConversionEnabled = incomingAeFriendly;
  }
  await saveConfigString(JSON.stringify(config));

  const merged = resolveVideoDownloadPreferencesFromConfig(config);
  return {
    quality: merged.ytdlpQuality,
    aeFriendlyConversionEnabled: merged.aeFriendlyConversionEnabled,
  };
}

function buildVideoTaskLabel(task) {
  return normalizeOptionalString(task.title)
    ?? normalizeOptionalString(task.pageUrl)
    ?? normalizeOptionalString(task.url)
    ?? task.traceId;
}

function sanitizeFileNameSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\r\n\t]/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 160);
}

function ensureExtension(extension, fallback = "bin") {
  const normalized = extension.replace(/^\./, "").trim();
  return normalized || fallback;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function buildUniqueTargetPath(targetDir, preferredName, extension) {
  await mkdir(targetDir, { recursive: true });
  const safeBaseName = sanitizeFileNameSegment(preferredName) || "flowselect";
  const safeExtension = ensureExtension(extension);
  const directPath = join(targetDir, `${safeBaseName}.${safeExtension}`);
  if (!(await pathExists(directPath))) {
    return directPath;
  }

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = join(targetDir, `${safeBaseName}_${index}.${safeExtension}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Failed to resolve a unique file path for ${safeBaseName}.${safeExtension}`);
}

function inferExtensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    const extension = extname(parsed.pathname);
    return ensureExtension(extension, "png");
  } catch {
    return "png";
  }
}

function inferNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const fileName = basename(parsed.pathname);
    const stem = parse(fileName).name;
    return sanitizeFileNameSegment(stem) || "flowselect";
  } catch {
    return "flowselect";
  }
}

function inferExtensionFromMime(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/svg+xml":
      return "svg";
    case "image/png":
    default:
      return "png";
  }
}

async function resolveCurrentOutputFolderPath() {
  const config = await readConfigObject();
  if (typeof config.outputPath === "string" && config.outputPath.trim()) {
    return config.outputPath.trim();
  }
  return join(app.getPath("desktop"), DEFAULT_OUTPUT_FOLDER_NAME);
}

async function processFiles(paths, targetDir) {
  const finalTargetDir = targetDir || (await resolveCurrentOutputFolderPath());
  await mkdir(finalTargetDir, { recursive: true });

  let copiedCount = 0;
  for (const sourcePath of paths) {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) {
      continue;
    }

    let sourceStats;
    try {
      sourceStats = await stat(sourcePath);
    } catch {
      continue;
    }

    const sourceName = basename(sourcePath);
    const stem = parse(sourceName).name;
    const extension = ensureExtension(extname(sourceName), "bin");
    const destinationPath = await buildUniqueTargetPath(finalTargetDir, stem, extension);

    if (sourceStats.isDirectory()) {
      await cp(sourcePath, destinationPath.replace(/\.[^.]+$/, ""), { recursive: true });
    } else {
      await copyFile(sourcePath, destinationPath);
    }
    copiedCount += 1;
  }

  return `Copied ${copiedCount} files to ${finalTargetDir}`;
}

async function downloadImage(url, targetDir, originalFilename, protectedImageFallback = null) {
  try {
    const response = await fetchWithDesktopSession(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const finalTargetDir = targetDir || (await resolveCurrentOutputFolderPath());
    const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || "image/png";
    const extension = originalFilename
      ? ensureExtension(extname(originalFilename), inferExtensionFromMime(mimeType))
      : inferExtensionFromUrl(url) || inferExtensionFromMime(mimeType);
    const preferredName = originalFilename
      ? parse(originalFilename).name
      : inferNameFromUrl(url);
    const destinationPath = await buildUniqueTargetPath(finalTargetDir, preferredName, extension);
    await pipeline(response.body, createWriteStream(destinationPath));
    return destinationPath;
  } catch (error) {
    if (!protectedImageFallback?.token) {
      throw error;
    }

    const resolution = await requestProtectedImageResolution({
      ...protectedImageFallback,
      imageUrl: protectedImageFallback.imageUrl ?? url,
      targetDir,
    });
    if (resolution.success && resolution.filePath) {
      return resolution.filePath;
    }

    throw new Error(
      resolution.error
        ?? resolution.code
        ?? String(error),
    );
  }
}

async function saveDataUrl(dataUrl, targetDir, originalFilename, options = {}) {
  if (options.requireRenameEnabled) {
    const config = await readConfigObject();
    if (!isRenameMediaEnabled(config)) {
      throw new Error("rename_disabled");
    }
  }

  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL");
  }

  const mimeType = match[1] || "image/png";
  const payload = match[2] || "";
  const buffer = Buffer.from(payload, "base64");
  const extension = originalFilename
    ? ensureExtension(extname(originalFilename), inferExtensionFromMime(mimeType))
    : inferExtensionFromMime(mimeType);
  const preferredName = originalFilename
    ? parse(originalFilename).name
    : "flowselect";
  const finalTargetDir = targetDir || (await resolveCurrentOutputFolderPath());
  const destinationPath = await buildUniqueTargetPath(finalTargetDir, preferredName, extension);
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, buffer);
  return destinationPath;
}

function parseClipboardFileNameBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return [];
  }

  const decoded = buffer.toString("utf16le");
  return decoded
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function getClipboardFilePaths() {
  const availableFormats = clipboard.availableFormats();
  if (availableFormats.includes("FileNameW")) {
    return parseClipboardFileNameBuffer(clipboard.readBuffer("FileNameW"));
  }
  if (availableFormats.includes("FileName")) {
    return clipboard
      .readBuffer("FileName")
      .toString("utf8")
      .split("\u0000")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

async function exportSupportLog() {
  const config = await readConfigObject();
  const logFileName = `support-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  const outputPath = join(getLogsDir(), logFileName);
  const runtimeStatus = await getRuntimeDependencyStatus();
  const lines = [
    "[environment]",
    `appVersion=${app.getVersion()}`,
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `configPath=${getConfigPath()}`,
    `logDir=${getLogsDir()}`,
    "",
    "[settings]",
    JSON.stringify(config, null, 2),
    "",
    "[runtime]",
    JSON.stringify(runtimeStatus, null, 2),
    "",
  ];
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  return outputPath;
}

async function resolveBundledBinary(prefix) {
  if (!existsSync(BINARY_DIR)) {
    return null;
  }

  const entries = await readdir(BINARY_DIR);
  const match = entries.find((entry) => entry.startsWith(prefix));
  return match ? join(BINARY_DIR, match) : null;
}

function currentManagedRuntimeTarget() {
  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported managed runtime target: ${process.platform}-${process.arch}`);
}

function denoExecutableName() {
  return process.platform === "win32" ? "deno.exe" : "deno";
}

function ffmpegExecutableName() {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function ffprobeExecutableName() {
  return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
}

function pinterestDownloaderBinaryName() {
  const target = currentManagedRuntimeTarget();
  if (target === "x86_64-pc-windows-msvc") {
    return "pinterest-dl-x86_64-pc-windows-msvc.exe";
  }
  if (target === "aarch64-apple-darwin") {
    return "pinterest-dl-aarch64-apple-darwin";
  }
  if (target === "x86_64-apple-darwin") {
    return "pinterest-dl-x86_64-apple-darwin";
  }
  throw new Error(`Unsupported Pinterest runtime target: ${target}`);
}

function managedRuntimeRoot(componentId) {
  return join(getUserDataDir(), "runtimes", componentId, currentManagedRuntimeTarget());
}

function managedDenoPath() {
  const root = managedRuntimeRoot("deno");
  const realRoot = process.platform === "win32" ? join(root, "real") : root;
  return join(realRoot, denoExecutableName());
}

function managedFfmpegPaths() {
  const root = managedRuntimeRoot("ffmpeg");
  const realRoot = process.platform === "win32" ? join(root, "real") : root;
  return {
    ffmpeg: join(realRoot, ffmpegExecutableName()),
    ffprobe: join(realRoot, ffprobeExecutableName()),
  };
}

function managedPinterestDownloaderPath() {
  return join(
    managedRuntimeRoot("pinterest-dl"),
    pinterestDownloaderBinaryName(),
  );
}

function readyRuntimeEntry(entryPath, source) {
  return {
    state: "ready",
    source,
    path: entryPath,
    error: null,
  };
}

function missingRuntimeEntry(error) {
  return {
    state: "missing",
    source: null,
    path: null,
    error,
  };
}

function isUiLabEnabled() {
  return !app.isPackaged;
}

function assertUiLabEnabled() {
  if (!isUiLabEnabled()) {
    throw new Error("UI Lab is only available in development builds.");
  }
}

function cloneRuntimeStatusSnapshot(snapshot) {
  return {
    ytDlp: { ...snapshot.ytDlp },
    ffmpeg: { ...snapshot.ffmpeg },
    deno: { ...snapshot.deno },
    pinterestDownloader: { ...snapshot.pinterestDownloader },
  };
}

function cloneRuntimeDependencyGateState(state) {
  return {
    phase: state.phase,
    missingComponents: [...(state.missingComponents ?? [])],
    lastError: state.lastError ?? null,
    updatedAtMs: state.updatedAtMs ?? nowTimestampMs(),
    currentComponent: state.currentComponent ?? null,
    currentStage: state.currentStage ?? null,
    progressPercent: state.progressPercent ?? null,
    downloadedBytes: state.downloadedBytes ?? null,
    totalBytes: state.totalBytes ?? null,
    nextComponent: state.nextComponent ?? null,
  };
}

function clearUiLabRuntimeOverrides() {
  uiLabRuntimeStatusOverride = null;
  uiLabRuntimeGateOverride = null;
}

function setUiLabRuntimeOverrides(runtimeStatus, gateState) {
  uiLabRuntimeStatusOverride = cloneRuntimeStatusSnapshot(runtimeStatus);
  uiLabRuntimeGateOverride = cloneRuntimeDependencyGateState(gateState);
}

async function getRuntimeDependencyStatus() {
  if (uiLabRuntimeStatusOverride) {
    return cloneRuntimeStatusSnapshot(uiLabRuntimeStatusOverride);
  }

  const ytDlpPath = await resolveBundledBinary("yt-dlp");
  const ffmpegPaths = managedFfmpegPaths();
  const denoPath = managedDenoPath();
  const pinterestPath = managedPinterestDownloaderPath();

  return {
    ytDlp: ytDlpPath
      ? readyRuntimeEntry(ytDlpPath, "bundled")
      : missingRuntimeEntry(`Missing bundled yt-dlp runtime in ${BINARY_DIR}`),
    ffmpeg:
      existsSync(ffmpegPaths.ffmpeg) && existsSync(ffmpegPaths.ffprobe)
        ? readyRuntimeEntry(ffmpegPaths.ffmpeg, "managed")
        : missingRuntimeEntry(
            `Missing managed ffmpeg runtime. Expected ${JSON.stringify([ffmpegPaths.ffmpeg, ffmpegPaths.ffprobe])}`,
          ),
    deno: existsSync(denoPath)
      ? readyRuntimeEntry(denoPath, "managed")
      : missingRuntimeEntry(`Missing managed deno runtime. Expected ${JSON.stringify([denoPath])}`),
    pinterestDownloader: existsSync(pinterestPath)
      ? readyRuntimeEntry(pinterestPath, "managed")
      : missingRuntimeEntry(
          `Missing managed pinterest runtime. Expected ${JSON.stringify([pinterestPath])}`,
        ),
  };
}

function collectMissingManagedRuntimeComponents(snapshot) {
  const missingComponents = [];
  if (snapshot.ffmpeg.state !== "ready") {
    missingComponents.push("ffmpeg");
  }
  if (snapshot.pinterestDownloader.state !== "ready") {
    missingComponents.push("pinterest-dl");
  }
  if (snapshot.deno.state !== "ready") {
    missingComponents.push("deno");
  }
  return missingComponents;
}

function nextManagedRuntimeComponent(missingComponents, currentComponent = null) {
  const ordered = MANAGED_RUNTIME_BOOTSTRAP_ORDER.filter((componentId) =>
    missingComponents.includes(componentId));
  if (ordered.length === 0) {
    return null;
  }
  if (!currentComponent) {
    return ordered[0] ?? null;
  }
  const index = ordered.indexOf(currentComponent);
  return ordered[index + 1] ?? null;
}

function emitRuntimeDependencyGateState() {
  const payload = uiLabRuntimeGateOverride
    ? cloneRuntimeDependencyGateState(uiLabRuntimeGateOverride)
    : { ...runtimeDependencyGateState };
  emitAppEvent("runtime-dependency-gate-state", payload);
  return payload;
}

function applyRuntimeDependencyGateState(nextState) {
  runtimeDependencyGateState.phase = nextState.phase;
  runtimeDependencyGateState.missingComponents = [...(nextState.missingComponents ?? [])];
  runtimeDependencyGateState.lastError = nextState.lastError ?? null;
  runtimeDependencyGateState.updatedAtMs = nowTimestampMs();
  runtimeDependencyGateState.currentComponent = nextState.currentComponent ?? null;
  runtimeDependencyGateState.currentStage = nextState.currentStage ?? null;
  runtimeDependencyGateState.progressPercent = nextState.progressPercent ?? null;
  runtimeDependencyGateState.downloadedBytes = nextState.downloadedBytes ?? null;
  runtimeDependencyGateState.totalBytes = nextState.totalBytes ?? null;
  runtimeDependencyGateState.nextComponent = nextState.nextComponent ?? null;
  return emitRuntimeDependencyGateState();
}

function syncRuntimeDependencyGateStateFromSnapshot(snapshot) {
  const missingComponents = collectMissingManagedRuntimeComponents(snapshot);
  if (snapshot.ytDlp.state !== "ready") {
    return applyRuntimeDependencyGateState({
      phase: "failed",
      missingComponents,
      lastError: snapshot.ytDlp.error ?? "Missing bundled yt-dlp runtime",
      currentComponent: null,
      currentStage: null,
      progressPercent: null,
      downloadedBytes: null,
      totalBytes: null,
      nextComponent: nextManagedRuntimeComponent(missingComponents),
    });
  }

  return applyRuntimeDependencyGateState({
    phase: missingComponents.length === 0 ? "ready" : "idle",
    missingComponents,
    lastError: null,
    currentComponent: null,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: nextManagedRuntimeComponent(missingComponents),
  });
}

function updateRuntimeDependencyGateDownloadActivity(
  missingComponents,
  currentComponent,
  currentStage,
  downloadedBytes = null,
  totalBytes = null,
) {
  const expectedTotal = totalBytes && totalBytes > 0 ? totalBytes : null;
  const expectedDownloaded = downloadedBytes && downloadedBytes >= 0 ? downloadedBytes : null;
  const progressPercent = expectedTotal && expectedDownloaded != null
    ? Math.max(0, Math.min(100, (expectedDownloaded / expectedTotal) * 100))
    : currentStage === "installing" || currentStage === "verifying"
      ? 100
      : null;

  return applyRuntimeDependencyGateState({
    phase: "downloading",
    missingComponents,
    lastError: null,
    currentComponent,
    currentStage,
    progressPercent,
    downloadedBytes: expectedDownloaded,
    totalBytes: expectedTotal,
    nextComponent: nextManagedRuntimeComponent(missingComponents, currentComponent),
  });
}

async function getRuntimeDependencyGateState() {
  if (uiLabRuntimeGateOverride) {
    return cloneRuntimeDependencyGateState(uiLabRuntimeGateOverride);
  }
  if (runtimeDependencyBootstrapPromise) {
    return { ...runtimeDependencyGateState };
  }
  const snapshot = await getRuntimeDependencyStatus();
  return syncRuntimeDependencyGateStateFromSnapshot(snapshot);
}

async function refreshRuntimeDependencyGateState() {
  if (uiLabRuntimeGateOverride) {
    emitAppEvent("runtime-dependency-gate-state", cloneRuntimeDependencyGateState(uiLabRuntimeGateOverride));
    return cloneRuntimeDependencyGateState(uiLabRuntimeGateOverride);
  }
  return getRuntimeDependencyGateState();
}

function runtimeMinAppVersionSatisfied(minAppVersion) {
  const normalized = normalizeOptionalString(minAppVersion);
  if (!normalized) {
    return true;
  }
  const lowered = normalized.toLowerCase();
  if (lowered === "true" || lowered === "false") {
    return true;
  }
  return compareLooseVersions(app.getVersion(), normalized) >= 0;
}

async function sha256Hex(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

async function verifyDownloadedRuntimeAsset(tempPath, expectedSize, expectedSha256, assetLabel) {
  const fileStats = await stat(tempPath);
  if (expectedSize > 0 && fileStats.size !== expectedSize) {
    throw new Error(
      `${assetLabel} size mismatch: expected ${expectedSize}, received ${fileStats.size}`,
    );
  }
  const actualSha256 = await sha256Hex(tempPath);
  if (actualSha256.toLowerCase() !== String(expectedSha256).toLowerCase()) {
    throw new Error(
      `${assetLabel} checksum mismatch: expected ${expectedSha256}, received ${actualSha256}`,
    );
  }
}

function escapePowerShellLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function runUtilityCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise((resolveProcess, rejectProcess) => {
    child.once("error", rejectProcess);
    child.once("close", (code) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      rejectProcess(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function extractZipArchive(archivePath, destinationPath) {
  await rm(destinationPath, { recursive: true, force: true });
  await mkdir(destinationPath, { recursive: true });

  if (process.platform === "win32") {
    const command = `Expand-Archive -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(destinationPath)}' -Force`;
    await runUtilityCommand("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      command,
    ]);
    return;
  }

  if (process.platform === "darwin") {
    await runUtilityCommand("/usr/bin/ditto", ["-x", "-k", archivePath, destinationPath]);
    return;
  }

  throw new Error(`Unsupported zip extraction platform: ${process.platform}`);
}

async function findFileRecursive(rootDir, targetFileName) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isFile() && entry.name === targetFileName) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const nested = await findFileRecursive(entryPath, targetFileName);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

async function downloadRuntimeAssetWithFallbacks(
  downloadUrls,
  expectedSize,
  expectedSha256,
  tempPath,
  componentId,
  missingComponents,
) {
  let lastError = null;
  const timeoutErrorMessage =
    `request timed out after ${Math.round(RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS / 1000)}s`;
  for (const downloadUrl of downloadUrls) {
    try {
      await rm(tempPath, { force: true });
      await downloadToFile(downloadUrl, tempPath, {
        timeoutMs: RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS,
        timeoutErrorMessage,
        onProgress: ({ downloaded, total }) => {
          updateRuntimeDependencyGateDownloadActivity(
            missingComponents,
            componentId,
            "downloading",
            downloaded,
            total > 0 ? total : expectedSize,
          );
        },
      });
      await updateRuntimeDependencyGateDownloadActivity(
        missingComponents,
        componentId,
        "verifying",
        expectedSize,
        expectedSize,
      );
      await verifyDownloadedRuntimeAsset(
        tempPath,
        expectedSize,
        expectedSha256,
        `${componentId} runtime asset`,
      );
      return downloadUrl;
    } catch (error) {
      lastError = error;
      await rm(tempPath, { force: true }).catch(() => {});
    }
  }

  throw new Error(
    `Failed to download managed ${componentId} runtime: ${summarizeBootstrapError(lastError)}`,
  );
}

function selectDenoRuntimeArtifactSpec() {
  const target = currentManagedRuntimeTarget();
  if (target === "x86_64-pc-windows-msvc") {
    return {
      component: "deno",
      target,
      downloadUrls: [
        "https://dl.deno.land/release/v2.7.1/deno-x86_64-pc-windows-msvc.zip",
        "https://github.com/denoland/deno/releases/download/v2.7.1/deno-x86_64-pc-windows-msvc.zip",
      ],
      sha256: "94d71d4772436de27a0495933ca4bab7b6895992622b65baeaf4b7995dae1e69",
      size: 47277539,
    };
  }
  if (target === "aarch64-apple-darwin") {
    return {
      component: "deno",
      target,
      downloadUrls: [
        "https://dl.deno.land/release/v2.7.1/deno-aarch64-apple-darwin.zip",
        "https://github.com/denoland/deno/releases/download/v2.7.1/deno-aarch64-apple-darwin.zip",
      ],
      sha256: "bc3392a0f50be9a1ecb68596530319308639a6f69d99678a0018c47e23a10c1f",
      size: 42170253,
    };
  }
  if (target === "x86_64-apple-darwin") {
    return {
      component: "deno",
      target,
      downloadUrls: [
        "https://dl.deno.land/release/v2.7.1/deno-x86_64-apple-darwin.zip",
        "https://github.com/denoland/deno/releases/download/v2.7.1/deno-x86_64-apple-darwin.zip",
      ],
      sha256: "5478393fc9893c6f3516cee7579453a990834ceebf5ff44aaced2d0f285302d7",
      size: 45229858,
    };
  }
  throw new Error(`Unsupported managed deno runtime target: ${target}`);
}

function selectFfmpegRuntimeArtifactSpec() {
  const target = currentManagedRuntimeTarget();
  if (target === "x86_64-pc-windows-msvc") {
    return {
      component: "ffmpeg",
      target,
      downloadUrls: [
        "https://github.com/Tyrrrz/FFmpegBin/releases/download/8.0.1/ffmpeg-windows-x64.zip",
      ],
      sha256: "29f9f067e8ffad75d5c0e96ec142e665228cb12cdb05fd5cc39eeb9c68962a40",
      size: 72093901,
    };
  }
  if (target === "aarch64-apple-darwin") {
    return {
      component: "ffmpeg",
      target,
      downloadUrls: [
        "https://github.com/Tyrrrz/FFmpegBin/releases/download/8.0.1/ffmpeg-osx-arm64.zip",
      ],
      sha256: "0447ba1f4a2f2a10c05985bd1815da61b968ad42fe91d35b502bfc7abffcad0a",
      size: 69575396,
    };
  }
  if (target === "x86_64-apple-darwin") {
    return {
      component: "ffmpeg",
      target,
      downloadUrls: [
        "https://github.com/Tyrrrz/FFmpegBin/releases/download/8.0.1/ffmpeg-osx-x64.zip",
      ],
      sha256: "53c438fe89dd242c95a1cb94a80e1744a9c40798f87eccf6eba564c92e4d1851",
      size: 75898458,
    };
  }
  throw new Error(`Unsupported managed ffmpeg runtime target: ${target}`);
}

async function fetchPinterestRuntimeManifest() {
  const response = await fetchWithDesktopSessionTimeout(
    PINTEREST_RUNTIME_MANIFEST_URL,
    {
      headers: {
        "User-Agent": `FlowSelect/${app.getVersion()}`,
        Accept: "application/json",
      },
    },
    RUNTIME_MANIFEST_FETCH_TIMEOUT_MS,
    `Runtime manifest request timed out after ${Math.round(RUNTIME_MANIFEST_FETCH_TIMEOUT_MS / 1000)}s`,
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Runtime manifest request failed with HTTP ${response.status}: ${body.slice(0, 180)}`,
    );
  }
  return JSON.parse(body);
}

function selectPinterestRuntimeArtifact(manifest) {
  if (!manifest || manifest.component !== "pinterest-dl" || !Array.isArray(manifest.artifacts)) {
    throw new Error("Runtime manifest is missing a valid Pinterest sidecar payload");
  }

  const target = currentManagedRuntimeTarget();
  const artifact = manifest.artifacts.find((candidate) =>
    candidate?.component === "pinterest-dl"
    && candidate?.target === target,
  );
  if (!artifact) {
    throw new Error(`Runtime manifest does not contain a Pinterest sidecar for target ${target}`);
  }
  if (!runtimeMinAppVersionSatisfied(artifact.minAppVersion ?? artifact.min_app_version)) {
    throw new Error(
      `Runtime artifact requires app version ${(artifact.minAppVersion ?? artifact.min_app_version) || "unknown"} or newer`,
    );
  }
  if (!artifact.url || !artifact.sha256 || !artifact.size) {
    throw new Error("Runtime artifact is missing url, sha256, or size");
  }
  return artifact;
}

async function ensureManagedDenoRuntimeReady(trigger, missingComponents) {
  const targetPath = managedDenoPath();
  if (existsSync(targetPath)) {
    return targetPath;
  }

  const artifact = selectDenoRuntimeArtifactSpec();
  const tempDir = await mkdtemp(join(tmpdir(), "flowselect-deno-"));
  const archivePath = join(tempDir, "deno.zip");
  const extractDir = join(tempDir, "extract");
  const tempTargetPath = join(tempDir, basename(targetPath));

  try {
    logInfo("Electron", `Bootstrapping managed deno runtime (${trigger})`);
    await downloadRuntimeAssetWithFallbacks(
      artifact.downloadUrls,
      artifact.size,
      artifact.sha256,
      archivePath,
      "deno",
      missingComponents,
    );
    await updateRuntimeDependencyGateDownloadActivity(
      missingComponents,
      "deno",
      "installing",
      artifact.size,
      artifact.size,
    );
    await extractZipArchive(archivePath, extractDir);
    const extractedBinaryPath = await findFileRecursive(extractDir, denoExecutableName());
    if (!extractedBinaryPath) {
      throw new Error(`Failed to find ${denoExecutableName()} inside managed deno archive`);
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(extractedBinaryPath, tempTargetPath);
    if (process.platform !== "win32") {
      await chmod(tempTargetPath, 0o755);
    }
    await replaceFile(targetPath, tempTargetPath);
    return targetPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureManagedFfmpegRuntimeReady(trigger, missingComponents) {
  const paths = managedFfmpegPaths();
  if (existsSync(paths.ffmpeg) && existsSync(paths.ffprobe)) {
    return paths.ffmpeg;
  }

  const artifact = selectFfmpegRuntimeArtifactSpec();
  const tempDir = await mkdtemp(join(tmpdir(), "flowselect-ffmpeg-"));
  const archivePath = join(tempDir, "ffmpeg.zip");
  const extractDir = join(tempDir, "extract");
  const tempFfmpegPath = join(tempDir, basename(paths.ffmpeg));
  const tempFfprobePath = join(tempDir, basename(paths.ffprobe));

  try {
    logInfo("Electron", `Bootstrapping managed ffmpeg runtime (${trigger})`);
    await downloadRuntimeAssetWithFallbacks(
      artifact.downloadUrls,
      artifact.size,
      artifact.sha256,
      archivePath,
      "ffmpeg",
      missingComponents,
    );
    await updateRuntimeDependencyGateDownloadActivity(
      missingComponents,
      "ffmpeg",
      "installing",
      artifact.size,
      artifact.size,
    );
    await extractZipArchive(archivePath, extractDir);
    const extractedFfmpegPath = await findFileRecursive(extractDir, ffmpegExecutableName());
    const extractedFfprobePath = await findFileRecursive(extractDir, ffprobeExecutableName());
    if (!extractedFfmpegPath || !extractedFfprobePath) {
      throw new Error(
        `Failed to find ${ffmpegExecutableName()} and ${ffprobeExecutableName()} inside managed ffmpeg archive`,
      );
    }
    await mkdir(dirname(paths.ffmpeg), { recursive: true });
    await copyFile(extractedFfmpegPath, tempFfmpegPath);
    await copyFile(extractedFfprobePath, tempFfprobePath);
    if (process.platform !== "win32") {
      await chmod(tempFfmpegPath, 0o755);
      await chmod(tempFfprobePath, 0o755);
    }
    await replaceFile(paths.ffmpeg, tempFfmpegPath);
    await replaceFile(paths.ffprobe, tempFfprobePath);
    return paths.ffmpeg;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureManagedPinterestRuntimeReady(trigger, missingComponents) {
  const targetPath = managedPinterestDownloaderPath();
  if (existsSync(targetPath)) {
    return targetPath;
  }

  const manifest = await fetchPinterestRuntimeManifest();
  const artifact = selectPinterestRuntimeArtifact(manifest);
  const tempDir = await mkdtemp(join(tmpdir(), "flowselect-pinterest-"));
  const tempTargetPath = join(tempDir, basename(targetPath));

  try {
    logInfo("Electron", `Bootstrapping managed Pinterest runtime (${trigger})`);
    await downloadRuntimeAssetWithFallbacks(
      [artifact.url],
      artifact.size,
      artifact.sha256,
      tempTargetPath,
      "pinterest-dl",
      missingComponents,
    );
    await updateRuntimeDependencyGateDownloadActivity(
      missingComponents,
      "pinterest-dl",
      "installing",
      artifact.size,
      artifact.size,
    );
    if (process.platform !== "win32") {
      await chmod(tempTargetPath, 0o755);
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await replaceFile(targetPath, tempTargetPath);
    return targetPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureMissingManagedRuntimesReady(trigger) {
  const initialSnapshot = await getRuntimeDependencyStatus();
  const missingComponents = collectMissingManagedRuntimeComponents(initialSnapshot);
  if (missingComponents.length === 0) {
    return initialSnapshot;
  }

  if (initialSnapshot.ffmpeg.state !== "ready") {
    await ensureManagedFfmpegRuntimeReady(trigger, missingComponents);
  }

  const afterFfmpeg = await getRuntimeDependencyStatus();
  if (afterFfmpeg.pinterestDownloader.state !== "ready") {
    await ensureManagedPinterestRuntimeReady(trigger, missingComponents);
  }

  const afterPinterest = await getRuntimeDependencyStatus();
  if (afterPinterest.deno.state !== "ready") {
    await ensureManagedDenoRuntimeReady(trigger, missingComponents);
  }

  return getRuntimeDependencyStatus();
}

async function startRuntimeDependencyBootstrap(reason = "frontend_after_visible") {
  if (uiLabRuntimeGateOverride) {
    const payload = cloneRuntimeDependencyGateState(uiLabRuntimeGateOverride);
    emitAppEvent("runtime-dependency-gate-state", payload);
    return payload;
  }
  if (runtimeDependencyBootstrapPromise) {
    return { ...runtimeDependencyGateState };
  }

  const snapshot = await getRuntimeDependencyStatus();
  const missingComponents = collectMissingManagedRuntimeComponents(snapshot);
  if (snapshot.ytDlp.state !== "ready") {
    return syncRuntimeDependencyGateStateFromSnapshot(snapshot);
  }
  if (missingComponents.length === 0) {
    return syncRuntimeDependencyGateStateFromSnapshot(snapshot);
  }

  const initialPayload = updateRuntimeDependencyGateDownloadActivity(
    missingComponents,
    missingComponents[0] ?? null,
    "checking",
    null,
    null,
  );

  runtimeDependencyBootstrapPromise = (async () => {
    try {
      const finalSnapshot = await ensureMissingManagedRuntimesReady(reason);
      syncRuntimeDependencyGateStateFromSnapshot(finalSnapshot);
    } catch (error) {
      const latestSnapshot = await getRuntimeDependencyStatus().catch(() => snapshot);
      applyRuntimeDependencyGateState({
        phase: "failed",
        missingComponents: collectMissingManagedRuntimeComponents(latestSnapshot),
        lastError: summarizeBootstrapError(error),
        currentComponent: null,
        currentStage: null,
        progressPercent: null,
        downloadedBytes: null,
        totalBytes: null,
        nextComponent: nextManagedRuntimeComponent(
          collectMissingManagedRuntimeComponents(latestSnapshot),
        ),
      });
    } finally {
      runtimeDependencyBootstrapPromise = null;
    }
  })();

  return initialPayload;
}

function normalizeVersionString(value) {
  const normalized = normalizeOptionalString(value)?.replace(/^v/i, "");
  return normalized ?? null;
}

function compareLooseVersions(left, right) {
  const leftParts = String(left)
    .split(/[.\-+_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const rightParts = String(right)
    .split(/[.\-+_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const width = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < width; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}

async function readYtdlpLatestCache() {
  const cachePath = getYtdlpLatestCachePath();
  if (!(await pathExists(cachePath))) {
    return null;
  }

  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = parseJsonObject(raw);
    const version = normalizeVersionString(parsed.version);
    const fetchedAtMs = Number(parsed.fetchedAtMs);
    if (!version || !Number.isFinite(fetchedAtMs)) {
      return null;
    }
    return { version, fetchedAtMs };
  } catch {
    return null;
  }
}

async function writeYtdlpLatestCache(version) {
  const cachePath = getYtdlpLatestCachePath();
  await writeFile(
    cachePath,
    JSON.stringify({
      version,
      fetchedAtMs: nowTimestampMs(),
    }),
    "utf8",
  );
}

function buildGitHubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "FlowSelect-Electron",
  };
}

async function resolveLatestYtdlpVersion(forceRefresh = false) {
  await ensureUserDataDirs();
  const cached = await readYtdlpLatestCache();
  if (
    !forceRefresh
    && cached
    && nowTimestampMs() - cached.fetchedAtMs <= YTDLP_LATEST_CACHE_TTL_MS
  ) {
    return {
      latest: cached.version,
      latestError: null,
    };
  }

  try {
    const response = await fetchWithDesktopSession(YTDLP_LATEST_RELEASE_API, {
      headers: buildGitHubHeaders(),
    });
    if (!response.ok) {
      throw new Error(`GitHub latest lookup failed: ${response.status}`);
    }

    const payload = await response.json();
    const latest = normalizeVersionString(payload?.tag_name ?? payload?.name);
    if (!latest) {
      throw new Error("GitHub latest lookup did not return a version tag");
    }

    await writeYtdlpLatestCache(latest);
    return {
      latest,
      latestError: null,
    };
  } catch (error) {
    if (cached) {
      return {
        latest: cached.version,
        latestError: String(error),
      };
    }
    return {
      latest: null,
      latestError: String(error),
    };
  }
}

async function getLocalYtdlpVersion(binaryPath) {
  return new Promise((resolveVersion, rejectVersion) => {
    const child = spawn(binaryPath, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", rejectVersion);
    child.once("close", (code) => {
      if (code === 0) {
        resolveVersion(normalizeVersionString(stdout) ?? "unknown");
        return;
      }
      rejectVersion(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function resolveYtdlpDownloadUrl() {
  if (process.platform === "win32") {
    return YTDLP_WINDOWS_DOWNLOAD_URL;
  }
  if (process.platform === "darwin") {
    return YTDLP_MACOS_DOWNLOAD_URL;
  }
  throw new Error(`yt-dlp updater is not supported on ${process.platform}`);
}

function resolveDefaultYtdlpBinaryName() {
  if (process.platform === "win32") {
    return "yt-dlp-x86_64-pc-windows-msvc.exe";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "yt-dlp-aarch64-apple-darwin";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "yt-dlp-x86_64-apple-darwin";
  }
  throw new Error(`Unsupported platform for yt-dlp binary resolution: ${process.platform}-${process.arch}`);
}

async function resolveYtdlpBinaryPathForUpdate() {
  const existing = await resolveBundledBinary("yt-dlp");
  if (existing) {
    return existing;
  }

  await mkdir(BINARY_DIR, { recursive: true });
  return join(BINARY_DIR, resolveDefaultYtdlpBinaryName());
}

async function downloadToFile(url, destinationPath, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : null;
  const timeoutErrorMessage = options.timeoutErrorMessage
    ?? `Request timed out after ${Math.round((timeoutMs ?? 0) / 1000)}s`;
  const controller = timeoutMs ? new AbortController() : null;
  const upstreamSignal = options.signal;
  let timeoutId = null;
  let timedOut = false;
  let removeAbortListener = null;
  let writable = null;

  const resetTimeout = () => {
    if (!controller || !timeoutMs) {
      return;
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  if (controller && upstreamSignal) {
    const forwardAbort = () => {
      controller.abort(upstreamSignal.reason);
    };

    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal.addEventListener("abort", forwardAbort, { once: true });
      removeAbortListener = () => {
        upstreamSignal.removeEventListener("abort", forwardAbort);
      };
    }
  }

  try {
    resetTimeout();
    const response = await fetchWithDesktopSession(url, {
      headers: options.headers,
      signal: controller?.signal ?? upstreamSignal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await mkdir(dirname(destinationPath), { recursive: true });

    const total = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
    writable = createWriteStream(destinationPath);
    const reader = response.body.getReader();
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      resetTimeout();
      const chunk = Buffer.from(value);
      downloaded += chunk.length;
      if (!writable.write(chunk)) {
        await once(writable, "drain");
      }
      options.onProgress?.({
        downloaded,
        total: Number.isFinite(total) ? total : 0,
      });
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    await new Promise((resolveWrite, rejectWrite) => {
      writable.once("error", rejectWrite);
      writable.end(() => {
        resolveWrite();
      });
    });
  } catch (error) {
    writable?.destroy(error);
    if (timedOut) {
      throw new Error(timeoutErrorMessage);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    removeAbortListener?.();
  }
}

async function replaceFile(targetPath, temporaryPath) {
  try {
    await rename(temporaryPath, targetPath);
  } catch {
    await copyFile(temporaryPath, targetPath);
    await unlink(temporaryPath).catch(() => {});
  }
}

async function updateYtdlpBinary() {
  const binaryPath = await resolveYtdlpBinaryPathForUpdate();
  const downloadUrl = resolveYtdlpDownloadUrl();
  const tempDir = await mkdtemp(join(tmpdir(), "flowselect-ytdlp-"));
  const tempPath = join(tempDir, basename(binaryPath));

  await downloadToFile(downloadUrl, tempPath, {
    onProgress: ({ downloaded, total }) => {
      const percent = total > 0 ? (downloaded / total) * 100 : 0;
      emitAppEvent("ytdlp-update-progress", {
        percent,
        downloaded,
        total,
      });
    },
  });

  await replaceFile(binaryPath, tempPath);
  if (process.platform !== "win32") {
    await chmod(binaryPath, 0o755);
  }

  const currentVersion = await getLocalYtdlpVersion(binaryPath);
  await writeYtdlpLatestCache(currentVersion);
  return currentVersion;
}

async function checkYtdlpVersion() {
  const binaryPath = await resolveBundledBinary("yt-dlp");
  let current = "missing";
  let localError = null;

  if (binaryPath) {
    try {
      current = await getLocalYtdlpVersion(binaryPath);
    } catch (error) {
      current = "unknown";
      localError = String(error);
    }
  } else {
    localError = "Bundled yt-dlp binary is missing";
  }

  const { latest, latestError } = await resolveLatestYtdlpVersion();
  return {
    current,
    latest,
    updateAvailable:
      current !== "missing" && current !== "unknown" && latest
        ? compareLooseVersions(current, latest) < 0
        : null,
    latestError: latestError ?? localError,
  };
}

async function getPinterestDownloaderInfo() {
  const raw = await readFile(PINTEREST_LOCK_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return {
    current: parsed.upstream?.version || "unknown",
    packageName: parsed.upstream?.package || "pinterest-dl",
    flowselectSidecarVersion: parsed.flowselectSidecarVersion || "unknown",
    updateChannel: "app_release",
  };
}

function readNativeLocaleCandidates(language) {
  const candidates = [
    join(repoRoot, "locales", language, "native.json"),
    join(process.resourcesPath, "locales", language, "native.json"),
  ];
  return candidates.filter((candidate) => !candidate.includes("app.asar"));
}

async function loadNativeLocaleDocument(language) {
  for (const candidate of readNativeLocaleCandidates(language)) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const raw = await readFile(candidate, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      console.error(">>> [Electron] Failed to read native locale:", error);
    }
  }
  return null;
}

async function loadTrayLabels(language) {
  const normalizedLanguage = normalizeAppLanguage(language) ?? FALLBACK_LANGUAGE;
  const primary = await loadNativeLocaleDocument(normalizedLanguage);
  const fallback = normalizedLanguage === FALLBACK_LANGUAGE
    ? null
    : await loadNativeLocaleDocument(FALLBACK_LANGUAGE);
  const fromDocument = (document, path) => {
    let current = document;
    for (const key of path) {
      current = current?.[key];
    }
    return typeof current === "string" ? current : null;
  };
  return {
    show: fromDocument(primary, ["tray", "show"])
      || fromDocument(fallback, ["tray", "show"])
      || "Show Window",
    settings: fromDocument(primary, ["tray", "settings"])
      || fromDocument(fallback, ["tray", "settings"])
      || "Settings",
    quit: fromDocument(primary, ["tray", "quit"])
      || fromDocument(fallback, ["tray", "quit"])
      || "Quit FlowSelect",
  };
}

function getIconPath() {
  const candidates = process.platform === "win32"
    ? [
        join(repoRoot, "desktop-assets", "icons", "icon.ico"),
        join(repoRoot, "app-icon.png"),
        join(repoRoot, "public", "favicon.ico"),
      ]
    : [
        join(repoRoot, "app-icon.png"),
        join(repoRoot, "public", "favicon.ico"),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function emitAppEvent(event, payload) {
  for (const win of windows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send(`flowselect:event:${event}`, { payload });
    }
  }
}

function createUiLabReadyRuntimeStatus() {
  return {
    ytDlp: readyRuntimeEntry("D:/ui-lab/yt-dlp.exe", "bundled"),
    ffmpeg: readyRuntimeEntry("D:/ui-lab/ffmpeg.exe", "managed"),
    deno: readyRuntimeEntry("D:/ui-lab/deno.exe", "managed"),
    pinterestDownloader: readyRuntimeEntry("D:/ui-lab/pinterest-dl.exe", "managed"),
  };
}

function createUiLabMissingRuntimeStatus() {
  const readyStatus = createUiLabReadyRuntimeStatus();
  return {
    ...readyStatus,
    ffmpeg: missingRuntimeEntry("Missing managed ffmpeg runtime. UI Lab preview."),
    deno: missingRuntimeEntry("Missing managed deno runtime. UI Lab preview."),
  };
}

function createUiLabReadyRuntimeGateState() {
  return {
    phase: "ready",
    missingComponents: [],
    lastError: null,
    updatedAtMs: nowTimestampMs(),
    currentComponent: null,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: null,
  };
}

function applyUiLabRuntimePreview(runtimeStatus, gateState) {
  setUiLabRuntimeOverrides(runtimeStatus, gateState);
  emitAppEvent("runtime-dependency-gate-state", gateState);
}

function applyUiLabReadyRuntimePreview() {
  applyUiLabRuntimePreview(
    createUiLabReadyRuntimeStatus(),
    createUiLabReadyRuntimeGateState(),
  );
}

function emitUiLabEmptyTaskState() {
  emitAppEvent("video-queue-count", {
    activeCount: 0,
    pendingCount: 0,
    totalCount: 0,
    maxConcurrent: VIDEO_QUEUE_MAX_CONCURRENT,
  });
  emitAppEvent("video-queue-detail", { tasks: [] });
  emitAppEvent("video-transcode-queue-count", {
    activeCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalCount: 0,
    maxConcurrent: 1,
  });
  emitAppEvent("video-transcode-queue-detail", { tasks: [] });
}

function emitLiveVideoQueueState() {
  emitVideoQueueState();
  for (const task of activeVideoDownloads.values()) {
    emitVideoTaskProgress(task, task.progress);
  }
}

async function restoreUiLabLiveState() {
  uiLabScenarioActive = false;
  clearUiLabRuntimeOverrides();
  emitAppEvent(UI_LAB_RESET_EVENT, { restoreLive: true });
  emitLiveVideoQueueState();
  const gateState = await getRuntimeDependencyGateState();
  emitAppEvent("runtime-dependency-gate-state", gateState);
}

async function applyUiLabScenario(scenario) {
  assertUiLabEnabled();
  await showMainWindow();
  emitAppEvent(SHORTCUT_SHOW_EVENT, undefined);

  if (scenario === "reset") {
    await restoreUiLabLiveState();
    return;
  }

  uiLabScenarioActive = true;
  emitAppEvent(UI_LAB_RESET_EVENT, { restoreLive: false });
  emitUiLabEmptyTaskState();
  clearUiLabRuntimeOverrides();

  if (scenario === "runtime-auto-config") {
    const runtimeStatus = createUiLabMissingRuntimeStatus();
    const gateState = {
      phase: "downloading",
      missingComponents: ["ffmpeg", "deno"],
      lastError: null,
      updatedAtMs: nowTimestampMs(),
      currentComponent: "ffmpeg",
      currentStage: "downloading",
      progressPercent: 42,
      downloadedBytes: 42 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024,
      nextComponent: "deno",
    };
    applyUiLabRuntimePreview(runtimeStatus, gateState);
    return;
  }

  if (scenario === "runtime-failed") {
    const runtimeStatus = createUiLabMissingRuntimeStatus();
    const gateState = {
      phase: "failed",
      missingComponents: ["ffmpeg", "deno"],
      lastError: "Failed to download FFmpeg runtime: request timed out after 30s",
      updatedAtMs: nowTimestampMs(),
      currentComponent: null,
      currentStage: null,
      progressPercent: null,
      downloadedBytes: null,
      totalBytes: null,
      nextComponent: "ffmpeg",
    };
    applyUiLabRuntimePreview(runtimeStatus, gateState);
    return;
  }

  applyUiLabReadyRuntimePreview();

  if (scenario === "download-active") {
    const traceId = "ui-lab-download-active";
    emitAppEvent("video-queue-count", {
      activeCount: 1,
      pendingCount: 0,
      totalCount: 1,
      maxConcurrent: VIDEO_QUEUE_MAX_CONCURRENT,
    });
    emitAppEvent("video-queue-detail", {
      tasks: [
        {
          traceId,
          label: "Pinterest seasonal campaign cut.mp4",
          status: "active",
        },
      ],
    });
    emitAppEvent("video-download-progress", {
      traceId,
      percent: 46,
      stage: "downloading",
      speed: "8.2 MB/s",
      eta: "00:12",
    });
    return;
  }

  if (scenario === "download-queued") {
    const activeTraceId = "ui-lab-download-queued-active";
    emitAppEvent("video-queue-count", {
      activeCount: 1,
      pendingCount: 2,
      totalCount: 3,
      maxConcurrent: VIDEO_QUEUE_MAX_CONCURRENT,
    });
    emitAppEvent("video-queue-detail", {
      tasks: [
        {
          traceId: activeTraceId,
          label: "Long-form interview master.mp4",
          status: "active",
        },
        {
          traceId: "ui-lab-download-queued-2",
          label: "Episode teaser vertical.mp4",
          status: "pending",
        },
        {
          traceId: "ui-lab-download-queued-3",
          label: "Creator archive backup.mp4",
          status: "pending",
        },
      ],
    });
    emitAppEvent("video-download-progress", {
      traceId: activeTraceId,
      percent: 12,
      stage: "preparing",
      speed: "Preparing...",
      eta: "",
    });
    return;
  }

  if (scenario === "transcode-active") {
    const traceId = "ui-lab-transcode-active";
    emitAppEvent("video-transcode-queue-count", {
      activeCount: 1,
      pendingCount: 1,
      failedCount: 0,
      totalCount: 2,
      maxConcurrent: 1,
    });
    emitAppEvent("video-transcode-queue-detail", {
      tasks: [
        {
          traceId,
          label: "Client delivery master.mov",
          status: "active",
          stage: "transcoding",
          progressPercent: 68,
          etaSeconds: 24,
          sourcePath: "D:/ui-lab/client-delivery-master.mov",
          sourceFormat: "mov",
          targetFormat: "mp4",
          error: null,
        },
        {
          traceId: "ui-lab-transcode-pending",
          label: "Reel export source.mov",
          status: "pending",
          stage: "analyzing",
          progressPercent: null,
          etaSeconds: null,
          sourcePath: "D:/ui-lab/reel-export-source.mov",
          sourceFormat: "mov",
          targetFormat: "mp4",
          error: null,
        },
      ],
    });
    emitAppEvent("video-transcode-progress", {
      traceId,
      label: "Client delivery master.mov",
      status: "active",
      stage: "transcoding",
      progressPercent: 68,
      etaSeconds: 24,
      sourcePath: "D:/ui-lab/client-delivery-master.mov",
      sourceFormat: "mov",
      targetFormat: "mp4",
      error: null,
    });
    return;
  }

  if (scenario === "transcode-failed") {
    const traceId = "ui-lab-transcode-failed";
    emitAppEvent("video-transcode-queue-count", {
      activeCount: 0,
      pendingCount: 0,
      failedCount: 1,
      totalCount: 1,
      maxConcurrent: 1,
    });
    emitAppEvent("video-transcode-queue-detail", {
      tasks: [
        {
          traceId,
          label: "Broadcast package master.mkv",
          status: "failed",
          stage: "failed",
          progressPercent: null,
          etaSeconds: null,
          sourcePath: "D:/ui-lab/broadcast-package-master.mkv",
          sourceFormat: "mkv",
          targetFormat: "mp4",
          error: "FFmpeg exited with code 1 while finalizing the MP4 output.",
        },
      ],
    });
    emitAppEvent("video-transcode-failed", {
      traceId,
      label: "Broadcast package master.mkv",
      status: "failed",
      stage: "failed",
      progressPercent: null,
      etaSeconds: null,
      sourcePath: "D:/ui-lab/broadcast-package-master.mkv",
      sourceFormat: "mkv",
      targetFormat: "mp4",
      error: "FFmpeg exited with code 1 while finalizing the MP4 output.",
    });
    return;
  }

  if (scenario === "mixed-busy") {
    const downloadTraceId = "ui-lab-mixed-download";
    const transcodeTraceId = "ui-lab-mixed-transcode";
    emitAppEvent("video-queue-count", {
      activeCount: 1,
      pendingCount: 1,
      totalCount: 2,
      maxConcurrent: VIDEO_QUEUE_MAX_CONCURRENT,
    });
    emitAppEvent("video-queue-detail", {
      tasks: [
        {
          traceId: downloadTraceId,
          label: "Compilation trailer capture.mp4",
          status: "active",
        },
        {
          traceId: "ui-lab-mixed-download-pending",
          label: "Livestream archive pull.mp4",
          status: "pending",
        },
      ],
    });
    emitAppEvent("video-download-progress", {
      traceId: downloadTraceId,
      percent: 74,
      stage: "merging",
      speed: "Merging...",
      eta: "",
    });
    emitAppEvent("video-transcode-queue-count", {
      activeCount: 1,
      pendingCount: 0,
      failedCount: 0,
      totalCount: 1,
      maxConcurrent: 1,
    });
    emitAppEvent("video-transcode-queue-detail", {
      tasks: [
        {
          traceId: transcodeTraceId,
          label: "Editorial proxy source.mov",
          status: "active",
          stage: "finalizing_mp4",
          progressPercent: 91,
          etaSeconds: 8,
          sourcePath: "D:/ui-lab/editorial-proxy-source.mov",
          sourceFormat: "mov",
          targetFormat: "mp4",
          error: null,
        },
      ],
    });
    emitAppEvent("video-transcode-progress", {
      traceId: transcodeTraceId,
      label: "Editorial proxy source.mov",
      status: "active",
      stage: "finalizing_mp4",
      progressPercent: 91,
      etaSeconds: 8,
      sourcePath: "D:/ui-lab/editorial-proxy-source.mov",
      sourceFormat: "mov",
      targetFormat: "mp4",
      error: null,
    });
    return;
  }

  throw new Error(`Unsupported UI Lab scenario: ${scenario}`);
}

function broadcastWsMessage(message) {
  const serialized = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === client.OPEN) {
      client.send(serialized);
    }
  }
}

function takePendingProtectedImageRequest(requestId) {
  const pending = pendingProtectedImageRequests.get(requestId);
  if (!pending) {
    return null;
  }
  pendingProtectedImageRequests.delete(requestId);
  clearTimeout(pending.timeoutId);
  return pending;
}

async function requestProtectedImageResolution(payload) {
  if (wsClients.size === 0) {
    throw new Error("Browser extension is not connected");
  }

  const requestId = nextOpaqueId("protected-image");
  return new Promise((resolveResolution, rejectResolution) => {
    const timeoutId = setTimeout(() => {
      pendingProtectedImageRequests.delete(requestId);
      rejectResolution(new Error("Protected image resolution timed out"));
    }, PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS);

    pendingProtectedImageRequests.set(requestId, {
      resolveResolution,
      rejectResolution,
      timeoutId,
    });

    broadcastWsMessage({
      action: "resolve_protected_image",
      data: {
        requestId,
        token: payload.token,
        pageUrl: payload.pageUrl ?? null,
        imageUrl: payload.imageUrl ?? null,
        targetDir: payload.targetDir ?? null,
      },
    });
  });
}

function resolveYtdlpFormatProfile(quality, hasFfmpeg) {
  if (!hasFfmpeg) {
    switch (quality) {
      case "balanced":
        return {
          selector: "best[height<=1080][ext=mp4]/best[ext=mp4]/best",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "data_saver":
        return {
          selector: "best[height<=360][ext=mp4]/worst[ext=mp4]/worst",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "best":
      default:
        return {
          selector: "best[ext=mp4]/best",
          sort: "res,codec:h264,acodec:aac,ext",
          mergeOutputFormat: null,
        };
    }
  }

  switch (quality) {
    case "balanced":
      return {
        selector: YTDLP_FORMAT_SELECTOR_BALANCED,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      };
    case "data_saver":
      return {
        selector: YTDLP_FORMAT_SELECTOR_DATA_SAVER,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      };
    case "best":
    default:
      return {
        selector: YTDLP_FORMAT_SELECTOR_BEST,
        sort: "res,codec:h264,acodec:aac,ext",
        mergeOutputFormat: "mkv",
      };
  }
}

function emitVideoQueueState() {
  const activeTasks = [...activeVideoDownloads.values()];
  const pendingTasks = [...pendingVideoDownloads];
  emitAppEvent("video-queue-count", {
    activeCount: activeTasks.length,
    pendingCount: pendingTasks.length,
    totalCount: activeTasks.length + pendingTasks.length,
    maxConcurrent: VIDEO_QUEUE_MAX_CONCURRENT,
  });
  emitAppEvent("video-queue-detail", {
    tasks: [...activeTasks, ...pendingTasks].map((task) => ({
      traceId: task.traceId,
      label: task.label,
      status: task.status,
    })),
  });
}

function emitVideoTaskProgress(task, payload) {
  const safePercent = Number.isFinite(payload.percent)
    ? Math.max(0, Math.min(100, Number(payload.percent)))
    : task.progress.percent;
  const nextProgress = {
    percent: safePercent,
    stage: payload.stage ?? task.progress.stage,
    speed: typeof payload.speed === "string" ? payload.speed : task.progress.speed,
    eta: typeof payload.eta === "string" ? payload.eta : task.progress.eta,
  };
  task.progress = nextProgress;
  emitAppEvent("video-download-progress", {
    traceId: task.traceId,
    percent: nextProgress.percent,
    stage: nextProgress.stage,
    speed: nextProgress.speed,
    eta: nextProgress.eta,
  });
}

function resolveQueuedVideoSourceUrl(task) {
  return normalizeOptionalString(task.videoUrl)
    ?? task.videoCandidates[0]
    ?? normalizeOptionalString(task.url)
    ?? normalizeOptionalString(task.pageUrl);
}

function trackYtdlpOutputLine(task, line) {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return;
  }

  const filePathIndex = trimmedLine.indexOf(YTDLP_FILE_PATH_PREFIX);
  if (filePathIndex >= 0) {
    const candidatePath = trimmedLine
      .slice(filePathIndex + YTDLP_FILE_PATH_PREFIX.length)
      .trim();
    if (candidatePath) {
      task.filePath = candidatePath;
    }
    return;
  }

  const progressIndex = trimmedLine.indexOf(YTDLP_PROGRESS_PREFIX);
  if (progressIndex >= 0) {
    const rawPayload = trimmedLine
      .slice(progressIndex + YTDLP_PROGRESS_PREFIX.length)
      .trim();
    const [percentRaw = "", speedRaw = "", etaRaw = ""] = rawPayload.split("|");
    const percent = Number.parseFloat(percentRaw.replace(/[^0-9.]/g, ""));
    emitVideoTaskProgress(task, {
      percent: Number.isFinite(percent) ? percent : task.progress.percent,
      stage: "downloading",
      speed: speedRaw.trim() === "N/A" ? "" : speedRaw.trim(),
      eta:
        etaRaw.trim() === "N/A" || etaRaw.trim() === "NA" || etaRaw.trim() === "Unknown ETA"
          ? ""
          : etaRaw.trim(),
    });
    return;
  }

  const lowerLine = trimmedLine.toLowerCase();
  if (trimmedLine.includes("[download] Destination:")) {
    const destination = trimmedLine.split("[download] Destination:").slice(1).join("").trim();
    if (destination) {
      task.filePath = destination;
    }
  }
  if (lowerLine.includes("merging formats into") || lowerLine.includes("fixing m3u8")) {
    emitVideoTaskProgress(task, {
      percent: Math.max(task.progress.percent, 99),
      stage: "merging",
      speed: "",
      eta: "",
    });
    return;
  }
  if (
    lowerLine.includes("post-process")
    || lowerLine.includes("embedding metadata")
    || lowerLine.includes("deleting original file")
  ) {
    emitVideoTaskProgress(task, {
      percent: Math.max(task.progress.percent, 99),
      stage: "post_processing",
      speed: "",
      eta: "",
    });
    return;
  }

  task.lastDiagnostic = trimmedLine;
}

function watchChildProcessLines(task, stream) {
  let pending = "";
  stream.on("data", (chunk) => {
    pending += chunk.toString();
    let lineBreakIndex = pending.indexOf("\n");
    while (lineBreakIndex >= 0) {
      const line = pending.slice(0, lineBreakIndex).trim();
      pending = pending.slice(lineBreakIndex + 1);
      if (line) {
        trackYtdlpOutputLine(task, line);
      }
      lineBreakIndex = pending.indexOf("\n");
    }
  });
  stream.on("end", () => {
    const line = pending.trim();
    if (line) {
      trackYtdlpOutputLine(task, line);
    }
  });
}

async function saveTempCookiesFile(rawCookies) {
  const cookies = normalizeOptionalString(rawCookies);
  if (!cookies) {
    return null;
  }
  const cookiesPath = join(tmpdir(), `${nextOpaqueId("flowselect-cookies")}.txt`);
  await writeFile(cookiesPath, cookies, "utf8");
  return cookiesPath;
}

async function cleanupVideoTaskArtifacts(task) {
  if (task.cookiesPath) {
    await unlink(task.cookiesPath).catch(() => {});
    task.cookiesPath = null;
  }
}

async function settleVideoDownloadTask(task, outcome) {
  if (task.settled) {
    return;
  }

  task.settled = true;
  task.child = null;
  activeVideoDownloads.delete(task.traceId);

  const pendingIndex = pendingVideoDownloads.findIndex((entry) => entry.traceId === task.traceId);
  if (pendingIndex >= 0) {
    pendingVideoDownloads.splice(pendingIndex, 1);
  }

  await cleanupVideoTaskArtifacts(task);
  emitAppEvent("video-download-complete", {
    traceId: task.traceId,
    success: outcome.success,
    file_path: outcome.filePath ?? task.filePath ?? undefined,
    error: outcome.error ?? undefined,
  });
  emitVideoQueueState();
  void pumpVideoDownloadQueue();
}

async function runVideoDownloadTask(task) {
  const ytdlpPath = await resolveBundledBinary("yt-dlp");
  if (!ytdlpPath) {
    await settleVideoDownloadTask(task, {
      success: false,
      error: "Bundled yt-dlp binary is missing",
    });
    return;
  }

  const sourceUrl = resolveQueuedVideoSourceUrl(task);
  if (!sourceUrl) {
    await settleVideoDownloadTask(task, {
      success: false,
      error: "Missing video download URL",
    });
    return;
  }

  try {
    const runtimeSnapshot = await getRuntimeDependencyStatus();
    const missingManagedComponents = collectMissingManagedRuntimeComponents(runtimeSnapshot);
    const ffmpegPath = await ensureManagedFfmpegRuntimeReady(
      "ytdlp_download",
      missingManagedComponents,
    );
    const denoPath = await ensureManagedDenoRuntimeReady(
      "ytdlp_download",
      missingManagedComponents,
    );
    const outputDir = await resolveCurrentOutputFolderPath();
    const formatProfile = resolveYtdlpFormatProfile(task.ytdlpQuality, Boolean(ffmpegPath));
    task.cookiesPath = await saveTempCookiesFile(task.cookies);
    const args = [
      "--newline",
      "--no-warnings",
      "--ignore-config",
      "--progress",
      "--progress-template",
      `download:${YTDLP_PROGRESS_PREFIX}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s`,
      "--print",
      `after_move:${YTDLP_FILE_PATH_PREFIX}%(filepath)s`,
      "--output",
      "%(title)s.%(ext)s",
      "-P",
      outputDir,
      "--format",
      formatProfile.selector,
      "--extractor-args",
      "youtube:player_js_variant=tv",
      "--remote-components",
      "ejs:github",
    ];

    if (formatProfile.sort) {
      args.push("--format-sort", formatProfile.sort);
    }
    if (formatProfile.mergeOutputFormat) {
      args.push("--merge-output-format", formatProfile.mergeOutputFormat);
    }
    if (ffmpegPath) {
      args.push("--ffmpeg-location", dirname(ffmpegPath));
    }
    if (process.platform === "win32") {
      args.push("--js-runtimes", "deno", "--js-runtimes", "node");
    } else {
      args.push("--js-runtimes", "node", "--js-runtimes", "deno");
    }
    if (task.cookiesPath) {
      args.push("--cookies", task.cookiesPath);
    }
    if (task.selectionScope === "current_item") {
      args.push("--no-playlist");
    }
    if (task.pageUrl) {
      args.push("--add-header", `Referer:${task.pageUrl}`);
    }
    args.push(sourceUrl);

    task.lastDiagnostic = "";
    emitVideoTaskProgress(task, {
      percent: 0,
      stage: "preparing",
      speed: "",
      eta: "",
    });

    const child = spawn(ytdlpPath, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${dirname(denoPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
      },
      windowsHide: true,
    });
    task.child = child;
    watchChildProcessLines(task, child.stdout);
    watchChildProcessLines(task, child.stderr);

    await new Promise((resolveTask, rejectTask) => {
      child.once("error", rejectTask);
      child.once("close", (code, signal) => {
        if (task.cancelRequested) {
          resolveTask();
          return;
        }

        if (code === 0) {
          resolveTask();
          return;
        }

        rejectTask(
          new Error(
            task.lastDiagnostic
              || `yt-dlp exited with code ${code}${signal ? ` (${signal})` : ""}`,
          ),
        );
      });
    });

    if (task.cancelRequested) {
      await settleVideoDownloadTask(task, {
        success: false,
        error: "cancelled",
      });
      return;
    }

    await settleVideoDownloadTask(task, {
      success: true,
      filePath: task.filePath,
    });
  } catch (error) {
    await settleVideoDownloadTask(task, {
      success: false,
      error: String(error),
    });
  }
}

async function pumpVideoDownloadQueue() {
  if (isVideoQueuePumpScheduled) {
    return;
  }

  isVideoQueuePumpScheduled = true;
  try {
    while (
      activeVideoDownloads.size < VIDEO_QUEUE_MAX_CONCURRENT
      && pendingVideoDownloads.length > 0
    ) {
      const task = pendingVideoDownloads.shift();
      if (!task || task.cancelRequested) {
        continue;
      }

      task.status = "active";
      activeVideoDownloads.set(task.traceId, task);
      emitVideoQueueState();
      void runVideoDownloadTask(task);
    }
  } finally {
    isVideoQueuePumpScheduled = false;
    if (
      activeVideoDownloads.size < VIDEO_QUEUE_MAX_CONCURRENT
      && pendingVideoDownloads.length > 0
    ) {
      void pumpVideoDownloadQueue();
    }
  }
}

async function enqueueElectronVideoDownload(payload) {
  const rawUrl = normalizeRequiredVideoRouteUrl(payload?.url);
  if (!rawUrl) {
    throw new Error("Missing or invalid url");
  }

  const config = await readConfigObject();
  const mergedPreferences = resolveVideoDownloadPreferencesFromConfig(config);
  const task = {
    traceId: nextOpaqueId("video"),
    url: rawUrl,
    pageUrl: normalizeVideoPageUrl(payload?.pageUrl),
    videoUrl: normalizeVideoHintUrl(payload?.videoUrl),
    videoCandidates: normalizeVideoCandidateUrls(payload?.videoCandidates),
    title: normalizeOptionalString(payload?.title),
    cookies: normalizeOptionalString(payload?.cookies),
    selectionScope: normalizeSelectionScope(payload?.selectionScope),
    ytdlpQuality:
      normalizeYtdlpQualityPreference(payload?.ytdlpQualityPreference)
      ?? normalizeYtdlpQualityPreference(payload?.defaultVideoDownloadQuality)
      ?? mergedPreferences.ytdlpQuality,
    label: "",
    status: "pending",
    settled: false,
    cancelRequested: false,
    cookiesPath: null,
    child: null,
    filePath: null,
    lastDiagnostic: "",
    progress: {
      percent: 0,
      stage: "preparing",
      speed: "",
      eta: "",
    },
  };
  task.label = buildVideoTaskLabel(task);

  pendingVideoDownloads.push(task);
  emitVideoQueueState();
  void pumpVideoDownloadQueue();

  return {
    accepted: true,
    traceId: task.traceId,
  };
}

async function cancelVideoDownload(traceId) {
  const pendingIndex = pendingVideoDownloads.findIndex((task) => task.traceId === traceId);
  if (pendingIndex >= 0) {
    const [task] = pendingVideoDownloads.splice(pendingIndex, 1);
    task.cancelRequested = true;
    await settleVideoDownloadTask(task, {
      success: false,
      error: "cancelled",
    });
    return true;
  }

  const activeTask = activeVideoDownloads.get(traceId);
  if (!activeTask) {
    return false;
  }

  activeTask.cancelRequested = true;
  if (activeTask.child && !activeTask.child.killed) {
    activeTask.child.kill("SIGTERM");
    const forceKillTimer = setTimeout(() => {
      if (!activeTask.settled && activeTask.child && !activeTask.child.killed) {
        activeTask.child.kill("SIGKILL");
      }
    }, 1000);
    if (typeof forceKillTimer.unref === "function") {
      forceKillTimer.unref();
    }
  }
  return true;
}

async function broadcastTheme(theme) {
  broadcastWsMessage({
    action: "theme_changed",
    data: {
      theme,
    },
  });
}

async function updateTrayMenu() {
  const language = await readCurrentLanguage();
  const labels = await loadTrayLabels(language);
  const menu = Menu.buildFromTemplate([
    {
      id: "show",
      label: labels.show,
      click: () => {
        showMainWindow();
      },
    },
    {
      id: "settings",
      label: labels.settings,
      click: () => {
        void openSecondaryWindow(WINDOW_LABELS.settings, {
          title: labels.settings,
          width: SETTINGS_WINDOW_WIDTH,
          height: SETTINGS_WINDOW_HEIGHT,
          alwaysOnTop: true,
          focus: true,
        });
      },
    },
    {
      id: "quit",
      label: labels.quit,
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  if (!tray) {
    const iconPath = getIconPath();
    tray = new Tray(iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty());
    tray.on("click", () => {
      showMainWindow();
    });
  }

  tray.setToolTip("FlowSelect");
  tray.setContextMenu(menu);
}

function getBaseRendererUrl() {
  const envUrl = process.env.FLOWSELECT_FRONTEND_URL ?? process.env.FLOWSELECT_ELECTRON_DEV_SERVER_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  return "http://127.0.0.1:1420";
}

function buildRendererRoute(routePath) {
  const normalizedRoute = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (!app.isPackaged) {
    return `${getBaseRendererUrl()}#${normalizedRoute}`;
  }

  return `${pathToFileURL(join(repoRoot, "dist", "index.html")).toString()}#${normalizedRoute}`;
}

function secondaryWindowRoute(label) {
  if (label === WINDOW_LABELS.settings) {
    return "/settings";
  }
  if (label === WINDOW_LABELS.contextMenu) {
    return "/context-menu";
  }
  if (label === WINDOW_LABELS.uiLab) {
    return "/ui-lab";
  }
  throw new Error(`Unsupported secondary window label: ${label}`);
}

function getWindow(label) {
  return windows.get(label) ?? null;
}

function registerWindow(label, win) {
  windows.set(label, win);
  win.on("focus", () => {
    win.webContents.send("flowselect:current-window:focus-changed", true);
  });
  win.on("blur", () => {
    win.webContents.send("flowselect:current-window:focus-changed", false);
    win.webContents.send("flowselect:current-window:blur");
  });
  win.on("closed", () => {
    windows.delete(label);
    if (label === WINDOW_LABELS.contextMenu) {
      emitAppEvent(CONTEXT_MENU_CLOSED_EVENT, undefined);
    }
    if (label === WINDOW_LABELS.uiLab && uiLabScenarioActive) {
      void restoreUiLabLiveState().catch((error) => {
        console.error("Failed to restore live state after UI Lab close:", error);
      });
    }
  });
}

async function createMainWindow() {
  const existing = getWindow(WINDOW_LABELS.main);
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const useCompactStartupBounds = process.platform === "win32" && !hasShownMainWindowOnce;
  const initialWindowSize = useCompactStartupBounds
    ? MAIN_WINDOW_COMPACT_STARTUP_SIZE
    : MAIN_WINDOW_FULL_SIZE;

  const {
    browserWindow: mainWindow,
    transparentWindow,
  } = await createFlowSelectBrowserWindow(WINDOW_LABELS.main, {
    routePath: "/",
    width: initialWindowSize,
    height: initialWindowSize,
    title: app.getName(),
    alwaysOnTop: true,
    skipTaskbar: process.platform === "win32",
    allowTransparency: true,
    frame: false,
    resizable: false,
    preferZeroAlphaTransparentBackground: true,
  });
  mainWindowUsesTransparentShell = transparentWindow;
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  if (process.platform === "win32" && app.isPackaged && transparentWindow) {
    mainWindow.on("focus", () => {
      applyMainWindowVisibleZOrder(mainWindow, "focus");
    });
  }

  await mainWindow.loadURL(buildRendererRoute("/"));
  await waitForWindowReadyToReveal(mainWindow, WINDOW_LABELS.main, transparentWindow);
  void queueStartupDiagnostic("WindowDiag", "main:create-complete", getWindowSnapshot(mainWindow));
  return mainWindow;
}

async function showMainWindow({
  preserveExistingBounds = false,
}: {
  preserveExistingBounds?: boolean;
} = {}) {
  const mainWindow = await createMainWindow();
  const currentBounds = mainWindow.getBounds();
  const revealBounds = resolveMainWindowRevealBounds({
    bounds: currentBounds,
    displays: screen.getAllDisplays().map((display) => display.workArea),
    fallbackDisplay: screen.getPrimaryDisplay().workArea,
    forceCenter: process.platform === "win32" && app.isPackaged && !hasShownMainWindowOnce,
    minimumWidth: preserveExistingBounds
      ? currentBounds.width
      : MAIN_WINDOW_FULL_SIZE,
    minimumHeight: preserveExistingBounds
      ? currentBounds.height
      : MAIN_WINDOW_FULL_SIZE,
  });

  void queueStartupDiagnostic("WindowDiag", "main:show-request", {
    revealBounds,
    preShow: getWindowSnapshot(mainWindow),
    transparentShell: mainWindowUsesTransparentShell,
  });

  mainWindow.setBounds(revealBounds);
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "before-show",
    snapshot: getWindowSnapshot(mainWindow),
  });
  mainWindow.show();
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "after-show",
    snapshot: getWindowSnapshot(mainWindow),
  });
  if (mainWindow.isMinimized()) {
    void queueStartupDiagnostic("WindowDiag", "main:show-step", {
      step: "before-restore",
      snapshot: getWindowSnapshot(mainWindow),
    });
    mainWindow.restore();
    void queueStartupDiagnostic("WindowDiag", "main:show-step", {
      step: "after-restore",
      snapshot: getWindowSnapshot(mainWindow),
    });
  }
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "before-focus",
    snapshot: getWindowSnapshot(mainWindow),
  });
  mainWindow.focus();
  applyMainWindowVisibleZOrder(mainWindow, "show");
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "after-z-order",
    snapshot: getWindowSnapshot(mainWindow),
  });
  hasShownMainWindowOnce = true;
  void queueStartupDiagnostic("WindowDiag", "main:show-complete", getWindowSnapshot(mainWindow));
  void collectWindowStartupArtifacts(mainWindow, WINDOW_LABELS.main, "show");
}

function showSecondaryWindow(label, win, options) {
  if (win.isDestroyed()) {
    return;
  }

  if (options.focus === false && typeof win.showInactive === "function") {
    win.showInactive();
  } else {
    win.show();
  }
  if (options.focus !== false) {
    win.focus();
  }
  void collectWindowStartupArtifacts(win, label, "show");
}

async function openSecondaryWindow(label, options) {
  const existing = getWindow(label);
  if (existing && !existing.isDestroyed()) {
    showSecondaryWindow(label, existing, options);
    return existing;
  }

  const routePath = secondaryWindowRoute(label);
  const {
    browserWindow,
    transparentWindow,
  } = await createFlowSelectBrowserWindow(label, {
    routePath,
    width: options.width,
    height: options.height,
    x: options.x,
    y: options.y,
    center: options.center === true,
    title: options.title,
    allowTransparency: !shouldForceOpaqueSecondaryWindow(label) && options.transparent !== false,
    frame: options.decorations === true,
    resizable: options.resizable === true,
    alwaysOnTop: options.alwaysOnTop !== false,
    skipTaskbar: options.skipTaskbar ?? process.platform === "win32",
    parentLabel: options.parent === "main" ? WINDOW_LABELS.main : undefined,
  });
  await browserWindow.loadURL(
    buildRendererRoute(routePath),
  );
  await waitForWindowReadyToReveal(browserWindow, label, transparentWindow);
  if (!browserWindow.isVisible()) {
    showSecondaryWindow(label, browserWindow, options);
  }
  return browserWindow;
}

async function getAutostart() {
  if (process.platform === "win32") {
    return isWindowsAutostartEnabled(
      app.getLoginItemSettings(getWindowsAutostartQuery(process.execPath)),
      process.execPath,
    );
  }

  if (process.platform !== "darwin") {
    return false;
  }

  return app.getLoginItemSettings().openAtLogin;
}

async function setAutostart(enabled) {
  if (process.platform === "win32") {
    app.setLoginItemSettings(
      buildWindowsAutostartSettings(process.execPath, enabled),
    );
    return;
  }

  if (process.platform !== "darwin") {
    return;
  }

  app.setLoginItemSettings({ openAtLogin: enabled });
}

async function registerShortcut(shortcut) {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = "";
  }
  if (!shortcut) {
    return;
  }
  const success = globalShortcut.register(shortcut, () => {
    void showMainWindow();
    emitAppEvent(SHORTCUT_SHOW_EVENT, undefined);
  });
  if (!success) {
    throw new Error(`Failed to register shortcut: ${shortcut}`);
  }
  registeredShortcut = shortcut;
}

async function registerShortcutFromConfig() {
  const config = await readConfigObject();
  if (typeof config.shortcut === "string" && config.shortcut.trim()) {
    await registerShortcut(config.shortcut.trim());
  }
}

async function openDialogForEvent(event, options) {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const properties = [];
  if (options.directory) {
    properties.push("openDirectory");
  } else {
    properties.push("openFile");
  }
  if (options.multiple) {
    properties.push("multiSelections");
  }

  const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
    title: options.title,
    properties,
    filters: options.filters,
  });

  if (result.canceled) {
    return null;
  }
  if (options.multiple) {
    return result.filePaths;
  }
  return result.filePaths[0] ?? null;
}

async function openCurrentOutputFolder() {
  const folderPath = await resolveCurrentOutputFolderPath();
  await shell.openPath(folderPath);
}

async function beginPickOutputFolderFromContextMenu() {
  const contextMenu = getWindow(WINDOW_LABELS.contextMenu);
  if (contextMenu && !contextMenu.isDestroyed()) {
    contextMenu.close();
  }
  emitAppEvent(CONTEXT_MENU_CLOSED_EVENT, undefined);

  const mainWindow = await createMainWindow();
  const wasAlwaysOnTop = mainWindow.isAlwaysOnTop();
  if (wasAlwaysOnTop) {
    mainWindow.setAlwaysOnTop(false);
  }
  mainWindow.focus();

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
      return;
    }
    const nextOutputPath = result.filePaths[0];
    const config = await readConfigObject();
    if (config.outputPath === nextOutputPath) {
      return;
    }
    config.outputPath = nextOutputPath;
    await saveConfigString(JSON.stringify(config));
    emitAppEvent("output-path-changed", { path: nextOutputPath });
  } finally {
    if (wasAlwaysOnTop) {
      applyMainWindowVisibleZOrder(mainWindow, "dialog-restore");
    }
    mainWindow.focus();
  }
}

async function beginOpenOutputFolderFromContextMenu() {
  const contextMenu = getWindow(WINDOW_LABELS.contextMenu);
  if (contextMenu && !contextMenu.isDestroyed()) {
    contextMenu.close();
  }
  emitAppEvent(CONTEXT_MENU_CLOSED_EVENT, undefined);
  await openCurrentOutputFolder();
}

async function readClipboardImage() {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }
  const size = image.getSize();
  return {
    width: size.width,
    height: size.height,
    rgba: Array.from(image.toBitmap()),
  };
}

async function checkForAppUpdate() {
  if (process.platform !== "win32" || !app.isPackaged) {
    pendingAppUpdate = null;
    return null;
  }

  try {
    const response = await fetchWithDesktopSession(APP_UPDATE_ENDPOINT);
    if (!response.ok) {
      throw new Error(`Update manifest lookup failed: ${response.status}`);
    }
    const manifest = await response.json();
    const nextVersion = normalizeVersionString(manifest?.version);
    const currentVersion = normalizeVersionString(app.getVersion());
    if (
      !nextVersion
      || !currentVersion
      || compareLooseVersions(nextVersion, currentVersion) <= 0
    ) {
      pendingAppUpdate = null;
      return null;
    }
    pendingAppUpdate = manifest;
    return {
      current: currentVersion,
      latest: nextVersion,
      notes: typeof manifest.notes === "string" ? manifest.notes : null,
      publishedAt: typeof manifest.pub_date === "string" ? manifest.pub_date : null,
    };
  } catch (error) {
    console.error(">>> [Electron] App update check failed:", error);
    pendingAppUpdate = null;
    return null;
  }
}

async function downloadAndInstallAppUpdate() {
  if (!pendingAppUpdate) {
    throw new Error("No pending Electron app update is available");
  }

  const platformEntry = pendingAppUpdate?.platforms?.["windows-x86_64"];
  const installerUrl = normalizeOptionalString(platformEntry?.url);
  if (!installerUrl) {
    throw new Error("Update manifest does not include a Windows installer URL");
  }

  const parsedUrl = new URL(installerUrl);
  const installerFileName = basename(parsedUrl.pathname) || "FlowSelect_update_installer.exe";
  const downloadDir = await mkdtemp(join(tmpdir(), "flowselect-app-update-"));
  const installerPath = join(downloadDir, installerFileName);
  await downloadToFile(installerUrl, installerPath, {
    headers: buildGitHubHeaders(),
  });

  const openResult = await shell.openPath(installerPath);
  if (openResult) {
    throw new Error(`Failed to open installer: ${openResult}`);
  }

  app.isQuitting = true;
  app.quit();
  return new Promise(() => {});
}

function buildRequestData(requestId, code, extraData = {}) {
  if (!requestId) {
    return Object.keys(extraData).length > 0 ? extraData : null;
  }
  return {
    requestId,
    ...(code ? { code } : {}),
    ...extraData,
  };
}

function extractRequestId(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (typeof data.requestId === "string") {
    return data.requestId;
  }
  if (typeof data.request_id === "string") {
    return data.request_id;
  }
  return null;
}

async function handleWsMessage(rawMessage) {
  let parsed;
  try {
    parsed = JSON.parse(rawMessage.toString());
  } catch (error) {
    return {
      success: false,
      message: `Invalid JSON: ${error}`,
      data: null,
    };
  }

  const action = parsed.action;
  const data = parsed.data ?? null;
  const requestId = extractRequestId(data);
  const withRequest = (code, extraData) => buildRequestData(requestId, code, extraData);

  switch (action) {
    case "ping":
      return {
        success: true,
        message: "pong",
        data: null,
      };
    case "get_theme":
      return {
        success: true,
        message: null,
        data: {
          action: "theme_info",
          theme: await readCurrentTheme(),
        },
      };
    case "get_language":
      return {
        success: true,
        message: null,
        data: {
          action: "language_info",
          language: await readCurrentLanguage(),
        },
      };
    case "sync_download_preferences": {
      if (!data || typeof data !== "object") {
        return {
          success: false,
          message: "Missing data",
          data: withRequest("missing_data"),
        };
      }
      const syncedPreferences = await syncIncomingDownloadPreferences(data);
      if (!syncedPreferences) {
        return {
          success: false,
          message: "Missing download preference fields",
          data: withRequest("missing_download_preference_fields"),
        };
      }
      return {
        success: true,
        message: "Download preferences synced",
        data: withRequest(null, {
          quality: syncedPreferences.quality,
          aeFriendlyConversionEnabled: syncedPreferences.aeFriendlyConversionEnabled,
        }),
      };
    }
    case "save_image": {
      if (!data?.url) {
        return {
          success: false,
          message: "Missing url",
          data: withRequest("missing_url"),
        };
      }
      try {
        const filePath = await downloadImage(
          data.url,
          typeof data.targetDir === "string" ? data.targetDir : null,
          typeof data.originalFilename === "string" ? data.originalFilename : null,
        );
        return {
          success: true,
          message: filePath,
          data: withRequest(null),
        };
      } catch (error) {
        return {
          success: false,
          message: String(error),
          data: withRequest("save_image_failed"),
        };
      }
    }
    case "save_data_url": {
      if (!data?.dataUrl && !data?.data_url) {
        return {
          success: false,
          message: "Missing dataUrl",
          data: withRequest("missing_data_url"),
        };
      }
      try {
        const filePath = await saveDataUrl(
          data.dataUrl ?? data.data_url,
          typeof data.targetDir === "string"
            ? data.targetDir
            : typeof data.target_dir === "string"
              ? data.target_dir
              : null,
          typeof data.originalFilename === "string"
            ? data.originalFilename
            : typeof data.original_filename === "string"
              ? data.original_filename
              : null,
          {
            requireRenameEnabled:
              data.requireRenameEnabled === true
              || data.require_rename_enabled === true,
          },
        );
        return {
          success: true,
          message: filePath,
          data: withRequest(null),
        };
      } catch (error) {
        const errorMessage = String(error);
        return {
          success: false,
          message: errorMessage,
          data: withRequest(
            errorMessage.includes("rename_disabled")
              ? "rename_disabled"
              : "save_data_url_failed",
          ),
        };
      }
    }
    case "protected_image_resolution_result": {
      const correlationRequestId = normalizeOptionalString(
        data?.correlationRequestId ?? data?.correlation_request_id,
      );
      if (!correlationRequestId) {
        return {
          success: false,
          message: "Missing correlationRequestId",
          data: withRequest("missing_correlation_request_id"),
        };
      }

      const pending = takePendingProtectedImageRequest(correlationRequestId);
      if (!pending) {
        return {
          success: false,
          message: "Unknown protected image correlation request",
          data: withRequest("unknown_correlation_request"),
        };
      }

      pending.resolveResolution({
        success: data?.success === true,
        filePath: normalizeOptionalString(data?.filePath ?? data?.file_path),
        code: normalizeOptionalString(data?.code),
        error: normalizeOptionalString(data?.error),
      });
      return {
        success: true,
        message: "protected_image_resolution_received",
        data: withRequest(null),
      };
    }
    case "video_selected": {
      if (!data || typeof data !== "object") {
        return {
          success: false,
          message: "Missing data",
          data: withRequest("missing_data"),
        };
      }

      const url = normalizeOptionalString(data.url);
      if (!url) {
        return {
          success: false,
          message: "Missing url in data",
          data: withRequest("missing_url"),
        };
      }

      try {
        const syncedPreferences = await syncIncomingDownloadPreferences(data);
        const ack = await enqueueElectronVideoDownload({
          url,
          pageUrl: data.pageUrl,
          videoUrl: data.videoUrl,
          videoCandidates: data.videoCandidates,
          title: data.title,
          cookies: data.cookies,
          selectionScope: data.selectionScope,
          ytdlpQualityPreference:
            syncedPreferences?.quality
            ?? data.ytdlpQualityPreference
            ?? data.defaultVideoDownloadQuality,
        });
        return {
          success: true,
          message: "Download queued",
          data: withRequest(null, {
            traceId: ack.traceId,
          }),
        };
      } catch (error) {
        return {
          success: false,
          message: String(error),
          data: withRequest("queue_video_download_failed"),
        };
      }
    }
    default:
      return {
        success: false,
        message: `Unknown action: ${action}`,
        data: withRequest("unknown_action"),
      };
  }
}

async function handleCommand(command, payload = {}) {
  switch (command) {
    case "get_config":
      return readConfigString();
    case "save_config":
      await saveConfigString(String(payload.json ?? "{}"));
      return;
    case "broadcast_theme":
      await broadcastTheme(String(payload.theme ?? FALLBACK_THEME));
      return;
    case "open_current_output_folder":
      await openCurrentOutputFolder();
      return;
    case "begin_open_output_folder_from_context_menu":
      await beginOpenOutputFolderFromContextMenu();
      return;
    case "begin_pick_output_folder_from_context_menu":
      await beginPickOutputFolderFromContextMenu();
      return;
    case "get_autostart":
      return getAutostart();
    case "set_autostart":
      await setAutostart(Boolean(payload.enabled));
      return;
    case "get_current_shortcut": {
      const config = await readConfigObject();
      return typeof config.shortcut === "string" ? config.shortcut : "";
    }
    case "register_shortcut":
      await registerShortcut(String(payload.shortcut ?? ""));
      return;
    case "set_window_size": {
      const win = getWindow(WINDOW_LABELS.main);
      if (!win) {
        throw new Error("Window not found");
      }
      win.setSize(Number(payload.width ?? 200), Number(payload.height ?? 200));
      return;
    }
    case "set_window_position": {
      const win = getWindow(WINDOW_LABELS.main);
      if (!win) {
        throw new Error("Window not found");
      }
      win.setPosition(Number(payload.x ?? 0), Number(payload.y ?? 0));
      return;
    }
    case "open_folder":
      await shell.openPath(String(payload.path ?? ""));
      return;
    case "reset_rename_counter":
      return true;
    case "process_files":
      return processFiles(Array.isArray(payload.paths) ? payload.paths : [], payload.targetDir ?? null);
    case "download_image":
      return downloadImage(
        String(payload.url ?? ""),
        payload.targetDir ?? null,
        payload.originalFilename ?? null,
        payload.protectedImageFallback ?? null,
      );
    case "dev_ui_lab_apply_scenario":
      await applyUiLabScenario(String(payload.scenario ?? ""));
      return;
    case "save_data_url":
      return saveDataUrl(
        String(payload.dataUrl ?? ""),
        payload.targetDir ?? null,
        payload.originalFilename ?? null,
        {
          requireRenameEnabled: payload.requireRenameEnabled === true,
        },
      );
    case "get_clipboard_files":
      return getClipboardFilePaths();
    case "export_support_log":
      return exportSupportLog();
    case "get_runtime_dependency_status":
      return getRuntimeDependencyStatus();
    case "get_runtime_dependency_gate_state":
      return getRuntimeDependencyGateState();
    case "refresh_runtime_dependency_gate_state":
      return refreshRuntimeDependencyGateState();
    case "start_runtime_dependency_bootstrap":
      return startRuntimeDependencyBootstrap(normalizeOptionalString(payload.reason) ?? undefined);
    case "check_ytdlp_version":
      return checkYtdlpVersion();
    case "get_pinterest_downloader_info":
      return getPinterestDownloaderInfo();
    case "queue_video_download":
      return enqueueElectronVideoDownload(payload);
    case "cancel_download":
      return cancelVideoDownload(String(payload.traceId ?? ""));
    case "cancel_transcode":
    case "retry_transcode":
    case "remove_transcode":
      return false;
    case "update_ytdlp":
      return updateYtdlpBinary();
    default:
      throw new Error(`Unsupported Electron command: ${command}`);
  }
}

function registerIpcHandlers() {
  ipcMain.handle("flowselect:command:invoke", async (_event, request) => {
    return handleCommand(request.command, request.payload);
  });

  ipcMain.handle("flowselect:event:emit", async (_event, request) => {
    emitAppEvent(request.event, request.payload);
  });

  ipcMain.handle(VALIDATE_DROPPED_FOLDER_PATH_CHANNEL, async (_event, request) => (
    validateDroppedFolderPath({ path: request?.path })
  ));

  ipcMain.handle("flowselect:window:has", (_event, request) => {
    const win = getWindow(request.label);
    return Boolean(win && !win.isDestroyed());
  });

  ipcMain.handle("flowselect:window:focus", async (_event, request) => {
    const win = getWindow(request.label);
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  ipcMain.handle("flowselect:window:close", async (_event, request) => {
    const win = getWindow(request.label);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.handle("flowselect:window:open-settings", async (_event, request) => {
    await openSecondaryWindow(WINDOW_LABELS.settings, request.options);
  });

  ipcMain.handle("flowselect:window:open-context-menu", async (_event, request) => {
    await openSecondaryWindow(WINDOW_LABELS.contextMenu, request.options);
  });

  ipcMain.handle("flowselect:window:open-ui-lab", async (_event, request) => {
    assertUiLabEnabled();
    await openSecondaryWindow(WINDOW_LABELS.uiLab, request.options);
  });

  ipcMain.handle("flowselect:current-window:outer-position", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }
    const [x, y] = win.getPosition();
    return { x, y };
  });

  ipcMain.handle("flowselect:current-window:outer-size", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }
    const [width, height] = win.getSize();
    return { width, height };
  });

  ipcMain.handle("flowselect:current-window:scale-factor", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }
    const display = screen.getDisplayMatching(win.getBounds());
    return display.scaleFactor;
  });

  ipcMain.handle("flowselect:current-window:start-dragging", () => {
    return;
  });

  ipcMain.handle("flowselect:current-window:renderer-ready", (event) => {
    const resolveRendererReady = pendingRendererReadySignals.get(event.sender.id);
    void queueStartupDiagnostic("WindowDiag", "ipc:renderer-ready", {
      senderId: event.sender.id,
      url: event.sender.getURL(),
      matchedPendingWindow: Boolean(resolveRendererReady),
    });
    resolveRendererReady?.({
      url: event.sender.getURL(),
    });
  });

  ipcMain.on("flowselect:current-window:set-position", (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return;
    }

    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      return;
    }

    win.setPosition(Math.round(x), Math.round(y));
  });

  ipcMain.handle("flowselect:current-window:animate-bounds", async (event, request) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }

    const currentBounds = win.getBounds();
    await animateBrowserWindowBounds(win, {
      x: request?.bounds?.x ?? currentBounds.x,
      y: request?.bounds?.y ?? currentBounds.y,
      width: request?.bounds?.width ?? currentBounds.width,
      height: request?.bounds?.height ?? currentBounds.height,
    }, {
      durationMs: request?.options?.durationMs,
    });
  });

  ipcMain.handle("flowselect:current-window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.handle("flowselect:current-window:hide", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.hide();
  });

  ipcMain.handle("flowselect:system:current-monitor", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return null;
    }
    const display = screen.getDisplayMatching(win.getBounds());
    return {
      position: {
        x: display.bounds.x,
        y: display.bounds.y,
      },
      size: {
        width: display.workArea.width,
        height: display.workArea.height,
      },
      scaleFactor: display.scaleFactor,
    };
  });

  ipcMain.handle("flowselect:system:open-dialog", (event, request) =>
    openDialogForEvent(event, request.options));
  ipcMain.handle("flowselect:system:open-external", async (_event, request) => {
    await shell.openExternal(request.url);
  });
  ipcMain.handle("flowselect:system:relaunch", () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle("flowselect:clipboard:read-image", () => readClipboardImage());
  ipcMain.handle("flowselect:updater:check", () => checkForAppUpdate());
  ipcMain.handle("flowselect:updater:download-and-install", () =>
    downloadAndInstallAppUpdate());
}

function registerWsServer() {
  if (wsServer) {
    return wsServer;
  }

  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: WS_PORT,
  });
  wsServer = server;

  server.on("connection", (client) => {
    wsClients.add(client);
    client.send(JSON.stringify({ action: "request_download_preferences" }));

    client.on("message", async (message) => {
      const response = await handleWsMessage(message);
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(response));
      }
    });

    client.on("close", () => {
      wsClients.delete(client);
    });
    client.on("error", (error) => {
      wsClients.delete(client);
      console.error(">>> [WS] Client error:", error);
    });
  });

  server.on("listening", () => {
    logInfo("WS", "Server started", "ws://127.0.0.1:39527");
  });
  server.on("close", () => {
    wsServer = null;
  });
  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(">>> [WS] Server port already in use: 127.0.0.1:39527");
      return;
    }
    console.error(">>> [WS] Server error:", error);
  });

  return server;
}

async function bootstrap() {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    void showMainWindow();
  });

  app.on("will-quit", () => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();
    for (const task of activeVideoDownloads.values()) {
      task.cancelRequested = true;
      if (task.child && !task.child.killed) {
        task.child.kill("SIGTERM");
      }
    }
    for (const pending of pendingProtectedImageRequests.values()) {
      clearTimeout(pending.timeoutId);
      pending.rejectResolution(new Error("FlowSelect is shutting down"));
    }
    pendingProtectedImageRequests.clear();
    if (wsServer) {
      wsServer.close();
      wsServer = null;
    }
  });

  await app.whenReady();
  registerIpcHandlers();
  registerWsServer();
  await ensureUserDataDirs();
  if (startupDiagnosticsEnabled) {
    await writeFile(getStartupDiagnosticsPath(), "", "utf8");
    await queueStartupDiagnostic("StartupDiag", "bootstrap-environment", {
      appVersion: app.getVersion(),
      appName: app.getName(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      argv: process.argv.slice(1),
      forceOpaquePackagedWindow,
      userDataDir: getUserDataDir(),
      logsDir: getLogsDir(),
      configPath: getConfigPath(),
    });
  }
  await updateTrayMenu();
  await showMainWindow({
    preserveExistingBounds: process.platform === "win32",
  });
  if (startupDiagnosticsEnabled) {
    setTimeout(() => {
      void openSecondaryWindow(WINDOW_LABELS.settings, {
        title: "Settings",
        width: SETTINGS_WINDOW_WIDTH,
        height: SETTINGS_WINDOW_HEIGHT,
        alwaysOnTop: true,
        focus: true,
      }).catch((error) => {
        void queueStartupDiagnostic("WindowDiag", "settings:diagnostic-open-failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, STARTUP_DIAGNOSTIC_SETTINGS_OPEN_DELAY_MS);
  }
  await registerShortcutFromConfig();
}

void bootstrap().catch((error) => {
  console.error(">>> [Electron] Bootstrap failed:", error);
  app.exit(1);
});
