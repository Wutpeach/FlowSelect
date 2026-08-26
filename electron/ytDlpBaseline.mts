import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  bundledYtDlpBaselineRuntimePaths,
  type BundledYtDlpBaselineRuntimePaths,
} from "../src/electron-runtime/runtimePaths.js";
import {
  assertPythonVersionSatisfiesManagedPackage,
  currentManagedRuntimeTarget,
  managedDenoPath,
  managedFfmpegPaths,
  managedPythonVirtualenvArgs,
  readCommandVersion,
  runCapturedUtilityCommand,
  runUtilityCommand,
  selectDenoRuntimeArtifactSpec,
  selectFfmpegRuntimeArtifactSpec,
  sha256Hex,
  type ManagedRuntimeBootstrapOptions,
} from "./managedRuntimeBootstrap.mjs";
import { resolvePinnedManagedPythonPackage } from "./managedPythonPackageManifest.mjs";

const BASELINE_SCHEMA_VERSION = 1;
const BASELINE_LAYOUT_VERSION = 1;
const PYTHON_MANIFEST_FILE = ".official-python-runtimes.json";

type BaselinePackage = {
  name: string;
  version: string;
  filename: string;
  size: number;
  sha256: string;
  provenanceUrl: string;
};

type BaselineManifest = {
  schemaVersion: number;
  layoutVersion: number;
  packageSetId: string;
  packages: BaselinePackage[];
  minPython: [number, number, number];
  runtimeTargets: string[];
  executionPolicy: {
    configIsolation: boolean;
    pluginDirs: "disabled";
    remoteComponents: "disabled";
    jsRuntime: "managed-deno-absolute-path";
  };
  probe: { args: string[]; expectedVersion: string };
};

type VerifiedBaseline = {
  manifest: BaselineManifest;
  manifestDigest: string;
  packages: BaselinePackage[];
};

type BaselineReadiness = {
  schemaVersion: number;
  layoutVersion: number;
  packageSetId: string;
  manifestDigest: string;
  runtimeTarget: string;
  bundledPythonPath: string;
  bundledPythonVersion: string;
  pythonManifestEntryDigest: string;
  installedPackages: Record<string, string>;
  probeVersion: string;
};

export type YtDlpBaselineOptions = Pick<
  ManagedRuntimeBootstrapOptions,
  "configDir" | "platform" | "arch" | "bundledPythonPath" | "onActivity" | "log"
> & {
  baselineRoot: string;
};

export type BundledYtDlpRuntimeIdentity = {
  candidate: "bundled";
  runtimeSetId: string;
  manifestDigest: string;
  packageSetId: string;
  runtimeTarget: string;
  layoutVersion: number;
  ytDlp: Pick<BaselinePackage, "version" | "size" | "sha256">;
  ytDlpEjs: Pick<BaselinePackage, "version" | "size" | "sha256">;
  python: { version: string; target: string; manifestEntryDigest: string };
  mediaTools: {
    ffmpeg: { version: string; artifactSha256: string; observedSha256: string };
    ffprobe: { version: string; artifactSha256: string; observedSha256: string };
    deno: { version: string; artifactSha256: string; observedSha256: string };
  };
  observed: {
    ytDlpPath: string;
    pythonPath: string;
    ffmpegPath: string;
    ffprobePath: string;
    denoPath: string;
    probeVersion: string;
  };
};

export type BundledYtDlpRuntimeBinding = {
  binaries: { ytDlp: string; ffmpeg: string; deno: string };
  identity: BundledYtDlpRuntimeIdentity;
};

export type YtDlpBaselineInspection = {
  manifest: {
    available: boolean;
    verified: boolean;
    packageSetId: string | null;
    manifestDigest: string | null;
    ytDlpVersion: string | null;
    ejsVersion: string | null;
  };
  cache: {
    materialized: boolean;
    identityMatches: boolean;
    probeVersion: string | null;
  };
  selection: "bundled";
};

const normalizePackageName = (value: string): string => value.toLowerCase().replace(/[-_.]+/g, "-");

const digestText = (value: string): string => createHash("sha256").update(value).digest("hex");

const readJsonObject = async (filePath: string): Promise<Record<string, unknown> | null> => {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid bundled yt-dlp baseline ${label}`);
  }
  return value;
};

const requireNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid bundled yt-dlp baseline ${label}`);
  }
  return value;
};

