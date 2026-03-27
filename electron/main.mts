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
  shell,
  Tray,
} from "electron";
import { once } from "node:events";
import { createWriteStream, existsSync } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
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
  normalizeVideoCandidateUrls,
  normalizeRequiredVideoRouteUrl,
  normalizeVideoPageUrl,
  normalizeVideoHintUrl,
} from "./videoHintNormalization.mjs";
import {
  VALIDATE_DROPPED_FOLDER_PATH_CHANNEL,
  validateDroppedFolderPath,
} from "./folderDrop.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const WINDOW_LABELS = {
  main: "main",
  settings: "settings",
  contextMenu: "context-menu",
};

const FALLBACK_LANGUAGE = "en";
const FALLBACK_THEME = "black";
const WS_PORT = 39527;
const APP_RELEASES_URL = "https://github.com/Wutpeach/FlowSelect/releases";
const APP_UPDATE_ENDPOINT =
  "https://github.com/Wutpeach/FlowSelect/releases/latest/download/latest.json";
const DEFAULT_OUTPUT_FOLDER_NAME = "FlowSelect_Received";
const SHORTCUT_SHOW_EVENT = "shortcut-show";
const CONTEXT_MENU_CLOSED_EVENT = "context-menu-closed";
const LANGUAGE_CHANGED_EVENT = "language-changed";
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
const BINARY_DIR = join(repoRoot, "desktop-assets", "binaries");

let tray = null;
let registeredShortcut = "";
let pendingAppUpdate = null;
let nextOpaqueSequence = 1;
let isVideoQueuePumpScheduled = false;

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

const wsServer = new WebSocketServer({
  host: "127.0.0.1",
  port: WS_PORT,
});

function logInfo(scope, message, details) {
  if (details) {
    console.log(`>>> [${scope}] ${message}: ${details}`);
    return;
  }
  console.log(`>>> [${scope}] ${message}`);
}

function normalizeLanguage(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  if (normalized === "zh" || normalized.startsWith("zh-")) {
    return "zh-CN";
  }
  return null;
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
  return readFile(configPath, "utf8");
}

async function readConfigObject() {
  return parseJsonObject(await readConfigString());
}

