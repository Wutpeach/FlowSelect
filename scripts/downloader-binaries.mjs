import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import http from "node:http";
import https from "node:https";
import { pipeline } from "node:stream/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(__dirname, "..");
export const binariesDir = join(repoRoot, "desktop-assets", "binaries");
const manifestPath = join(binariesDir, ".official-downloader-binaries.json");

const GITHUB_API_BASE = "https://api.github.com";

export const DOWNLOADER_TOOL_IDS = ["yt-dlp", "gallery-dl"];

const OFFICIAL_DOWNLOADER_SOURCES = {
  "yt-dlp": {
    releaseRepo: "yt-dlp/yt-dlp",
    assetNameByPlatform: {
      win32: "yt-dlp.exe",
      darwin: "yt-dlp_macos",
    },
  },
  "gallery-dl": {
    releaseRepo: "gdl-org/builds",
    assetNameByPlatform: {
      win32: "gallery-dl_windows.exe",
      darwin: "gallery-dl_macos",
    },
  },
};

export function parseArgs(argv) {
  const parsed = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  parsed._ = positional;
  return parsed;
}

export function resolveRuntimeTarget(platform = process.platform, arch = process.arch) {
  if (platform === "win32" && arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (platform === "darwin" && arch === "x64") {
    return "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported downloader binary platform: ${platform}-${arch}`);
}

export function executableExtensionFor(platform = process.platform) {
  return platform === "win32" ? ".exe" : "";
}

function resolvePlatformForTarget(target) {
  if (target.endsWith("-windows-msvc")) {
    return "win32";
  }
  if (target.endsWith("-apple-darwin")) {
    return "darwin";
  }
  throw new Error(`Unsupported downloader target triple: ${target}`);
}

export function resolveOutputBinaryName(toolId, target) {
  return `${toolId}-${target}${executableExtensionFor(resolvePlatformForTarget(target))}`;
}

export function resolveBinaryPath(toolId, target) {
  return join(binariesDir, resolveOutputBinaryName(toolId, target));
}

function galleryDlFallbackEligible(toolId, target) {
  return toolId === "gallery-dl" && target === "x86_64-apple-darwin";
}

function resolveAssetName(toolId, target) {
  const source = OFFICIAL_DOWNLOADER_SOURCES[toolId];
  if (!source) {
    throw new Error(`Unsupported downloader tool: ${toolId}`);
  }
  const platform = resolvePlatformForTarget(target);
  const assetName = source.assetNameByPlatform[platform];
  if (!assetName) {
    throw new Error(`No official asset configured for ${toolId} on ${platform}`);
  }
  return assetName;
}

function emptyManifest() {
  return {
    schemaVersion: 1,
    binaries: {},
  };
}

export async function readDownloaderManifest() {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.binaries === "object") {
      return parsed;
    }
  } catch {
    return emptyManifest();
  }
  return emptyManifest();
}

export async function writeDownloaderManifest(manifest) {
  await mkdir(binariesDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function manifestKey(toolId, target) {
  return `${toolId}:${target}`;
}

export function getManifestEntry(manifest, toolId, target) {
  return manifest?.binaries?.[manifestKey(toolId, target)] ?? null;
}

export function setManifestEntry(manifest, toolId, target, entry) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Cannot write downloader manifest entry into invalid manifest");
  }
  if (!manifest.binaries || typeof manifest.binaries !== "object") {
    manifest.binaries = {};
  }
  manifest.binaries[manifestKey(toolId, target)] = entry;
}