const parseManifest = (raw: Record<string, unknown>): BaselineManifest => {
  const packages = Array.isArray(raw.packages) ? raw.packages.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid bundled yt-dlp baseline package ${index}`);
    }
    const value = entry as Record<string, unknown>;
    return {
      name: requireString(value.name, `packages[${index}].name`),
      version: requireString(value.version, `packages[${index}].version`),
      filename: requireString(value.filename, `packages[${index}].filename`),
      size: requireNumber(value.size, `packages[${index}].size`),
      sha256: requireString(value.sha256, `packages[${index}].sha256`),
      provenanceUrl: requireString(value.provenanceUrl, `packages[${index}].provenanceUrl`),
    };
  }) : [];
  const minPython = Array.isArray(raw.minPython) && raw.minPython.length === 3
    ? raw.minPython.map((entry) => requireNumber(entry, "minPython")) as [number, number, number]
    : null;
  const runtimeTargets = Array.isArray(raw.runtimeTargets)
    ? raw.runtimeTargets.map((entry) => requireString(entry, "runtimeTargets"))
    : [];
  const policy = raw.executionPolicy && typeof raw.executionPolicy === "object"
    ? raw.executionPolicy as Record<string, unknown>
    : null;
  const probe = raw.probe && typeof raw.probe === "object" ? raw.probe as Record<string, unknown> : null;
  if (!minPython || !policy || !probe || !Array.isArray(probe.args)) {
    throw new Error("Invalid bundled yt-dlp baseline manifest structure");
  }
  return {
    schemaVersion: requireNumber(raw.schemaVersion, "schemaVersion"),
    layoutVersion: requireNumber(raw.layoutVersion, "layoutVersion"),
    packageSetId: requireString(raw.packageSetId, "packageSetId"),
    packages,
    minPython,
    runtimeTargets,
    executionPolicy: {
      configIsolation: policy.configIsolation === true,
      pluginDirs: policy.pluginDirs as "disabled",
      remoteComponents: policy.remoteComponents as "disabled",
      jsRuntime: policy.jsRuntime as "managed-deno-absolute-path",
    },
    probe: {
      args: probe.args.map((entry) => requireString(entry, "probe.args")),
      expectedVersion: requireString(probe.expectedVersion, "probe.expectedVersion"),
    },
  };
};

const verifyManifestContract = (manifest: BaselineManifest, target: string): void => {
  const spec = resolvePinnedManagedPythonPackage("yt-dlp");
  const expectedSources = spec.installSources.map((source) => {
    const match = /^(.+)==(.+)$/.exec(source);
    if (!match) {
      throw new Error(`Invalid managed Python pin: ${source}`);
    }
    return { name: normalizePackageName(match[1]), version: match[2] };
  });
  const actualPackages = manifest.packages.map((entry) => ({
    name: normalizePackageName(entry.name),
    version: entry.version,
  }));
  if (
    manifest.schemaVersion !== BASELINE_SCHEMA_VERSION
    || manifest.layoutVersion !== BASELINE_LAYOUT_VERSION
    || manifest.packageSetId !== spec.packageSetId
    || JSON.stringify(actualPackages) !== JSON.stringify(expectedSources)
    || JSON.stringify(manifest.minPython) !== JSON.stringify(spec.minPython)
    || !manifest.runtimeTargets.includes(target)
    || manifest.executionPolicy.configIsolation !== true
    || manifest.executionPolicy.pluginDirs !== "disabled"
    || manifest.executionPolicy.remoteComponents !== "disabled"
    || manifest.executionPolicy.jsRuntime !== "managed-deno-absolute-path"
    || JSON.stringify(manifest.probe.args) !== JSON.stringify(["--version"])
    || manifest.probe.expectedVersion !== spec.packageVersion
  ) {
    throw new Error("Bundled yt-dlp baseline manifest does not match the app-owned package contract");
  }
};

export const verifyBundledYtDlpBaseline = async (
  options: Pick<YtDlpBaselineOptions, "baselineRoot" | "platform" | "arch">,
): Promise<VerifiedBaseline> => {
  const manifestPath = join(options.baselineRoot, ".official-ytdlp-baseline.json");
  const rawManifest = await readFile(manifestPath, "utf8").catch(() => {
    throw new Error(`Missing bundled yt-dlp baseline manifest: ${manifestPath}`);
  });
  const parsed = JSON.parse(rawManifest);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid bundled yt-dlp baseline manifest");
  }
  const manifest = parseManifest(parsed as Record<string, unknown>);
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  verifyManifestContract(manifest, target);
  for (const packageInfo of manifest.packages) {
    const filePath = join(options.baselineRoot, packageInfo.filename);
    const fileStat = await stat(filePath).catch(() => {
      throw new Error(`Missing bundled yt-dlp baseline wheel: ${packageInfo.filename}`);
    });
    if (fileStat.size !== packageInfo.size) {
      throw new Error(`Bundled yt-dlp baseline wheel size mismatch: ${packageInfo.filename}`);
    }
    const digest = await sha256Hex(filePath);
    if (digest !== packageInfo.sha256) {
      throw new Error(`Bundled yt-dlp baseline wheel checksum mismatch: ${packageInfo.filename}`);
    }
  }
  return {
    manifest,
    manifestDigest: digestText(rawManifest),
    packages: manifest.packages,
  };
};

const baselinePaths = (options: YtDlpBaselineOptions): BundledYtDlpBaselineRuntimePaths =>
  bundledYtDlpBaselineRuntimePaths(options);

const bundledPythonPathFrom = (options: YtDlpBaselineOptions): string => {
  if (!options.bundledPythonPath) {
    throw new Error("Bundled Python runtime path is missing from baseline options");
  }
  return options.bundledPythonPath;
};

const readPythonManifestEntryDigest = async (
  options: YtDlpBaselineOptions,
  target: string,
): Promise<string> => {
  const manifest = await readJsonObject(join(dirname(options.baselineRoot), PYTHON_MANIFEST_FILE));
  const runtimes = manifest?.runtimes;
  if (!runtimes || typeof runtimes !== "object" || Array.isArray(runtimes)) {
    throw new Error("Missing bundled Python runtime manifest entry for baseline identity");
  }
  const entry = (runtimes as Record<string, unknown>)[target];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Missing bundled Python runtime manifest entry for ${target}`);
  }
  return digestText(JSON.stringify(entry));
};

