import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ElectronRuntimeEnvironment,
  RuntimeBinaryPaths,
} from "./contracts";
import {
  denoBinaryNameFor,
  ffmpegBinaryNameFor,
  ffprobeBinaryNameFor,
  pinterestBinaryNameFor,
  resolveRuntimeTarget,
  ytDlpBinaryNameFor,
} from "./platform";
import type {
  RuntimeDependencySource,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies";

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

const existingCandidateOrFirst = (candidates: string[]): string | null =>
  candidates.find((candidate) => existsSync(candidate)) ?? firstCandidate(candidates);

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

const managedPinterestPathFor = (
  environment: ElectronRuntimeEnvironment,
): string =>
  path.join(
    runtimeRootFor(environment, "pinterest-dl"),
    pinterestBinaryNameFor(environment.platform, environment.arch),
  );

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
  return {
    ytDlp: existingCandidateOrFirst(
      resolveBundledCandidates(
        environment,
        ytDlpBinaryNameFor(environment.platform, environment.arch),
      ),
    ) ?? "",
    ffmpeg: ffmpegPaths.ffmpeg,
    ffprobe: ffmpegPaths.ffprobe,
    deno: managedDenoPathFor(environment),
    pinterestDownloader: managedPinterestPathFor(environment),
  };
};

export const inspectRuntimeDependencyStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusSnapshot => {
  const ytDlpCandidates = resolveBundledCandidates(
    environment,
    ytDlpBinaryNameFor(environment.platform, environment.arch),
  );
  const ffmpegPaths = managedFfmpegPathsFor(environment);
  const denoPath = managedDenoPathFor(environment);
  const pinterestPath = managedPinterestPathFor(environment);

  return {
    ytDlp: resolveBundledStatus("yt-dlp", ytDlpCandidates),
    ffmpeg: resolveManagedStatus("ffmpeg", [ffmpegPaths.ffmpeg, ffmpegPaths.ffprobe]),
    deno: resolveManagedStatus("deno", [denoPath]),
    pinterestDownloader: resolveManagedStatus("pinterest-dl", [pinterestPath]),
  };
};