export async function fetchLatestRelease(toolId) {
  const source = OFFICIAL_DOWNLOADER_SOURCES[toolId];
  if (!source) {
    throw new Error(`Unsupported downloader tool: ${toolId}`);
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${source.releaseRepo}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "FlowSelect-downloader-bootstrap",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to resolve latest ${toolId} release: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

function pickReleaseAsset(toolId, target, release) {
  const assetName = resolveAssetName(toolId, target);
  const asset = Array.isArray(release?.assets)
    ? release.assets.find((candidate) => candidate?.name === assetName)
    : null;
  if (!asset?.browser_download_url) {
    throw new Error(
      `Official ${toolId} release ${release?.tag_name ?? "<unknown>"} does not expose asset ${assetName}`,
    );
  }
  return asset;
}

function requestModuleFor(url) {
  return url.startsWith("https:") ? https : http;
}

async function downloadToFileInternal(url, outputPath, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error(`Too many redirects while downloading ${url}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });

  await new Promise((resolvePromise, rejectPromise) => {
    const request = requestModuleFor(url).request(url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "FlowSelect-downloader-bootstrap",
      },
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = typeof response.headers.location === "string"
        ? new URL(response.headers.location, url).toString()
        : null;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        resolvePromise(downloadToFileInternal(location, outputPath, redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        rejectPromise(new Error(`Failed to download ${url}: ${statusCode}`));
        return;
      }

      pipeline(response, createWriteStream(outputPath)).then(resolvePromise, rejectPromise);
    });

    request.setTimeout(300_000, () => {
      request.destroy(new Error(`Timed out while downloading ${url}`));
    });
    request.on("error", rejectPromise);
    request.end();
  });
}

async function downloadToFile(url, outputPath) {
  if (process.platform === "win32") {
    const escapePowerShellLiteral = (value) => value.replace(/'/g, "''");
    const command = [
      "$ProgressPreference='SilentlyContinue'",
      `Invoke-WebRequest -Uri '${escapePowerShellLiteral(url)}' -OutFile '${escapePowerShellLiteral(outputPath)}' -UseBasicParsing`,
    ].join("; ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(`PowerShell download failed for ${url}`);
    }
    return;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await downloadToFileInternal(url, outputPath, 0);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= 3) {
        break;
      }
      await new Promise((resolveDelay) => {
        setTimeout(resolveDelay, attempt * 1000);
      });
    }
  }
  throw lastError ?? new Error(`Failed to download ${url}`);
}

async function replaceFile(targetPath, temporaryPath) {
  try {
    await unlink(targetPath).catch(() => undefined);
    await rename(temporaryPath, targetPath);
  } catch {
    await copyFile(temporaryPath, targetPath);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function pythonExecutableForVenv(venvDir, target) {
  return resolvePlatformForTarget(target) === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

function spawnChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...options.env,
    },
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function spawnCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stderr ?? ""}`.trim());
  }

  return result.stdout.trim();
}

function pipEnv() {
  return {
    ALL_PROXY: "",
    all_proxy: "",
    HTTP_PROXY: "",
    http_proxy: "",
    HTTPS_PROXY: "",
    https_proxy: "",
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
  };
}

async function buildGalleryDlFallbackBinary(target, binaryPath) {
  const buildRoot = join(repoRoot, "build", "gallery-dl-fallback", target);
  const distDir = join(buildRoot, "dist");
  const workDir = join(buildRoot, "work");
  const specDir = join(buildRoot, "spec");
  const venvDir = join(buildRoot, "venv");
  const binaryName = resolveOutputBinaryName("gallery-dl", target);

  await mkdir(buildRoot, { recursive: true });
  await rm(distDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
  await rm(specDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(workDir, { recursive: true });
  await mkdir(specDir, { recursive: true });

  const venvPython = pythonExecutableForVenv(venvDir, target);
  try {
    await stat(venvPython);
  } catch {
    spawnChecked("python3", ["-m", "venv", venvDir]);
  }

  spawnChecked(venvPython, ["-m", "pip", "install", "gallery-dl", "pyinstaller"], {
    env: pipEnv(),
  });

  const entryPoint = spawnCaptured(venvPython, [
    "-c",
    "import gallery_dl, os; print(os.path.join(os.path.dirname(gallery_dl.__file__), '__main__.py'))",
  ]);

  spawnChecked(venvPython, [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--distpath",
    distDir,
    "--workpath",
    workDir,
    "--specpath",
    specDir,
    "--name",
    binaryName,
    "--collect-submodules",
    "gallery_dl",
    "--collect-data",
    "gallery_dl",
    entryPoint,
  ]);

  const builtPath = join(distDir, binaryName);
  await stat(builtPath);
  await copyFile(builtPath, binaryPath);
  await chmod(binaryPath, 0o755);
}

export function smokeDownloaderBinary(entryPath) {
  const result = spawnSync(entryPath, ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `Binary smoke failed with code ${result.status} signal ${result.signal ?? "null"}${result.error ? ` error ${result.error.message}` : ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    );
  }

  const version = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!version) {
    throw new Error(`Binary smoke for ${entryPath} did not emit a version line`);
  }

  return version;
}

export async function ensureOfficialDownloaderBinary(toolId, target, options = {}) {
  const force = options.force === true;
  const binaryPath = resolveBinaryPath(toolId, target);
  const manifest = await readDownloaderManifest();
  const manifestEntry = getManifestEntry(manifest, toolId, target);

  if (!force && manifestEntry) {
    try {
      await stat(binaryPath);
      const version = smokeDownloaderBinary(binaryPath);
      return {
        toolId,
        target,
        path: binaryPath,
        state: "present",
        version,
        releaseTag: manifestEntry.releaseTag ?? null,
        assetName: manifestEntry.assetName ?? null,
      };
    } catch {
      // Fall through and replace the binary with a fresh official download.
    }
  }

  const release = await fetchLatestRelease(toolId);
  const asset = pickReleaseAsset(toolId, target, release);
  const tempPath = `${binaryPath}.download`;
  await downloadToFile(asset.browser_download_url, tempPath);
  await replaceFile(binaryPath, tempPath);
  if (resolvePlatformForTarget(target) !== "win32") {
    await chmod(binaryPath, 0o755);
  }
  let version;
  let source = "official-upstream";
  let releaseTag = release.tag_name ?? null;
  let releaseName = release.name ?? null;
  let releaseUrl = release.html_url ?? null;
  let assetName = asset.name ?? null;
  let assetUrl = asset.browser_download_url ?? null;
  let assetDigest = asset.digest ?? null;

  try {
    version = smokeDownloaderBinary(binaryPath);
  } catch (error) {
    if (!galleryDlFallbackEligible(toolId, target)) {
      throw error;
    }

    await buildGalleryDlFallbackBinary(target, binaryPath);
    version = smokeDownloaderBinary(binaryPath);
    source = "python-build-fallback";
    releaseName = "gallery-dl PyInstaller fallback";
    releaseUrl = null;
    assetName = null;
    assetUrl = null;
    assetDigest = null;
  }

  setManifestEntry(manifest, toolId, target, {
    toolId,
    target,
    path: binaryPath,
    outputName: resolveOutputBinaryName(toolId, target),
    source,
    releaseRepo: OFFICIAL_DOWNLOADER_SOURCES[toolId].releaseRepo,
    releaseTag,
    releaseName,
    releaseUrl,
    assetName,
    assetUrl,
    assetDigest,
    downloadedAt: new Date().toISOString(),
  });
  await writeDownloaderManifest(manifest);

  return {
    toolId,
    target,
    path: binaryPath,
    state: source === "official-upstream"
      ? (force ? "refreshed" : "downloaded")
      : "built_fallback",
    version,
    releaseTag,
    assetName,
  };
}