const readBaselineReadiness = async (paths: BundledYtDlpBaselineRuntimePaths): Promise<BaselineReadiness | null> => {
  const value = await readJsonObject(paths.readiness);
  if (!value) {
    return null;
  }
  const installedPackages = value.installedPackages;
  if (!installedPackages || typeof installedPackages !== "object" || Array.isArray(installedPackages)) {
    return null;
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : -1,
    layoutVersion: typeof value.layoutVersion === "number" ? value.layoutVersion : -1,
    packageSetId: typeof value.packageSetId === "string" ? value.packageSetId : "",
    manifestDigest: typeof value.manifestDigest === "string" ? value.manifestDigest : "",
    runtimeTarget: typeof value.runtimeTarget === "string" ? value.runtimeTarget : "",
    bundledPythonPath: typeof value.bundledPythonPath === "string" ? value.bundledPythonPath : "",
    bundledPythonVersion: typeof value.bundledPythonVersion === "string" ? value.bundledPythonVersion : "",
    pythonManifestEntryDigest: typeof value.pythonManifestEntryDigest === "string" ? value.pythonManifestEntryDigest : "",
    installedPackages: installedPackages as Record<string, string>,
    probeVersion: typeof value.probeVersion === "string" ? value.probeVersion : "",
  };
};

const normalizedInstalledVersion = (version: string): string => version.replace(
  /\d+/g,
  (part) => String(Number(part)),
);

const expectedPackages = (baseline: VerifiedBaseline): Record<string, string> => Object.fromEntries(
  baseline.packages.map((entry) => [
    normalizePackageName(entry.name),
    normalizedInstalledVersion(entry.version),
  ]),
);