function resolveLanguageFromConfigString(raw) {
  const config = parseJsonObject(raw);
  return normalizeLanguage(config.language) ?? FALLBACK_LANGUAGE;
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

  const nextLanguage = normalizeLanguage(parseJsonObject(raw).language);
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
    const response = await fetch(url);
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

async function buildRuntimeEntry(prefix) {
  const candidatePath = await resolveBundledBinary(prefix);
  if (candidatePath) {
    return {
      state: "ready",
      source: "bundled",
      path: candidatePath,
      error: null,
    };
  }

  return {
    state: "missing",
    source: null,
    path: null,
    error: null,
  };
}

async function getRuntimeDependencyStatus() {
  return {
    ytDlp: await buildRuntimeEntry("yt-dlp"),
    ffmpeg: await buildRuntimeEntry("ffmpeg"),
    deno: await buildRuntimeEntry("deno"),
    pinterestDownloader: await buildRuntimeEntry("pinterest-dl"),
  };
}

function updateRuntimeDependencyGateState(snapshot) {
  const missingComponents = [];
  if (snapshot.ffmpeg.state !== "ready") {
    missingComponents.push("ffmpeg");
  }
  if (snapshot.pinterestDownloader.state !== "ready") {
    missingComponents.push("pinterest-dl");
  }

  runtimeDependencyGateState.phase = missingComponents.length === 0 ? "ready" : "idle";
  runtimeDependencyGateState.missingComponents = missingComponents;
  runtimeDependencyGateState.updatedAtMs = nowTimestampMs();
  runtimeDependencyGateState.lastError = null;
  runtimeDependencyGateState.currentComponent = null;
  runtimeDependencyGateState.currentStage = null;
  runtimeDependencyGateState.progressPercent = null;
  runtimeDependencyGateState.downloadedBytes = null;
  runtimeDependencyGateState.totalBytes = null;
  runtimeDependencyGateState.nextComponent = missingComponents[0] ?? null;
  emitAppEvent("runtime-dependency-gate-state", { ...runtimeDependencyGateState });
  return { ...runtimeDependencyGateState };
}

async function getRuntimeDependencyGateState() {
  const snapshot = await getRuntimeDependencyStatus();
  return updateRuntimeDependencyGateState(snapshot);
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
    const response = await fetch(YTDLP_LATEST_RELEASE_API, {
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
  const response = await fetch(url, {
    headers: options.headers,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(destinationPath), { recursive: true });

  const total = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  const writable = createWriteStream(destinationPath);
  const reader = response.body.getReader();
  let downloaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
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
  } catch (error) {
    writable.destroy(error);
    throw error;
  }

  await new Promise((resolveWrite, rejectWrite) => {
    writable.once("error", rejectWrite);
    writable.end(() => {
      resolveWrite();
    });
  });
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
  const normalizedLanguage = normalizeLanguage(language) ?? FALLBACK_LANGUAGE;
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
  const candidates = [
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
    const ffmpegPath = await resolveBundledBinary("ffmpeg");
    const outputDir = await resolveCurrentOutputFolderPath();
    const formatProfile = resolveYtdlpFormatProfile(task.ytdlpQuality, Boolean(ffmpegPath));
    task.cookiesPath = await saveTempCookiesFile(task.cookies);
    const args = [
      "--newline",
      "--no-warnings",
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
          width: 420,
          height: 560,
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
  });
}

async function createMainWindow() {
  const existing = getWindow(WINDOW_LABELS.main);
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const preloadPath = join(__dirname, "preload.mjs");
  const mainWindow = new BrowserWindow({
    width: 200,
    height: 200,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  registerWindow(WINDOW_LABELS.main, mainWindow);
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  await mainWindow.loadURL(buildRendererRoute("/"));
  return mainWindow;
}

async function showMainWindow() {
  const mainWindow = await createMainWindow();
  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function showSecondaryWindow(win, options) {
  if (win.isDestroyed()) {
    return;
  }

  win.show();
  if (options.focus !== false) {
    win.focus();
  }
}

async function openSecondaryWindow(label, options) {
  const existing = getWindow(label);
  if (existing && !existing.isDestroyed()) {
    showSecondaryWindow(existing, options);
    return existing;
  }

  const preloadPath = join(__dirname, "preload.mjs");
  const browserWindow = new BrowserWindow({
    width: options.width,
    height: options.height,
    x: typeof options.x === "number" ? Math.round(options.x) : undefined,
    y: typeof options.y === "number" ? Math.round(options.y) : undefined,
    center: options.center === true,
    title: options.title,
    transparent: options.transparent !== false,
    frame: options.decorations === true,
    resizable: options.resizable === true,
    alwaysOnTop: options.alwaysOnTop !== false,
    skipTaskbar: options.skipTaskbar === true,
    parent: options.parent === "main" ? getWindow(WINDOW_LABELS.main) ?? undefined : undefined,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  registerWindow(label, browserWindow);
  browserWindow.once("ready-to-show", () => {
    showSecondaryWindow(browserWindow, options);
  });
  await browserWindow.loadURL(
    buildRendererRoute(label === WINDOW_LABELS.settings ? "/settings" : "/context-menu"),
  );
  if (!browserWindow.isVisible()) {
    showSecondaryWindow(browserWindow, options);
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
      mainWindow.setAlwaysOnTop(true);
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
    const response = await fetch(APP_UPDATE_ENDPOINT);
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
      return getRuntimeDependencyGateState();
    case "start_runtime_dependency_bootstrap":
      return getRuntimeDependencyGateState();
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
  wsServer.on("connection", (client) => {
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

  wsServer.on("listening", () => {
    logInfo("WS", "Server started", "ws://127.0.0.1:39527");
  });
  wsServer.on("error", (error) => {
    console.error(">>> [WS] Server error:", error);
  });
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
    wsServer.close();
  });

  await app.whenReady();
  registerIpcHandlers();
  registerWsServer();
  await ensureUserDataDirs();
  await createMainWindow();
  await updateTrayMenu();
  await registerShortcutFromConfig();
}

void bootstrap().catch((error) => {
  console.error(">>> [Electron] Bootstrap failed:", error);
  app.exit(1);
});
