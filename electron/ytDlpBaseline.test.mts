import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  readCommandVersionMock,
  runCapturedUtilityCommandMock,
  runUtilityCommandMock,
} = vi.hoisted(() => ({
  readCommandVersionMock: vi.fn(),
  runCapturedUtilityCommandMock: vi.fn(),
  runUtilityCommandMock: vi.fn(),
}));

vi.mock("./managedRuntimeBootstrap.mjs", () => ({
  assertPythonVersionSatisfiesManagedPackage: vi.fn(),
  currentManagedRuntimeTarget: () => "x86_64-pc-windows-msvc",
  managedDenoPath: (options: { configDir: string }) => join(
    options.configDir,
    "runtimes",
    "deno",
    "x86_64-pc-windows-msvc",
    "real",
    "deno.exe",
  ),
  managedFfmpegPaths: (options: { configDir: string }) => ({
    ffmpeg: join(options.configDir, "runtimes", "ffmpeg", "x86_64-pc-windows-msvc", "real", "ffmpeg.exe"),
    ffprobe: join(options.configDir, "runtimes", "ffmpeg", "x86_64-pc-windows-msvc", "real", "ffprobe.exe"),
  }),
  managedPythonVirtualenvArgs: (venvDir: string) => ["-m", "venv", venvDir],
  readCommandVersion: readCommandVersionMock,
  runCapturedUtilityCommand: runCapturedUtilityCommandMock,
  runUtilityCommand: runUtilityCommandMock,
  selectDenoRuntimeArtifactSpec: () => ({ version: "2.7.1", sha256: "deno-artifact" }),
  selectFfmpegRuntimeArtifactSpec: () => ({ version: "8.0.1", sha256: "ffmpeg-artifact" }),
  sha256Hex: async (filePath: string) => createHash("sha256").update(await readFile(filePath)).digest("hex"),
}));

import {
  createBundledYtDlpRuntimeBinding,
  ensureBundledYtDlpBaselineReady,
  inspectBundledYtDlpBaseline,
  verifyBundledYtDlpBaseline,
} from "./ytDlpBaseline.mjs";

const tempRoots: string[] = [];

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "ameow-ytdlp-baseline-"));
  tempRoots.push(root);
  const configDir = join(root, "userData");
  const binariesRoot = join(root, "binaries");
  const baselineRoot = join(binariesRoot, "ytdlp-baseline");
  const bundledPythonPath = join(root, "python.exe");
  const ytDlpWheel = "yt_dlp-2026.7.4-py3-none-any.whl";
  const ejsWheel = "yt_dlp_ejs-0.8.0-py3-none-any.whl";
  const ytDlpBytes = "yt-dlp-wheel";
  const ejsBytes = "yt-dlp-ejs-wheel";
  await mkdir(baselineRoot, { recursive: true });
  await Promise.all([
    writeFile(join(baselineRoot, ytDlpWheel), ytDlpBytes),
    writeFile(join(baselineRoot, ejsWheel), ejsBytes),
    writeFile(bundledPythonPath, "python"),
    writeFile(join(binariesRoot, ".official-python-runtimes.json"), JSON.stringify({
      runtimes: { "x86_64-pc-windows-msvc": { version: "3.13.0", sha256: "python-artifact" } },
    })),
  ]);
  await writeFile(join(baselineRoot, ".official-ytdlp-baseline.json"), JSON.stringify({
    schemaVersion: 1,
    layoutVersion: 1,
    packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0",
    packages: [
      {
        name: "yt-dlp",
        version: "2026.07.04",
        filename: ytDlpWheel,
        size: Buffer.byteLength(ytDlpBytes),
        sha256: sha256(ytDlpBytes),
        provenanceUrl: "https://pypi.org/pypi/yt-dlp/2026.07.04/json",
      },
      {
        name: "yt-dlp-ejs",
        version: "0.8.0",
        filename: ejsWheel,
        size: Buffer.byteLength(ejsBytes),
        sha256: sha256(ejsBytes),
        provenanceUrl: "https://pypi.org/pypi/yt-dlp-ejs/0.8.0/json",
      },
    ],
    minPython: [3, 10, 0],
    runtimeTargets: ["x86_64-pc-windows-msvc"],
    executionPolicy: {
      configIsolation: true,
      pluginDirs: "disabled",
      remoteComponents: "disabled",
      jsRuntime: "managed-deno-absolute-path",
    },
    probe: { args: ["--version"], expectedVersion: "2026.07.04" },
  }, null, 2));
  return { root, configDir, baselineRoot, bundledPythonPath };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const configureSuccessfulMaterialization = (fixture: Fixture) => {
  readCommandVersionMock.mockImplementation(async (entryPath: string) => (
    entryPath === fixture.bundledPythonPath ? "Python 3.13.0" : "2026.07.04"
  ));
  runCapturedUtilityCommandMock.mockResolvedValue({ stdout: "2026.7.4\n0.8.0\n", stderr: "" });
  runUtilityCommandMock.mockImplementation(async (_command: string, args: string[]) => {
    if (args[1] !== "venv") {
      return;
    }
    const venvDir = args[2] ?? "";
    const scriptsDir = join(venvDir, "Scripts");
    await mkdir(scriptsDir, { recursive: true });
    await Promise.all([
      writeFile(join(scriptsDir, "python.exe"), "python"),
      writeFile(join(scriptsDir, "yt-dlp.exe"), "yt-dlp"),
    ]);
  });
  return {
    configDir: fixture.configDir,
    platform: "win32" as NodeJS.Platform,
    arch: "x64" as NodeJS.Architecture,
    baselineRoot: fixture.baselineRoot,
    bundledPythonPath: fixture.bundledPythonPath,
  };
};