const isReadinessCurrent = (
  readiness: BaselineReadiness | null,
  baseline: VerifiedBaseline,
  target: string,
  pythonPath: string,
  pythonVersion: string,
  pythonManifestEntryDigest: string,
  paths: BundledYtDlpBaselineRuntimePaths,
): boolean => (
  Boolean(readiness)
  && existsSync(paths.entrypoint)
  && existsSync(paths.python)
  && readiness!.schemaVersion === BASELINE_SCHEMA_VERSION
  && readiness!.layoutVersion === BASELINE_LAYOUT_VERSION
  && readiness!.packageSetId === baseline.manifest.packageSetId
  && readiness!.manifestDigest === baseline.manifestDigest
  && readiness!.runtimeTarget === target
  && readiness!.bundledPythonPath === pythonPath
  && readiness!.bundledPythonVersion === pythonVersion
  && readiness!.pythonManifestEntryDigest === pythonManifestEntryDigest
  && JSON.stringify(readiness!.installedPackages) === JSON.stringify(expectedPackages(baseline))
  && readiness!.probeVersion === baseline.manifest.probe.expectedVersion
);

const requirementsLock = (baseline: VerifiedBaseline): string => baseline.packages.map((entry) =>
  `${entry.name}==${entry.version} --hash=sha256:${entry.sha256}`,
).join("\n") + "\n";

const createStagingPaths = (
  root: string,
  platform: NodeJS.Platform,
): BundledYtDlpBaselineRuntimePaths => {
  const executableDir = join(root, "venv", platform === "win32" ? "Scripts" : "bin");
  return {
    root,
    venvDir: join(root, "venv"),
    python: join(executableDir, platform === "win32" ? "python.exe" : "python"),
    entrypoint: join(executableDir, platform === "win32" ? "yt-dlp.exe" : "yt-dlp"),
    readiness: join(root, "baseline.json"),
  };
};

const readInstalledPackageVersions = async (pythonPath: string): Promise<Record<string, string>> => {
  const result = await runCapturedUtilityCommand(pythonPath, [
    "-c",
    "import importlib.metadata as m; print(m.version('yt-dlp')); print(m.version('yt-dlp-ejs'))",
  ]);
  const values = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { "yt-dlp": values[0] ?? "", "yt-dlp-ejs": values[1] ?? "" };
};

const isMaterializedBaselineCurrent = async (
  readiness: BaselineReadiness | null,
  baseline: VerifiedBaseline,
  target: string,
  pythonPath: string,
  pythonVersion: string,
  pythonManifestEntryDigest: string,
  paths: BundledYtDlpBaselineRuntimePaths,
): Promise<boolean> => {
  if (!isReadinessCurrent(
    readiness,
    baseline,
    target,
    pythonPath,
    pythonVersion,
    pythonManifestEntryDigest,
    paths,
  )) {
    return false;
  }
  try {
    const [probeVersion, installedPackages] = await Promise.all([
      readCommandVersion(paths.entrypoint),
      readInstalledPackageVersions(paths.python),
    ]);
    return probeVersion === baseline.manifest.probe.expectedVersion
      && JSON.stringify(installedPackages) === JSON.stringify(expectedPackages(baseline));
  } catch {
    return false;
  }
};

const writeReadinessLast = async (
  paths: BundledYtDlpBaselineRuntimePaths,
  readiness: BaselineReadiness,
): Promise<void> => {
  const temporary = `${paths.readiness}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(readiness, null, 2)}\n`, "utf8");
  await rename(temporary, paths.readiness);
};

