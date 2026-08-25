import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ElectronRuntimeEnvironment,
  RuntimeBinaryPaths,
} from "./contracts.js";
import {
  denoBinaryNameFor,
  ffmpegBinaryNameFor,
  ffprobeBinaryNameFor,
  pythonBinaryNameFor,
  resolveRuntimeTarget,
} from "./platform.js";
import type {
  RuntimeDependencySource,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";
import type {
  GalleryDlRuntimeDependencies,
  SharedMediaRuntimeTools,
  YtDlpRuntimeDependencies,
} from "./engineExecutionContext.js";

const createStatusEntry = (
  state: "ready" | "missing",
  source: RuntimeDependencySource | null,
  entryPath: string | null,
  error: string | null,
  overrides: Partial<RuntimeDependencyStatusEntry> = {},
): RuntimeDependencyStatusEntry => ({
  state,
  source,
  path: entryPath,
  error,
  ...overrides,
});

const readyStatus = (
  entryPath: string,
  source: RuntimeDependencySource,
  overrides: Partial<RuntimeDependencyStatusEntry> = {},
): RuntimeDependencyStatusEntry => createStatusEntry("ready", source, entryPath, null, overrides);

const missingStatus = (
  error: string,
  overrides: Partial<RuntimeDependencyStatusEntry> = {},
): RuntimeDependencyStatusEntry =>
  createStatusEntry("missing", null, null, error, overrides);

const resolveBundledPythonRootCandidates = (
  environment: ElectronRuntimeEnvironment,
): string[] => {
  const target = resolveRuntimeTarget(environment.platform, environment.arch);
  return [
    path.join(environment.repoRoot, "desktop-assets", "binaries", `python-${target}`),
    ...(environment.resourceDir
      ? [
          path.join(environment.resourceDir, "binaries", `python-${target}`),
          path.join(environment.resourceDir, "app", "desktop-assets", "binaries", `python-${target}`),
        ]
      : []),
    ...(environment.executableDir
      ? [path.join(environment.executableDir, "binaries", `python-${target}`)]
      : []),
  ];
};

export const resolveBundledPythonExecutable = (
  pythonRoot: string,
  environment: Pick<ElectronRuntimeEnvironment, "platform">,
): string => (
  environment.platform === "win32"
    ? path.join(pythonRoot, pythonBinaryNameFor(environment.platform))
    : path.join(pythonRoot, "bin", pythonBinaryNameFor(environment.platform))
);

export const resolveBundledPythonRuntime = (
  environment: ElectronRuntimeEnvironment,
): {
  root: string;
  executable: string;
} => {
  const candidateRoots = resolveBundledPythonRootCandidates(environment);
  const existingRoot = candidateRoots.find((candidate) =>
    fileExists(resolveBundledPythonExecutable(candidate, environment)));
  const root = existingRoot ?? candidateRoots[0] ?? "";
  return {
    root,
    executable: resolveBundledPythonExecutable(root, environment),
  };
};

const runtimeRootPathFor = (
  environment: ElectronRuntimeEnvironment,
  componentId: string,
): string => {
  return path.join(
    environment.configDir,
    "runtimes",
    componentId,
    resolveRuntimeTarget(environment.platform, environment.arch),
  );
};

type ManagedFfmpegPaths = {
  root: string;
  ffmpeg: string;
  ffprobe: string;
};

type ManagedDenoPaths = {
  root: string;
  deno: string;
};

type ManagedPythonPackageRuntimePaths = {
  root: string;
  venvDir: string;
  python: string;
  entrypoint: string;
};

const ensureManagedRuntimeRoot = <T extends { root: string }>(paths: T): T => {
  mkdirSync(paths.root, { recursive: true });
  return paths;
};

const inspectManagedFfmpegPaths = (
  environment: ElectronRuntimeEnvironment,
): ManagedFfmpegPaths => {
  const root = runtimeRootPathFor(environment, "ffmpeg");
  const realRoot = environment.platform === "win32" ? path.join(root, "real") : root;
  return {
    root,
    ffmpeg: path.join(realRoot, ffmpegBinaryNameFor(environment.platform)),
    ffprobe: path.join(realRoot, ffprobeBinaryNameFor(environment.platform)),
  };
};

const inspectManagedDenoPaths = (environment: ElectronRuntimeEnvironment): ManagedDenoPaths => {
  const root = runtimeRootPathFor(environment, "deno");
  const realRoot = environment.platform === "win32" ? path.join(root, "real") : root;
  return {
    root,
    deno: path.join(realRoot, denoBinaryNameFor(environment.platform)),
  };
};

const managedFfmpegPathsFor = (
  environment: ElectronRuntimeEnvironment,
): ManagedFfmpegPaths => ensureManagedRuntimeRoot(inspectManagedFfmpegPaths(environment));

const managedDenoPathFor = (environment: ElectronRuntimeEnvironment): string =>
  ensureManagedRuntimeRoot(inspectManagedDenoPaths(environment)).deno;

const inspectManagedDenoPath = (environment: ElectronRuntimeEnvironment): string =>
  inspectManagedDenoPaths(environment).deno;

const managedYtDlpPathFor = (environment: ElectronRuntimeEnvironment): string => {
  return resolveManagedYtDlpRuntimePaths(environment).entrypoint;
};

const managedGalleryDlPathFor = (environment: ElectronRuntimeEnvironment): string =>
  resolveManagedGalleryDlRuntimePaths(environment).entrypoint;

export const resolveManagedYtDlpRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
): ManagedPythonPackageRuntimePaths => ensureManagedRuntimeRoot(
  inspectManagedYtDlpRuntimePaths(environment),
);