afterEach(async () => {
  readCommandVersionMock.mockReset();
  runCapturedUtilityCommandMock.mockReset();
  runUtilityCommandMock.mockReset();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("bundled yt-dlp baseline", () => {
  it("verifies exactly the app-owned package set and rejects a corrupt wheel", async () => {
    const fixture = await createFixture();

    await expect(verifyBundledYtDlpBaseline({
      baselineRoot: fixture.baselineRoot,
      platform: "win32",
      arch: "x64",
    })).resolves.toMatchObject({
      manifest: { packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0" },
      packages: [{ name: "yt-dlp" }, { name: "yt-dlp-ejs" }],
    });

    await writeFile(join(fixture.baselineRoot, "yt_dlp_ejs-0.8.0-py3-none-any.whl"), "corrupt");
    await expect(verifyBundledYtDlpBaseline({
      baselineRoot: fixture.baselineRoot,
      platform: "win32",
      arch: "x64",
    })).rejects.toThrow(/(size|checksum) mismatch/);
  });

  it("materializes offline, writes readiness last, and reuses a ready cache without network", async () => {
    const fixture = await createFixture();
    const options = configureSuccessfulMaterialization(fixture);

    const entrypoint = await ensureBundledYtDlpBaselineReady("test", options);
    const readinessPath = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "baseline", "baseline.json");

    expect(existsSync(entrypoint)).toBe(true);
    expect(existsSync(readinessPath)).toBe(true);
    expect(runUtilityCommandMock).toHaveBeenLastCalledWith(
      expect.stringContaining("python.exe"),
      expect.arrayContaining(["--no-index", "--require-hashes", "--no-deps"]),
      expect.objectContaining({ env: expect.objectContaining({ PIP_NO_INDEX: "1", PYTHONNOUSERSITE: "1" }) }),
    );
    expect(runUtilityCommandMock.mock.calls[1]?.[1]).toContain(fixture.baselineRoot);

    runUtilityCommandMock.mockClear();
    await expect(ensureBundledYtDlpBaselineReady("reuse", options)).resolves.toBe(entrypoint);
    expect(runUtilityCommandMock).not.toHaveBeenCalled();

    await rm(entrypoint);
    await expect(ensureBundledYtDlpBaselineReady("partial-cache-rebuild", options)).resolves.toBe(entrypoint);
    expect(runUtilityCommandMock).toHaveBeenCalled();

    runUtilityCommandMock.mockClear();
    await rm(readinessPath);
    await expect(ensureBundledYtDlpBaselineReady("missing-marker-rebuild", options)).resolves.toBe(entrypoint);
    expect(runUtilityCommandMock).toHaveBeenCalled();
  });

  it("rebuilds a marker-backed cache when its entrypoint or installed package state is corrupt", async () => {
    const fixture = await createFixture();
    const options = configureSuccessfulMaterialization(fixture);
    const entrypoint = await ensureBundledYtDlpBaselineReady("initial", options);
    const cachePython = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "baseline", "venv", "Scripts", "python.exe");

    readCommandVersionMock.mockImplementation(async (entryPath: string) => {
      if (entryPath === fixture.bundledPythonPath) {
        return "Python 3.13.0";
      }
      return entryPath === entrypoint ? "corrupt" : "2026.07.04";
    });
    runCapturedUtilityCommandMock.mockImplementation(async (pythonPath: string) => ({
      stdout: pythonPath === cachePython ? "broken\nbroken\n" : "2026.7.4\n0.8.0\n",
      stderr: "",
    }));
    runUtilityCommandMock.mockClear();

    await expect(ensureBundledYtDlpBaselineReady("corrupt-cache-rebuild", options)).resolves.toBe(entrypoint);
    expect(runUtilityCommandMock).toHaveBeenCalled();
  });

  it("fails closed instead of binding a marker-backed cache with corrupt executable/package state", async () => {
    const fixture = await createFixture();
    const options = configureSuccessfulMaterialization(fixture);
    const entrypoint = await ensureBundledYtDlpBaselineReady("initial", options);
    const cachePython = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "baseline", "venv", "Scripts", "python.exe");

    readCommandVersionMock.mockImplementation(async (entryPath: string) => (
      entryPath === fixture.bundledPythonPath ? "Python 3.13.0" : entryPath === entrypoint ? "corrupt" : "2026.07.04"
    ));
    runCapturedUtilityCommandMock.mockImplementation(async (pythonPath: string) => ({
      stdout: pythonPath === cachePython ? "broken\nbroken\n" : "2026.7.4\n0.8.0\n",
      stderr: "",
    }));

    await expect(createBundledYtDlpRuntimeBinding(options)).rejects.toThrow(
      "Bundled yt-dlp baseline is not ready for this runtime identity",
    );
  });

  it("inspects missing cache state without creating userData", async () => {
    const fixture = await createFixture();

    const inspection = await inspectBundledYtDlpBaseline({
      configDir: fixture.configDir,
      platform: "win32",
      arch: "x64",
      baselineRoot: fixture.baselineRoot,
      bundledPythonPath: fixture.bundledPythonPath,
    });

    expect(inspection).toMatchObject({
      manifest: { available: true, verified: true },
      cache: { materialized: false, identityMatches: false },
      selection: "bundled",
    });
    expect(existsSync(fixture.configDir)).toBe(false);
  });
});