export const ensureBundledYtDlpBaselineReady = async (
  trigger: string,
  options: YtDlpBaselineOptions,
): Promise<string> => {
  const baseline = await verifyBundledYtDlpBaseline(options);
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  const pythonPath = bundledPythonPathFrom(options);
  const pythonVersion = await readCommandVersion(pythonPath);
  assertPythonVersionSatisfiesManagedPackage("yt-dlp", pythonVersion, baseline.manifest.minPython);
  const pythonManifestEntryDigest = await readPythonManifestEntryDigest(options, target);
  const paths = baselinePaths(options);
  const existing = await readBaselineReadiness(paths);
  if (await isMaterializedBaselineCurrent(
    existing,
    baseline,
    target,
    pythonPath,
    pythonVersion,
    pythonManifestEntryDigest,
    paths,
  )) {
    return paths.entrypoint;
  }

  options.log?.(`Materializing bundled yt-dlp baseline (${trigger})`);
  await options.onActivity?.({ component: "ytDlp", stage: "checking", downloadedBytes: null, totalBytes: null });
  const stagingRoot = `${paths.root}.staging-${randomUUID()}`;
  const staging = createStagingPaths(stagingRoot, options.platform);
  try {
    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingRoot, { recursive: true });
    await runUtilityCommand(pythonPath, managedPythonVirtualenvArgs(staging.venvDir));
    const lockPath = join(stagingRoot, ".requirements.txt");
    await writeFile(lockPath, requirementsLock(baseline), "utf8");
    await options.onActivity?.({ component: "ytDlp", stage: "installing", downloadedBytes: 1, totalBytes: 1 });
    await runUtilityCommand(staging.python, [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--no-index",
      "--find-links",
      options.baselineRoot,
      "--only-binary=:all:",
      "--require-hashes",
      "--no-deps",
      "--no-cache-dir",
      "-r",
      lockPath,
    ], {
      env: {
        ...process.env,
        PIP_NO_INDEX: "1",
        PYTHONNOUSERSITE: "1",
      },
    });
    if (!existsSync(staging.entrypoint) || !existsSync(staging.python)) {
      throw new Error("Bundled yt-dlp baseline entrypoint is missing after offline materialization");
    }
    await options.onActivity?.({ component: "ytDlp", stage: "verifying", downloadedBytes: 1, totalBytes: 1 });
    const [probeVersion, installedPackages] = await Promise.all([
      readCommandVersion(staging.entrypoint),
      readInstalledPackageVersions(staging.python),
    ]);
    if (probeVersion !== baseline.manifest.probe.expectedVersion) {
      throw new Error(`Bundled yt-dlp baseline version mismatch: expected ${baseline.manifest.probe.expectedVersion}, received ${probeVersion}`);
    }
    if (JSON.stringify(installedPackages) !== JSON.stringify(expectedPackages(baseline))) {
      throw new Error("Bundled yt-dlp baseline installed package set mismatch");
    }
    const readiness = {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      layoutVersion: BASELINE_LAYOUT_VERSION,
      packageSetId: baseline.manifest.packageSetId,
      manifestDigest: baseline.manifestDigest,
      runtimeTarget: target,
      bundledPythonPath: pythonPath,
      bundledPythonVersion: pythonVersion,
      pythonManifestEntryDigest,
      installedPackages,
      probeVersion,
    };
    await rm(paths.root, { recursive: true, force: true });
    await mkdir(paths.root, { recursive: true });
    await cp(staging.venvDir, paths.venvDir, { recursive: true });
    await writeReadinessLast(paths, readiness);
    await rm(stagingRoot, { recursive: true, force: true });
    return paths.entrypoint;
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
};

type VerifiedSharedExecutable = { digest: string; version: string };
const verifiedSharedExecutables = new Map<string, { fingerprint: string; value: VerifiedSharedExecutable }>();

export const invalidateVerifiedSharedRuntimeReadiness = (): void => {
  verifiedSharedExecutables.clear();
};

const verifySharedExecutable = async (
  label: string,
  executablePath: string,
  expectedVersion: string,
): Promise<VerifiedSharedExecutable> => {
  const details = await stat(executablePath).catch(() => {
    throw new Error(`Missing managed ${label} runtime: ${executablePath}`);
  });
  const fingerprint = `${details.size}:${details.mtimeMs}`;
  const cached = verifiedSharedExecutables.get(executablePath);
  if (cached?.fingerprint === fingerprint) {
    return cached.value;
  }
  const [digest, version] = await Promise.all([
    sha256Hex(executablePath),
    readCommandVersion(executablePath),
  ]);
  if (!version.includes(expectedVersion)) {
    throw new Error(`Managed ${label} version mismatch: expected ${expectedVersion}, received ${version}`);
  }
  const value = { digest, version };
  verifiedSharedExecutables.set(executablePath, { fingerprint, value });
  return value;
};