export const inspectManagedYtDlpRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
): ManagedPythonPackageRuntimePaths => inspectManagedPythonPackageRuntimePaths(
  environment,
  "yt-dlp",
  "yt-dlp",
);

export const resolveManagedGalleryDlRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
): ManagedPythonPackageRuntimePaths => ensureManagedRuntimeRoot(
  inspectManagedGalleryDlRuntimePaths(environment),
);

const inspectManagedPythonPackageRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
  componentId: "yt-dlp" | "gallery-dl",
  executableName: "yt-dlp" | "gallery-dl",
): ManagedPythonPackageRuntimePaths => {
  const root = runtimeRootPathFor(environment, componentId);
  const executableDir = path.join(
    root,
    "venv",
    environment.platform === "win32" ? "Scripts" : "bin",
  );
  return {
    root,
    venvDir: path.join(root, "venv"),
    python: path.join(executableDir, environment.platform === "win32" ? "python.exe" : "python"),
    entrypoint: path.join(
      executableDir,
      environment.platform === "win32" ? `${executableName}.exe` : executableName,
    ),
  };
};

export const inspectManagedGalleryDlRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
): ManagedPythonPackageRuntimePaths => inspectManagedPythonPackageRuntimePaths(
  environment,
  "gallery-dl",
  "gallery-dl",
);

const fileExists = (entryPath: string): boolean => {
  try {
    return existsSync(entryPath);
  } catch {
    return false;
  }
};

const resolveManagedStatus = (
  label: string,
  candidates: string[],
): RuntimeDependencyStatusEntry => {
  const allExist = candidates.every((candidate) => fileExists(candidate));
  if (allExist) {
    return readyStatus(candidates[0] ?? "", "managed");
  }
  return missingStatus(
    `Missing managed ${label} runtime. Expected ${JSON.stringify(candidates)}`,
  );
};

const resolveYtDlpStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusEntry => {
  const managedPath = inspectManagedYtDlpRuntimePaths(environment).entrypoint;

  if (fileExists(managedPath)) {
    return readyStatus(managedPath, "managed", {
      expectedSource: "managed",
    });
  }

  return missingStatus(
    `Missing managed yt-dlp runtime. Expected ${JSON.stringify([managedPath])}`,
    {
      expectedSource: "managed",
    },
  );
};

const resolvePythonStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusEntry => {
  const runtime = resolveBundledPythonRuntime(environment);
  if (runtime.root && fileExists(runtime.executable)) {
    return readyStatus(runtime.executable, "bundled", {
      expectedSource: "bundled",
    });
  }
  return createStatusEntry(
    "missing",
    null,
    runtime.executable || null,
    `Missing bundled Python runtime. Expected executable at ${runtime.executable}`,
    {
      expectedSource: "bundled",
    },
  );
};

const resolveYtDlpBinaryPath = (environment: ElectronRuntimeEnvironment): string => {
  const status = resolveYtDlpStatus(environment);
  if (status.path) {
    return status.path;
  }
  return managedYtDlpPathFor(environment);
};

/**
 * Pure path derivation for inspection surfaces. Unlike execution resolution,
 * this intentionally never creates a managed runtime root.
 */
export const inspectRuntimeBinaryPaths = (
  environment: ElectronRuntimeEnvironment,
): RuntimeBinaryPaths => {
  const ffmpegPaths = inspectManagedFfmpegPaths(environment);
  return {
    ytDlp: inspectManagedYtDlpRuntimePaths(environment).entrypoint,
    galleryDl: inspectManagedGalleryDlRuntimePaths(environment).entrypoint,
    ffmpeg: ffmpegPaths.ffmpeg,
    ffprobe: ffmpegPaths.ffprobe,
    deno: inspectManagedDenoPath(environment),
  };
};

export const resolveRuntimeBinaryPaths = (
  environment: ElectronRuntimeEnvironment,
): RuntimeBinaryPaths => {
  const ffmpegPaths = managedFfmpegPathsFor(environment);
  return {
    ytDlp: resolveYtDlpBinaryPath(environment),
    galleryDl: managedGalleryDlPathFor(environment),
    ffmpeg: ffmpegPaths.ffmpeg,
    ffprobe: ffmpegPaths.ffprobe,
    deno: managedDenoPathFor(environment),
  };
};

/** yt-dlp adapter dependencies: the yt-dlp executable plus shared tools it truly consumes. */
export const resolveYtDlpRuntimeDependencies = (
  environment: ElectronRuntimeEnvironment,
): YtDlpRuntimeDependencies => {
  const paths = resolveRuntimeBinaryPaths(environment);
  return {
    ytDlp: paths.ytDlp,
    ffmpeg: paths.ffmpeg,
    deno: paths.deno,
  };
};

/** gallery-dl adapter dependencies: only the gallery-dl executable. */
export const resolveGalleryDlRuntimeDependencies = (
  environment: ElectronRuntimeEnvironment,
): GalleryDlRuntimeDependencies => {
  const paths = resolveRuntimeBinaryPaths(environment);
  return { galleryDl: paths.galleryDl };
};

/** ffmpeg/ffprobe consumed explicitly by the transcode path, never by engines. */
export const resolveSharedMediaRuntimeTools = (
  environment: ElectronRuntimeEnvironment,
): SharedMediaRuntimeTools => {
  const paths = resolveRuntimeBinaryPaths(environment);
  return {
    ffmpeg: paths.ffmpeg,
    ffprobe: paths.ffprobe,
  };
};

export const inspectRuntimeDependencyStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusSnapshot => {
  const ffmpegPaths = inspectManagedFfmpegPaths(environment);
  const denoPath = inspectManagedDenoPath(environment);
  const galleryDlPaths = inspectManagedGalleryDlRuntimePaths(environment);

  return {
    python: resolvePythonStatus(environment),
    ytDlp: resolveYtDlpStatus(environment),
    galleryDl: fileExists(galleryDlPaths.entrypoint)
      ? readyStatus(galleryDlPaths.entrypoint, "managed", { expectedSource: "managed" })
      : missingStatus(`Missing managed gallery-dl runtime. Expected ${JSON.stringify([galleryDlPaths.entrypoint])}`, {
          expectedSource: "managed",
        }),
    ffmpeg: resolveManagedStatus("ffmpeg", [ffmpegPaths.ffmpeg, ffmpegPaths.ffprobe]),
    deno: resolveManagedStatus("deno", [denoPath]),
  };
};
