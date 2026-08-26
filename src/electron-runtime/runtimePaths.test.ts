import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bundledYtDlpBaselineRuntimePaths,
  inspectRuntimeBinaryPaths,
  inspectRuntimeDependencyStatus,
  resolveBundledYtDlpBaselineRoot,
  resolveRuntimeBinaryPaths,
} from "./runtimePaths";
import type { ElectronRuntimeEnvironment } from "./contracts";

const tempRoots: string[] = [];

const createEnvironment = (
  overrides: Partial<ElectronRuntimeEnvironment> = {},
): ElectronRuntimeEnvironment => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ameow-electron-runtime-"));
  tempRoots.push(root);
  return {
    repoRoot: root,
    configDir: path.join(root, "config"),
    platform: "win32",
    arch: "x64",
    ...overrides,
  };
};

const materializeBaselineMarker = (environment: ElectronRuntimeEnvironment): void => {
  const paths = bundledYtDlpBaselineRuntimePaths(environment);
  mkdirSync(path.dirname(paths.entrypoint), { recursive: true });
  writeFileSync(paths.entrypoint, "yt-dlp");
  writeFileSync(paths.readiness, "{}");
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime paths", () => {
  it("reports the committed baseline cache and shared managed tools as ready", () => {
    const environment = createEnvironment();
    const pythonDir = path.join(
      environment.repoRoot,
      "desktop-assets",
      "binaries",
      "python-x86_64-pc-windows-msvc",
    );
    const galleryDir = path.join(
      environment.configDir,
      "runtimes",
      "gallery-dl",
      "x86_64-pc-windows-msvc",
      "venv",
      "Scripts",
    );
    const ffmpegDir = path.join(environment.configDir, "runtimes", "ffmpeg", "x86_64-pc-windows-msvc", "real");
    const denoDir = path.join(environment.configDir, "runtimes", "deno", "x86_64-pc-windows-msvc", "real");
    mkdirSync(pythonDir, { recursive: true });
    mkdirSync(galleryDir, { recursive: true });
    mkdirSync(ffmpegDir, { recursive: true });
    mkdirSync(denoDir, { recursive: true });
    materializeBaselineMarker(environment);
    writeFileSync(path.join(pythonDir, "python.exe"), "python");
    writeFileSync(path.join(galleryDir, "gallery-dl.exe"), "gallery-dl");
    writeFileSync(path.join(ffmpegDir, "ffmpeg.exe"), "ffmpeg");
    writeFileSync(path.join(ffmpegDir, "ffprobe.exe"), "ffprobe");
    writeFileSync(path.join(denoDir, "deno.exe"), "deno");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.python).toMatchObject({ state: "ready", source: "bundled" });
    expect(snapshot.ytDlp).toMatchObject({ state: "ready", source: "bundled", expectedSource: "bundled" });
    expect(snapshot.galleryDl).toMatchObject({ state: "ready", source: "managed" });
    expect(snapshot.ffmpeg).toMatchObject({ state: "ready", source: "managed" });
    expect(snapshot.deno).toMatchObject({ state: "ready", source: "managed" });
  });

  it("reports a missing baseline cache without treating the old managed venv as a fallback", () => {
    const environment = createEnvironment();
    const oldManagedDir = path.join(
      environment.configDir,
      "runtimes",
      "yt-dlp",
      "x86_64-pc-windows-msvc",
      "venv",
      "Scripts",
    );
    mkdirSync(oldManagedDir, { recursive: true });
    writeFileSync(path.join(oldManagedDir, "yt-dlp.exe"), "old");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp).toMatchObject({ state: "missing", expectedSource: "bundled" });
    expect(snapshot.ytDlp.error).toContain("Missing bundled yt-dlp baseline");
  });

  it("keeps inspection pure while execution resolution only creates mutable shared-tool roots", () => {
    const environment = createEnvironment();
    const inspected = inspectRuntimeBinaryPaths(environment);
    const baseline = bundledYtDlpBaselineRuntimePaths(environment);

    expect(existsSync(environment.configDir)).toBe(false);
    expect(inspected.ytDlp).toBe(baseline.entrypoint);
    expect(resolveRuntimeBinaryPaths(environment)).toEqual(inspected);
    expect(existsSync(baseline.root)).toBe(false);
    expect(existsSync(path.join(environment.configDir, "runtimes", "gallery-dl"))).toBe(true);
    expect(existsSync(path.join(environment.configDir, "runtimes", "ffmpeg"))).toBe(true);
    expect(existsSync(path.join(environment.configDir, "runtimes", "deno"))).toBe(true);
  });

  it("discovers the packaged canonical wheel directory without writing to it", () => {
    const environment = createEnvironment({
      repoRoot: path.join(mkdtempSync(path.join(os.tmpdir(), "ameow-runtime-repo-")), "repo"),
      resourceDir: path.join(mkdtempSync(path.join(os.tmpdir(), "ameow-runtime-resource-")), "resources"),
    });
    const canonicalRoot = path.join(
      environment.resourceDir ?? "",
      "app",
      "desktop-assets",
      "binaries",
      "ytdlp-baseline",
    );
    mkdirSync(canonicalRoot, { recursive: true });
    writeFileSync(path.join(canonicalRoot, ".official-ytdlp-baseline.json"), "{}");

    expect(resolveBundledYtDlpBaselineRoot(environment)).toBe(canonicalRoot);
  });

  it("uses target-specific baseline paths on macOS", () => {
    const environment = createEnvironment({ platform: "darwin", arch: "arm64" });
    const baseline = bundledYtDlpBaselineRuntimePaths(environment);
    materializeBaselineMarker(environment);

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(baseline.entrypoint).toContain(path.join("yt-dlp", "aarch64-apple-darwin", "baseline", "venv", "bin", "yt-dlp"));
    expect(snapshot.ytDlp).toMatchObject({ state: "ready", source: "bundled", expectedSource: "bundled" });
  });
});
