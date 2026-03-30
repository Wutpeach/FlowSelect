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
  galleryDlBinaryNameFor,
  galleryDlSystemBinaryNameFor,
  resolveRuntimeTarget,
  ytDlpBinaryNameFor,
} from "./platform.js";
import type {
  RuntimeDependencySource,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";

const createStatusEntry = (
  state: "ready" | "missing",
  source: RuntimeDependencySource | null,
  entryPath: string | null,
  error: string | null,
): RuntimeDependencyStatusEntry => ({
  state,
  source,
  path: entryPath,
  error,
});

const readyStatus = (
  entryPath: string,
  source: RuntimeDependencySource,
): RuntimeDependencyStatusEntry => createStatusEntry("ready", source, entryPath, null);

const missingStatus = (error: string): RuntimeDependencyStatusEntry =>
  createStatusEntry("missing", null, null, error);

const firstCandidate = (candidates: string[]): string | null => candidates[0] ?? null;

const existingCandidate = (candidates: string[]): string | null =>
  candidates.find((candidate) => existsSync(candidate)) ?? null;

const existingCandidateOrFirst = (candidates: string[]): string | null =>
  existingCandidate(candidates) ?? firstCandidate(candidates);

const resolveSystemPathCandidate = (
  commandName: string,
): string | null => {
  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, commandName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const resolveBundledCandidates = (
  environment: ElectronRuntimeEnvironment,
  fileName: string,
): string[] => {
  const candidates = [
    path.join(environment.repoRoot, "desktop-assets", "binaries", fileName),
  ];
  if (environment.resourceDir) {
    candidates.push(path.join(environment.resourceDir, "binaries", fileName));
  }
  if (environment.executableDir) {
    candidates.push(path.join(environment.executableDir, "binaries", fileName));
  }
  return candidates;
};

const runtimeRootFor = (
  environment: ElectronRuntimeEnvironment,
  componentId: string,
): string => {
  const root = path.join(
    environment.configDir,
    "runtimes",
    componentId,
    resolveRuntimeTarget(environment.platform, environment.arch),
  );
  mkdirSync(root, { recursive: true });
  return root;
};

const managedFfmpegPathsFor = (
  environment: ElectronRuntimeEnvironment,
): { ffmpeg: string; ffprobe: string } => {
  const root = runtimeRootFor(environment, "ffmpeg");
  const realRoot = environment.platform === "win32" ? path.join(root, "real") : root;
  return {
    ffmpeg: path.join(realRoot, ffmpegBinaryNameFor(environment.platform)),
    ffprobe: path.join(realRoot, ffprobeBinaryNameFor(environment.platform)),
  };
};

const managedDenoPathFor = (environment: ElectronRuntimeEnvironment): string => {
  const root = runtimeRootFor(environment, "deno");
  const realRoot = environment.platform === "win32" ? path.join(root, "real") : root;
  return path.join(realRoot, denoBinaryNameFor(environment.platform));
};

const resolveBundledStatus = (
  label: string,
  candidates: string[],
): RuntimeDependencyStatusEntry => {
  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (resolved) {
    return readyStatus(resolved, "bundled");
  }
  return missingStatus(
    `Missing bundled ${label} runtime. Checked ${JSON.stringify(candidates)}`,
  );
};

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

export const resolveRuntimeBinaryPaths = (
  environment: ElectronRuntimeEnvironment,
): RuntimeBinaryPaths => {
  const ffmpegPaths = managedFfmpegPathsFor(environment);
  const galleryDlBundledCandidates = resolveBundledCandidates(
    environment,
    galleryDlBinaryNameFor(environment.platform, environment.arch),
  );
  const galleryDlSystemCandidate = resolveSystemPathCandidate(
    galleryDlSystemBinaryNameFor(environment.platform),
  );
  const resolvedGalleryDl = existingCandidate(galleryDlBundledCandidates)
    ?? galleryDlSystemCandidate
    ?? firstCandidate(galleryDlBundledCandidates);
  return {
    ytDlp: existingCandidateOrFirst(
      resolveBundledCandidates(
        environment,
        ytDlpBinaryNameFor(environment.platform, environment.arch),
      ),
    ) ?? "",
    galleryDl: resolvedGalleryDl ?? "",
    ffmpeg: ffmpegPaths.ffmpeg,
    ffprobe: ffmpegPaths.ffprobe,
    deno: managedDenoPathFor(environment),
  };
};

export const inspectRuntimeDependencyStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusSnapshot => {
  const ytDlpCandidates = resolveBundledCandidates(
    environment,
    ytDlpBinaryNameFor(environment.platform, environment.arch),
  );
  const galleryDlBundledCandidates = resolveBundledCandidates(
    environment,
    galleryDlBinaryNameFor(environment.platform, environment.arch),
  );
  const galleryDlSystemCandidate = resolveSystemPathCandidate(
    galleryDlSystemBinaryNameFor(environment.platform),
  );
  const ffmpegPaths = managedFfmpegPathsFor(environment);
  const denoPath = managedDenoPathFor(environment);
  const galleryDlPath = existingCandidate(galleryDlBundledCandidates)
    ?? galleryDlSystemCandidate;

  return {
    ytDlp: resolveBundledStatus("yt-dlp", ytDlpCandidates),
    galleryDl: galleryDlPath
      ? readyStatus(
          galleryDlPath,
          galleryDlBundledCandidates.includes(galleryDlPath) ? "bundled" : "system_path",
        )
      : missingStatus(
          `Missing gallery-dl runtime. Checked bundled ${JSON.stringify(galleryDlBundledCandidates)} and PATH`,
        ),
    ffmpeg: resolveManagedStatus("ffmpeg", [ffmpegPaths.ffmpeg, ffmpegPaths.ffprobe]),
    deno: resolveManagedStatus("deno", [denoPath]),
  };
};