export const createBundledYtDlpRuntimeBinding = async (
  options: YtDlpBaselineOptions,
): Promise<BundledYtDlpRuntimeBinding> => {
  const baseline = await verifyBundledYtDlpBaseline(options);
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  const paths = baselinePaths(options);
  const pythonPath = bundledPythonPathFrom(options);
  const pythonVersion = await readCommandVersion(pythonPath);
  const pythonManifestEntryDigest = await readPythonManifestEntryDigest(options, target);
  const readiness = await readBaselineReadiness(paths);
  if (!await isMaterializedBaselineCurrent(
    readiness,
    baseline,
    target,
    pythonPath,
    pythonVersion,
    pythonManifestEntryDigest,
    paths,
  )) {
    throw new Error("Bundled yt-dlp baseline is not ready for this runtime identity");
  }
  const ffmpegPaths = managedFfmpegPaths(options);
  const denoPath = managedDenoPath(options);
  const ffmpegSpec = selectFfmpegRuntimeArtifactSpec(options);
  const denoSpec = selectDenoRuntimeArtifactSpec(options);
  const [ffmpeg, ffprobe, deno] = await Promise.all([
    verifySharedExecutable("ffmpeg", ffmpegPaths.ffmpeg, ffmpegSpec.version),
    verifySharedExecutable("ffprobe", ffmpegPaths.ffprobe, ffmpegSpec.version),
    verifySharedExecutable("deno", denoPath, denoSpec.version),
  ]);
  const byName = Object.fromEntries(baseline.packages.map((entry) => [normalizePackageName(entry.name), entry]));
  const ytDlp = byName["yt-dlp"];
  const ytDlpEjs = byName["yt-dlp-ejs"];
  if (!ytDlp || !ytDlpEjs) {
    throw new Error("Bundled yt-dlp baseline package set is incomplete");
  }
  const content = {
    candidate: "bundled",
    manifestDigest: baseline.manifestDigest,
    packageSetId: baseline.manifest.packageSetId,
    runtimeTarget: target,
    layoutVersion: baseline.manifest.layoutVersion,
    ytDlp: { version: ytDlp.version, size: ytDlp.size, sha256: ytDlp.sha256 },
    ytDlpEjs: { version: ytDlpEjs.version, size: ytDlpEjs.size, sha256: ytDlpEjs.sha256 },
    python: { version: pythonVersion, target, manifestEntryDigest: pythonManifestEntryDigest },
    mediaTools: {
      ffmpeg: { version: ffmpegSpec.version, artifactSha256: ffmpegSpec.sha256, observedSha256: ffmpeg.digest },
      ffprobe: { version: ffmpegSpec.version, artifactSha256: ffmpegSpec.sha256, observedSha256: ffprobe.digest },
      deno: { version: denoSpec.version, artifactSha256: denoSpec.sha256, observedSha256: deno.digest },
    },
  } as const;
  return {
    binaries: { ytDlp: paths.entrypoint, ffmpeg: ffmpegPaths.ffmpeg, deno: denoPath },
    identity: {
      ...content,
      runtimeSetId: digestText(JSON.stringify(content)),
      observed: {
        ytDlpPath: paths.entrypoint,
        pythonPath: paths.python,
        ffmpegPath: ffmpegPaths.ffmpeg,
        ffprobePath: ffmpegPaths.ffprobe,
        denoPath,
        probeVersion: readiness!.probeVersion,
      },
    },
  };
};

export const inspectBundledYtDlpBaseline = async (
  options: YtDlpBaselineOptions,
): Promise<YtDlpBaselineInspection> => {
  let baseline: VerifiedBaseline | null = null;
  try {
    baseline = await verifyBundledYtDlpBaseline(options);
  } catch {
    // Diagnostics observes a failed package check but never repairs it.
  }
  const readiness = await readBaselineReadiness(baselinePaths(options));
  const expected = baseline ? expectedPackages(baseline) : null;
  return {
    manifest: {
      available: baseline !== null,
      verified: baseline !== null,
      packageSetId: baseline?.manifest.packageSetId ?? null,
      manifestDigest: baseline?.manifestDigest ?? null,
      ytDlpVersion: baseline?.packages.find((entry) => normalizePackageName(entry.name) === "yt-dlp")?.version ?? null,
      ejsVersion: baseline?.packages.find((entry) => normalizePackageName(entry.name) === "yt-dlp-ejs")?.version ?? null,
    },
    cache: {
      materialized: Boolean(readiness && existsSync(baselinePaths(options).entrypoint)),
      identityMatches: Boolean(
        readiness
        && baseline
        && readiness.packageSetId === baseline.manifest.packageSetId
        && readiness.manifestDigest === baseline.manifestDigest
        && JSON.stringify(readiness.installedPackages) === JSON.stringify(expected),
      ),
      probeVersion: readiness?.probeVersion ?? null,
    },
    selection: "bundled",
  };
};
