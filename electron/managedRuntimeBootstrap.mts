import { once } from "node:events";
import { createWriteStream, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
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
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";

import {
  denoBinaryNameFor,
  ffmpegBinaryNameFor,
  ffprobeBinaryNameFor,
  resolveRuntimeTarget,
} from "../src/electron-runtime/platform.js";
import type { RuntimeDependencyManagedComponent } from "../src/types/runtimeDependencies.js";
import {
  resolvePinnedManagedPythonPackage,
  type ManagedPythonPackageSpec,
  type ManagedPythonPackageToolId,
} from "./managedPythonPackageManifest.mjs";
import {
  buildUnsupportedRouteError,
  scrubProxyEnvKeys,
} from "../src/electron-runtime/engineNetworkAdapters.js";
import {
  redactNetworkCredentials,
  toNetworkDiagnosticSnapshot,
  type NetworkRouteResolution,
} from "../src/config/networkRoute.js";

export { resolvePinnedManagedPythonPackage } from "./managedPythonPackageManifest.mjs";

/**
 * Bootstrap-owned execution context. Asset fetch and pip installs reuse the
 * shared NetworkRouteService/precedence but never a DownloadExecutionContext;
 * each bootstrap lifecycle resolves its own route for its concrete target.
 */
export type RuntimeBootstrapExecutionContext = {
  identity: string;
  createdAtMs: number;
  network: NetworkRouteResolution | null;
};

/** One collision-safe bootstrap-owned context per asset/pip lifecycle. */
export const createRuntimeBootstrapExecutionContext = (
  options: Pick<ManagedRuntimeBootstrapOptions, "now">,
): RuntimeBootstrapExecutionContext => ({
  identity: randomUUID(),
  createdAtMs: options.now?.() ?? Date.now(),
  network: null,
});

export type ManagedRuntimeStage = "checking" | "downloading" | "installing" | "verifying";

export type ManagedRuntimeActivity = {
  component: RuntimeDependencyManagedComponent;
  stage: ManagedRuntimeStage;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
};

export type ManagedRuntimeBootstrapOptions = {
  configDir: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  fetch: typeof fetch;
  /**
   * Route-aware Electron-session fetch for managed asset downloads. Receives
   * the bootstrap-owned route resolution and applies it to an isolated
   * session without mutating the shared default session or racing other
   * lifecycles. When absent, `fetch` is used and environment-sourced proxy
   * routes are reported as not applied.
   */
  fetchRouteAware?(input: {
    url: string;
    resolution: NetworkRouteResolution;
    identity: string;
    init?: RequestInit;
  }): Promise<Response>;
  bundledPythonRoot?: string;
  bundledPythonPath?: string;
  /**
   * Resolves one network route for a concrete bootstrap target (asset URL or
   * package index URL). The bootstrap owns its context lifecycle; it never
   * receives a DownloadExecutionContext.
   */
  resolveRoute?(targetUrl: string): Promise<NetworkRouteResolution>;
  log?(message: string): void;
  onActivity?(activity: ManagedRuntimeActivity): void | Promise<void>;
  now?(): number;
};

type RuntimeArtifactSpec = {
  component: RuntimeDependencyManagedComponent;
  target: string;
  downloadUrls: string[];
  sha256: string;
  size: number;
};

type ManagedPythonRuntimePaths = {
  root: string;
  venvDir: string;
  python: string;
  entrypoint: string;
  metadata: string;
};

const RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS = 30_000;
const managedPythonBootstrapPromises = new Map<ManagedPythonPackageToolId, Promise<string>>();
const managedBinaryBootstrapPromises = new Map<string, Promise<string>>();

export const currentManagedRuntimeTarget = (
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): string => resolveRuntimeTarget(platform, arch);

const managedBinaryBootstrapKey = (
  component: Extract<RuntimeDependencyManagedComponent, "deno" | "ffmpeg">,
  options: ManagedRuntimeBootstrapOptions,
): string => `${component}:${currentManagedRuntimeTarget(options.platform, options.arch)}`;

const runtimeRoot = (
  options: ManagedRuntimeBootstrapOptions,
  componentId: string,
): string => join(
  options.configDir,
  "runtimes",
  componentId,
  currentManagedRuntimeTarget(options.platform, options.arch),
);

export const managedDenoPath = (options: ManagedRuntimeBootstrapOptions): string => {
  const root = runtimeRoot(options, "deno");
  const realRoot = options.platform === "win32" ? join(root, "real") : root;
  return join(realRoot, denoBinaryNameFor(options.platform));
};

export const managedFfmpegPaths = (
  options: ManagedRuntimeBootstrapOptions,
): { ffmpeg: string; ffprobe: string } => {
  const root = runtimeRoot(options, "ffmpeg");
  const realRoot = options.platform === "win32" ? join(root, "real") : root;
  return {
    ffmpeg: join(realRoot, ffmpegBinaryNameFor(options.platform)),
    ffprobe: join(realRoot, ffprobeBinaryNameFor(options.platform)),
  };
};

export const managedYtDlpPaths = (
  options: ManagedRuntimeBootstrapOptions,
): {
  root: string;
  venvDir: string;
  python: string;
  ytDlp: string;
  metadata: string;
} => {
  const root = runtimeRoot(options, "yt-dlp");
  const venvDir = join(root, "venv");
  const venvRoot = options.platform === "win32" ? join(venvDir, "Scripts") : join(venvDir, "bin");
  return {
    root,
    venvDir,
    python: join(venvRoot, options.platform === "win32" ? "python.exe" : "python"),
    ytDlp: join(venvRoot, options.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"),
    metadata: join(root, "metadata.json"),
  };
};

export const managedGalleryDlPath = (options: ManagedRuntimeBootstrapOptions): string => {
  return managedGalleryDlPaths(options).entrypoint;
};

const managedGalleryDlPaths = (options: ManagedRuntimeBootstrapOptions): ManagedPythonRuntimePaths => {
  const root = runtimeRoot(options, "gallery-dl");
  const venvDir = join(root, "venv");
  const venvRoot = options.platform === "win32" ? join(venvDir, "Scripts") : join(venvDir, "bin");
  return {
    root,
    venvDir,
    python: join(venvRoot, options.platform === "win32" ? "python.exe" : "python"),
    entrypoint: join(venvRoot, options.platform === "win32" ? "gallery-dl.exe" : "gallery-dl"),
    metadata: join(root, "metadata.json"),
  };
};

const managedPythonRuntimePathsFor = (
  toolId: ManagedPythonPackageToolId,
  options: ManagedRuntimeBootstrapOptions,
): ManagedPythonRuntimePaths => {
  if (toolId === "yt-dlp") {
    const paths = managedYtDlpPaths(options);
    return {
      root: paths.root,
      venvDir: paths.venvDir,
      python: paths.python,
      entrypoint: paths.ytDlp,
      metadata: paths.metadata,
    };
  }
  if (toolId === "gallery-dl") {
    return managedGalleryDlPaths(options);
  }
  throw new Error(`Unsupported managed Python package tool: ${toolId}`);
};

const summarizeBootstrapError = (error: unknown): string => (
  redactNetworkCredentials(
    error instanceof Error && error.message ? error.message : String(error ?? "unknown error"),
  )
);

export type BootstrapRoutePolicy = { kind: "apply" } | { kind: "unsupported"; reason: string };

/**
 * Decides whether a bootstrap consumer can deterministically consume the
 * resolved route: pip accepts HTTP(S) only; asset fetch accepts every proxy
 * protocol and rejects complex routes. Unsupported routes fail typed before
 * spawn/fetch instead of being silently ignored.
 */
export const resolveBootstrapRoutePolicy = (
  resolution: NetworkRouteResolution | null,
  scope: "asset-fetch" | "pip-install",
): BootstrapRoutePolicy => {
  const route = resolution?.route;
  if (!route || route.mode === "direct") {
    return { kind: "apply" };
  }
  if (route.mode === "complex") {
    return { kind: "unsupported", reason: route.reason };
  }
  if (scope === "pip-install" && route.protocol !== "http" && route.protocol !== "https") {
    return { kind: "unsupported", reason: route.protocol };
  }
  return { kind: "apply" };
};

const sha256Hex = async (filePath: string): Promise<string> => {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
};

const verifyDownloadedRuntimeAsset = async (
  tempPath: string,
  expectedSize: number,
  expectedSha256: string,
  assetLabel: string,
): Promise<void> => {
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
};

const escapePowerShellLiteral = (value: string): string => value.replace(/'/g, "''");

const runUtilityCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
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

  await new Promise<void>((resolveProcess, rejectProcess) => {
    child.once("error", rejectProcess);
    child.once("close", (code) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      rejectProcess(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
};

const runCapturedUtilityCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
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

  await new Promise<void>((resolveProcess, rejectProcess) => {
    child.once("error", rejectProcess);
    child.once("close", (code) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      rejectProcess(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });

  return { stdout, stderr };
};

const parseVersionTuple = (value: string): [number, number, number] | null => {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersionTuples = (
  left: [number, number, number],
  right: [number, number, number],
): number => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > right[index]) {
      return 1;
    }
    if (left[index] < right[index]) {
      return -1;
    }
  }
  return 0;
};

const formatVersionTuple = (value: [number, number, number]): string =>
  `${value[0]}.${value[1]}.${value[2]}`;

export const managedPythonVirtualenvArgs = (venvDir: string): string[] => [
  "-m",
  "venv",
  venvDir,
];

export const assertPythonVersionSatisfiesManagedPackage = (
  toolId: ManagedPythonPackageToolId,
  pythonVersion: string,
  minPython: [number, number, number],
): void => {
  const parsed = parseVersionTuple(pythonVersion);
  if (!parsed) {
    throw new Error(`Unable to parse bundled Python version for ${toolId}: ${pythonVersion}`);
  }
  if (compareVersionTuples(parsed, minPython) < 0) {
    throw new Error(
      `Bundled Python ${formatVersionTuple(parsed)} is too old for ${toolId}; `
      + `requires Python ${formatVersionTuple(minPython)} or newer`,
    );
  }
};

const ensureManagedPythonVirtualenvReady = async (
  pythonPath: string,
  paths: ManagedPythonRuntimePaths,
): Promise<void> => {
  if (existsSync(paths.python)) {
    return;
  }
  await rm(paths.venvDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(paths.root, { recursive: true });
  await runUtilityCommand(pythonPath, managedPythonVirtualenvArgs(paths.venvDir));
};

const readCommandVersion = async (command: string): Promise<string> => {
  const { stdout, stderr } = await runCapturedUtilityCommand(command, ["--version"]);
  const firstLine = (stdout || stderr)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ?? "unknown";
};

const writeManagedPythonRuntimeMetadata = async (
  metadataPath: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  const tempDir = await mkdtemp(join(tmpdir(), "ameow-managed-python-metadata-"));
  const tempPath = join(tempDir, basename(metadataPath));
  try {
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await mkdir(dirname(metadataPath), { recursive: true });
    await replaceFile(metadataPath, tempPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const bundledPythonPathFrom = (
  options: ManagedRuntimeBootstrapOptions,
): string => {
  if (!options.bundledPythonPath) {
    throw new Error("Bundled Python runtime path is missing from bootstrap options");
  }
  return options.bundledPythonPath;
};

const bundledPythonVersionFrom = async (
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => readCommandVersion(bundledPythonPathFrom(options));

const readManagedPythonRuntimeMetadata = async (
  metadataPath: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const cleanupManagedPythonRuntimeRoot = async (
  rootDir: string,
): Promise<void> => {
  await rm(rootDir, { recursive: true, force: true }).catch(() => {});
};

const shouldRebuildManagedPythonRuntime = async (
  paths: ManagedPythonRuntimePaths,
  spec: ManagedPythonPackageSpec,
  options: ManagedRuntimeBootstrapOptions,
): Promise<boolean> => {
  if (!existsSync(paths.entrypoint)) {
    return true;
  }

  const metadata = await readManagedPythonRuntimeMetadata(paths.metadata);
  if (!metadata) {
    return true;
  }

  const metadataLayoutVersion = typeof metadata.layoutVersion === "number" ? metadata.layoutVersion : null;
  if (metadataLayoutVersion !== 1) {
    return true;
  }

  if (metadata.packageSetId !== spec.packageSetId) {
    return true;
  }

  if (metadata.packageVersion !== spec.packageVersion) {
    return true;
  }

  const bundledPythonVersion = await bundledPythonVersionFrom(options);
  if (metadata.bundledPythonVersion !== bundledPythonVersion) {
    return true;
  }

  const bundledPythonPath = bundledPythonPathFrom(options);
  if (metadata.bundledPythonPath !== bundledPythonPath) {
    return true;
  }

  if (spec.staleDirectories?.some((directoryName) => existsSync(join(paths.root, directoryName)))) {
    return true;
  }

  return false;
};

/**
 * Deterministic pip child environment: every ambient proxy key is scrubbed,
 * then the resolved HTTP(S) route (if any) is applied. SOCKS/complex routes
 * are never smuggled into env; callers fail typed before spawn instead.
 */
export const buildManagedPythonEnv = (
  paths: ManagedPythonRuntimePaths,
  resolution: NetworkRouteResolution | null = null,
): NodeJS.ProcessEnv => {
  const env = scrubProxyEnvKeys(process.env);
  const route = resolution?.route;
  if (route?.mode === "proxy" && (route.protocol === "http" || route.protocol === "https")) {
    env.HTTP_PROXY = route.proxyUrl;
    env.HTTPS_PROXY = route.proxyUrl;
    env.http_proxy = route.proxyUrl;
    env.https_proxy = route.proxyUrl;
  }
  env.PLAYWRIGHT_BROWSERS_PATH = join(paths.root, "playwright-browsers");
  env.PYTHONIOENCODING = "utf-8";
  env.PYTHONUTF8 = "1";
  return env;
};

const PIP_INDEX_TARGET_URL = "https://pypi.org/simple/";

const logBootstrapNetworkRoute = (
  options: ManagedRuntimeBootstrapOptions,
  resolution: NetworkRouteResolution,
  fetchApplied: boolean,
): void => {
  const snapshot = toNetworkDiagnosticSnapshot(resolution);
  options.log?.(
    `>>> [BootstrapNetwork] route: ${JSON.stringify({
      ...snapshot,
      appliedToFetch: fetchApplied,
    })}`,
  );
};

const extractZipArchive = async (
  archivePath: string,
  destinationPath: string,
  platform: NodeJS.Platform,
): Promise<void> => {
  await rm(destinationPath, { recursive: true, force: true });
  await mkdir(destinationPath, { recursive: true });

  if (platform === "win32") {
    const command = `Expand-Archive -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(destinationPath)}' -Force`;
    await runUtilityCommand("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      command,
    ]);
    return;
  }

  if (platform === "darwin") {
    await runUtilityCommand("/usr/bin/ditto", ["-x", "-k", archivePath, destinationPath]);
    return;
  }

  throw new Error(`Unsupported zip extraction platform: ${platform}`);
};

const findFileRecursive = async (
  rootDir: string,
  targetFileName: string,
): Promise<string | null> => {
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
};

export const downloadToFile = async (
  url: string,
  destinationPath: string,
  options: ManagedRuntimeBootstrapOptions & {
    bootstrapContext?: RuntimeBootstrapExecutionContext;
    timeoutMs?: number;
    timeoutErrorMessage?: string;
    headers?: Record<string, string>;
    onProgress?(progress: { downloaded: number; total: number }): void;
  },
): Promise<void> => {
  const rawTimeoutMs = options.timeoutMs;
  const timeoutMs = Number.isFinite(rawTimeoutMs) && rawTimeoutMs && rawTimeoutMs > 0
    ? rawTimeoutMs
    : null;
  const timeoutErrorMessage = options.timeoutErrorMessage
    ?? `Request timed out after ${Math.round((timeoutMs ?? 0) / 1000)}s`;
  const controller = timeoutMs ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  let writable: ReturnType<typeof createWriteStream> | null = null;

  const resetTimeout = (): void => {
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

  // Bootstrap-owned route resolution for this concrete asset URL. The
  // route-aware adapter applies the resolved route to an isolated Electron
  // session; complex routes fail typed before any request is issued. Without
  // the adapter, the shared-session fetch applies manual/system routes only,
  // and that non-application is recorded explicitly.
  let performFetch: ((init: RequestInit) => Promise<Response>) | null = null;
  let fetchRouteApplied: boolean | null = null;
  if (options.resolveRoute) {
    const resolution = await options.resolveRoute(url).catch((error) => {
      options.log?.(`>>> [BootstrapNetwork] asset route resolution failed: ${summarizeBootstrapError(error)}`);
      return null;
    });
    if (resolution) {
      const policy = resolveBootstrapRoutePolicy(resolution, "asset-fetch");
      if (policy.kind === "unsupported") {
        options.log?.(
          `>>> [BootstrapNetwork] asset route is unsupported (${policy.reason}); fetch aborted before request.`,
        );
        throw buildUnsupportedRouteError(resolution.route, "runtime-bootstrap asset fetch");
      }
      if (options.fetchRouteAware) {
        performFetch = (init) => options.fetchRouteAware!({
          url,
          resolution,
          identity: options.bootstrapContext?.identity ?? "runtime-bootstrap-assets",
          init,
        });
        fetchRouteApplied = true;
      } else {
        const route = resolution.route;
        fetchRouteApplied = route.mode !== "proxy"
          || route.source === "manual"
          || route.source === "system";
        if (!fetchRouteApplied) {
          options.log?.(
            ">>> [BootstrapNetwork] route-aware fetch adapter is unavailable; "
            + "environment-sourced proxy route is not applied to Electron session fetch.",
          );
        }
      }
      if (options.bootstrapContext) {
        options.bootstrapContext.network = resolution;
      }
      logBootstrapNetworkRoute(options, resolution, fetchRouteApplied);
    }
  }

  try {
    resetTimeout();
    const response = performFetch
      ? await performFetch({
          headers: options.headers,
          signal: controller?.signal,
        })
      : await options.fetch(url, {
          headers: options.headers,
          signal: controller?.signal,
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

    await new Promise<void>((resolveWrite, rejectWrite) => {
      writable?.once("error", rejectWrite);
      writable?.end(() => {
        resolveWrite();
      });
    });
  } catch (error) {
    const stream = writable;
    if (stream && !stream.destroyed) {
      await new Promise<void>((resolveWrite) => {
        stream.once("close", resolveWrite);
        stream.destroy();
      });
    }
    if (timedOut) {
      throw new Error(timeoutErrorMessage);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

export const replaceFile = async (targetPath: string, temporaryPath: string): Promise<void> => {
  try {
    await unlink(targetPath).catch(() => {});
    await rename(temporaryPath, targetPath);
  } catch {
    await copyFile(temporaryPath, targetPath);
    await unlink(temporaryPath).catch(() => {});
  }
};

const downloadRuntimeAssetWithFallbacks = async (
  downloadUrls: string[],
  expectedSize: number,
  expectedSha256: string,
  tempPath: string,
  componentId: RuntimeDependencyManagedComponent,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => {
  // One asset lifecycle = one bootstrap-owned context identity; every
  // fallback URL in this lifecycle shares it (each resolves its own route).
  const bootstrapContext = createRuntimeBootstrapExecutionContext(options);
  let lastError: unknown = null;
  const timeoutErrorMessage =
    `request timed out after ${Math.round(RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS / 1000)}s`;
  for (const downloadUrl of downloadUrls) {
    try {
      await rm(tempPath, { force: true });
      await downloadToFile(downloadUrl, tempPath, {
        ...options,
        bootstrapContext,
        timeoutMs: RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS,
        timeoutErrorMessage,
        onProgress: ({ downloaded, total }) => {
          void options.onActivity?.({
            component: componentId,
            stage: "downloading",
            downloadedBytes: downloaded,
            totalBytes: total > 0 ? total : expectedSize,
          });
        },
      });
      await options.onActivity?.({
        component: componentId,
        stage: "verifying",
        downloadedBytes: expectedSize,
        totalBytes: expectedSize,
      });
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
};

export const selectDenoRuntimeArtifactSpec = (
  options: Pick<ManagedRuntimeBootstrapOptions, "platform" | "arch">,
): RuntimeArtifactSpec => {
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
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
};

export const selectFfmpegRuntimeArtifactSpec = (
  options: Pick<ManagedRuntimeBootstrapOptions, "platform" | "arch">,
): RuntimeArtifactSpec => {
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
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
};

const ensureManagedPythonPackageReady = async (
  toolId: ManagedPythonPackageToolId,
  targetPath: string,
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string> => {
  const spec = resolvePinnedManagedPythonPackage(toolId);
  const paths = managedPythonRuntimePathsFor(toolId, options);
  const needsRebuild = options.forceReinstall
    ? true
    : await shouldRebuildManagedPythonRuntime(paths, spec, options);
  if (!needsRebuild && existsSync(targetPath)) {
    return targetPath;
  }

  const inFlight = managedPythonBootstrapPromises.get(toolId);
  if (inFlight) {
    return await inFlight;
  }

  const bootstrapPromise = (async (): Promise<string> => {
    options.log?.(`Bootstrapping managed ${toolId} runtime (${trigger})`);
    await options.onActivity?.({
      component: spec.component,
      stage: "checking",
      downloadedBytes: null,
      totalBytes: null,
    });
    const bundledPythonPath = bundledPythonPathFrom(options);
    const bundledPythonVersion = await bundledPythonVersionFrom(options);
    assertPythonVersionSatisfiesManagedPackage(toolId, bundledPythonVersion, spec.minPython);
    await cleanupManagedPythonRuntimeRoot(paths.root);
    await ensureManagedPythonVirtualenvReady(bundledPythonPath, paths);
    // Bootstrap-owned execution context: one route resolution for this
    // package install lifecycle; the route is never a DownloadExecutionContext.
    const context = createRuntimeBootstrapExecutionContext(options);
    context.network = options.resolveRoute
      ? await options.resolveRoute(PIP_INDEX_TARGET_URL).catch((error) => {
          options.log?.(`>>> [BootstrapNetwork] pip route resolution failed: ${summarizeBootstrapError(error)}`);
          return null;
        })
      : null;
    if (context.network) {
      logBootstrapNetworkRoute(options, context.network, false);
      const policy = resolveBootstrapRoutePolicy(context.network, "pip-install");
      if (policy.kind === "unsupported") {
        options.log?.(
          `>>> [BootstrapNetwork] pip cannot consume ${policy.reason} route; install aborted before pip spawn.`,
        );
        throw buildUnsupportedRouteError(context.network.route, "runtime-bootstrap pip install");
      }
    }
    await options.onActivity?.({
      component: spec.component,
      stage: "installing",
      downloadedBytes: 1,
      totalBytes: 1,
    });
    await runUtilityCommand(paths.python, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--disable-pip-version-check",
      "--no-cache-dir",
      ...spec.installSources,
    ], {
      env: buildManagedPythonEnv(paths, context.network),
    });
    if (!existsSync(targetPath)) {
      throw new Error(`Managed ${toolId} entrypoint is missing after install: ${targetPath}`);
    }
    if (options.platform !== "win32") {
      await chmod(targetPath, 0o755).catch(() => {});
      await chmod(paths.python, 0o755).catch(() => {});
    }
    await options.onActivity?.({
      component: spec.component,
      stage: "verifying",
      downloadedBytes: 1,
      totalBytes: 1,
    });
    const [version, pythonVersion] = await Promise.all([
      readCommandVersion(targetPath),
      readCommandVersion(paths.python),
    ]);
    const timestamp = options.now?.() ?? Date.now();
    await writeManagedPythonRuntimeMetadata(paths.metadata, {
      source: "managed-python-package",
      layoutVersion: 1,
      packageVersion: spec.packageVersion,
      packageSource: spec.installSource,
      packageSetId: spec.packageSetId,
      entrypoint: targetPath,
      pythonVersion,
      pythonPath: bundledPythonPath,
      bundledPythonPath,
      bundledPythonVersion,
      runtimeTarget: currentManagedRuntimeTarget(options.platform, options.arch),
      installedAtMs: timestamp,
      updatedAtMs: timestamp,
      version,
    });
    return targetPath;
  })();

  managedPythonBootstrapPromises.set(toolId, bootstrapPromise);
  try {
    return await bootstrapPromise;
  } finally {
    if (managedPythonBootstrapPromises.get(toolId) === bootstrapPromise) {
      managedPythonBootstrapPromises.delete(toolId);
    }
  }
};

export const ensureManagedDenoRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => {
  const targetPath = managedDenoPath(options);
  if (existsSync(targetPath)) {
    return targetPath;
  }

  const bootstrapKey = managedBinaryBootstrapKey("deno", options);
  const inFlight = managedBinaryBootstrapPromises.get(bootstrapKey);
  if (inFlight) {
    return await inFlight;
  }

  const bootstrapPromise = (async (): Promise<string> => {
    const artifact = selectDenoRuntimeArtifactSpec(options);
    const tempDir = await mkdtemp(join(tmpdir(), "ameow-deno-"));
    const archivePath = join(tempDir, "deno.zip");
    const extractDir = join(tempDir, "extract");
    const tempTargetPath = join(tempDir, basename(targetPath));

    try {
      options.log?.(`Bootstrapping managed deno runtime (${trigger})`);
      await downloadRuntimeAssetWithFallbacks(
        artifact.downloadUrls,
        artifact.size,
        artifact.sha256,
        archivePath,
        "deno",
        options,
      );
      await options.onActivity?.({
        component: "deno",
        stage: "installing",
        downloadedBytes: artifact.size,
        totalBytes: artifact.size,
      });
      await extractZipArchive(archivePath, extractDir, options.platform);
      const extractedBinaryPath = await findFileRecursive(extractDir, denoBinaryNameFor(options.platform));
      if (!extractedBinaryPath) {
        throw new Error(`Failed to find ${denoBinaryNameFor(options.platform)} inside managed deno archive`);
      }
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(extractedBinaryPath, tempTargetPath);
      if (options.platform !== "win32") {
        await chmod(tempTargetPath, 0o755);
      }
      await replaceFile(targetPath, tempTargetPath);
      return targetPath;
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  })();

  managedBinaryBootstrapPromises.set(bootstrapKey, bootstrapPromise);
  try {
    return await bootstrapPromise;
  } finally {
    if (managedBinaryBootstrapPromises.get(bootstrapKey) === bootstrapPromise) {
      managedBinaryBootstrapPromises.delete(bootstrapKey);
    }
  }
};

export const ensureManagedFfmpegRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => {
  const paths = managedFfmpegPaths(options);
  if (existsSync(paths.ffmpeg) && existsSync(paths.ffprobe)) {
    return paths.ffmpeg;
  }

  const bootstrapKey = managedBinaryBootstrapKey("ffmpeg", options);
  const inFlight = managedBinaryBootstrapPromises.get(bootstrapKey);
  if (inFlight) {
    return await inFlight;
  }

  const bootstrapPromise = (async (): Promise<string> => {
    const artifact = selectFfmpegRuntimeArtifactSpec(options);
    const tempDir = await mkdtemp(join(tmpdir(), "ameow-ffmpeg-"));
    const archivePath = join(tempDir, "ffmpeg.zip");
    const extractDir = join(tempDir, "extract");
    const tempFfmpegPath = join(tempDir, basename(paths.ffmpeg));
    const tempFfprobePath = join(tempDir, basename(paths.ffprobe));

    try {
      options.log?.(`Bootstrapping managed ffmpeg runtime (${trigger})`);
      await downloadRuntimeAssetWithFallbacks(
        artifact.downloadUrls,
        artifact.size,
        artifact.sha256,
        archivePath,
        "ffmpeg",
        options,
      );
      await options.onActivity?.({
        component: "ffmpeg",
        stage: "installing",
        downloadedBytes: artifact.size,
        totalBytes: artifact.size,
      });
      await extractZipArchive(archivePath, extractDir, options.platform);
      const extractedFfmpegPath = await findFileRecursive(extractDir, ffmpegBinaryNameFor(options.platform));
      const extractedFfprobePath = await findFileRecursive(extractDir, ffprobeBinaryNameFor(options.platform));
      if (!extractedFfmpegPath || !extractedFfprobePath) {
        throw new Error(
          `Failed to find ${ffmpegBinaryNameFor(options.platform)} and ${ffprobeBinaryNameFor(options.platform)} inside managed ffmpeg archive`,
        );
      }
      await mkdir(dirname(paths.ffmpeg), { recursive: true });
      await copyFile(extractedFfmpegPath, tempFfmpegPath);
      await copyFile(extractedFfprobePath, tempFfprobePath);
      if (options.platform !== "win32") {
        await chmod(tempFfmpegPath, 0o755);
        await chmod(tempFfprobePath, 0o755);
      }
      await replaceFile(paths.ffmpeg, tempFfmpegPath);
      await replaceFile(paths.ffprobe, tempFfprobePath);
      return paths.ffmpeg;
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  })();

  managedBinaryBootstrapPromises.set(bootstrapKey, bootstrapPromise);
  try {
    return await bootstrapPromise;
  } finally {
    if (managedBinaryBootstrapPromises.get(bootstrapKey) === bootstrapPromise) {
      managedBinaryBootstrapPromises.delete(bootstrapKey);
    }
  }
};

export const ensureManagedYtDlpRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string> => {
  const paths = managedYtDlpPaths(options);
  if (!options.forceReinstall && existsSync(paths.ytDlp)) {
    const spec = resolvePinnedManagedPythonPackage("yt-dlp");
    const genericPaths = managedPythonRuntimePathsFor("yt-dlp", options);
    const needsRebuild = await shouldRebuildManagedPythonRuntime(genericPaths, spec, options);
    if (!needsRebuild) {
      return paths.ytDlp;
    }
  }

  return await ensureManagedPythonPackageReady(
    "yt-dlp",
    paths.ytDlp,
    trigger,
    options,
  );
};

export const ensureManagedGalleryDlRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string> => {
  const targetPath = managedGalleryDlPath(options);
  if (!options.forceReinstall && existsSync(targetPath)) {
    const spec = resolvePinnedManagedPythonPackage("gallery-dl");
    const paths = managedGalleryDlPaths(options);
    const needsRebuild = await shouldRebuildManagedPythonRuntime(paths, spec, options);
    if (!needsRebuild) {
      return targetPath;
    }
  }

  return await ensureManagedPythonPackageReady(
    "gallery-dl",
    targetPath,
    trigger,
    options,
  );
};
