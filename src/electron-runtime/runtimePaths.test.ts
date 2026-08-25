import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectManagedGalleryDlRuntimePaths,
  inspectManagedYtDlpRuntimePaths,
  inspectRuntimeBinaryPaths,
  inspectRuntimeDependencyStatus,
  resolveManagedGalleryDlRuntimePaths,
  resolveManagedYtDlpRuntimePaths,
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

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("inspectRuntimeDependencyStatus", () => {
  it("marks bundled and managed paths as ready when files exist", () => {
    const environment = createEnvironment();
    const bundledPythonDir = path.join(
      environment.repoRoot,
      "desktop-assets",
      "binaries",
      "python-x86_64-pc-windows-msvc",
    );
    const ytDlpRealDir = path.join(
      environment.configDir,
      "runtimes",
      "yt-dlp",
      "x86_64-pc-windows-msvc",
      "venv",
      "Scripts",
    );
    const galleryDlScriptsDir = path.join(
      environment.configDir,
      "runtimes",
      "gallery-dl",
      "x86_64-pc-windows-msvc",
      "venv",
      "Scripts",
    );
    const ffmpegRealDir = path.join(
      environment.configDir,
      "runtimes",
      "ffmpeg",
      "x86_64-pc-windows-msvc",
      "real",
    );
    const denoRealDir = path.join(
      environment.configDir,
      "runtimes",
      "deno",
      "x86_64-pc-windows-msvc",
      "real",
    );
    mkdirSync(bundledPythonDir, { recursive: true });
    mkdirSync(ytDlpRealDir, { recursive: true });
    mkdirSync(galleryDlScriptsDir, { recursive: true });
    mkdirSync(ffmpegRealDir, { recursive: true });
    mkdirSync(denoRealDir, { recursive: true });

    writeFileSync(path.join(bundledPythonDir, "python.exe"), "binary");
    writeFileSync(path.join(ytDlpRealDir, "yt-dlp.exe"), "binary");
    writeFileSync(path.join(galleryDlScriptsDir, "gallery-dl.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffmpeg.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffprobe.exe"), "binary");
    writeFileSync(path.join(denoRealDir, "deno.exe"), "binary");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.python.state).toBe("ready");
    expect(snapshot.python.source).toBe("bundled");
    expect(snapshot.ytDlp.state).toBe("ready");
    expect(snapshot.ytDlp.source).toBe("managed");
    expect(snapshot.galleryDl.state).toBe("ready");
    expect(snapshot.galleryDl.source).toBe("managed");
    expect(snapshot.ffmpeg.state).toBe("ready");
    expect(snapshot.ffmpeg.source).toBe("managed");
    expect(snapshot.deno.state).toBe("ready");
  });

  it("marks missing runtimes with actionable errors", () => {
    const environment = createEnvironment();
    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.python.state).toBe("missing");
    expect(snapshot.python.error).toContain("Missing bundled Python runtime");
    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.error).toContain("Missing managed yt-dlp runtime");
    expect(snapshot.galleryDl.state).toBe("missing");
    expect(snapshot.galleryDl.error).toContain("Missing managed gallery-dl runtime");
    expect(snapshot.ffmpeg.state).toBe("missing");
    expect(snapshot.deno.state).toBe("missing");
  });

  it("inspects missing managed runtimes without creating their roots", () => {
    const environment = createEnvironment();

    expect(existsSync(environment.configDir)).toBe(false);
    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(existsSync(environment.configDir)).toBe(false);
  });

  it("shares pure managed path derivation with execution resolution, which alone creates roots", () => {
    const environment = createEnvironment();

    const inspected = inspectRuntimeBinaryPaths(environment);
    const inspectedYtDlp = inspectManagedYtDlpRuntimePaths(environment);
    const inspectedGalleryDl = inspectManagedGalleryDlRuntimePaths(environment);

    expect(existsSync(environment.configDir)).toBe(false);
    expect(resolveManagedYtDlpRuntimePaths(environment)).toEqual(inspectedYtDlp);
    expect(resolveManagedGalleryDlRuntimePaths(environment)).toEqual(inspectedGalleryDl);

    const resolved = resolveRuntimeBinaryPaths(environment);
    expect(resolved).toEqual(inspected);
    expect(existsSync(path.join(environment.configDir, "runtimes", "yt-dlp"))).toBe(true);
    expect(existsSync(path.join(environment.configDir, "runtimes", "gallery-dl"))).toBe(true);
    expect(existsSync(path.join(environment.configDir, "runtimes", "ffmpeg"))).toBe(true);
    expect(existsSync(path.join(environment.configDir, "runtimes", "deno"))).toBe(true);
  });

  it("resolves bundled Python from packaged Electron app resources layout", () => {
    const environment = createEnvironment({
      repoRoot: path.join(mkdtempSync(path.join(os.tmpdir(), "ameow-electron-runtime-packaged-")), "repo"),
      resourceDir: path.join(mkdtempSync(path.join(os.tmpdir(), "ameow-electron-runtime-packaged-resource-")), "resources"),
    });
    const packagedPythonDir = path.join(
      environment.resourceDir ?? "",
      "app",
      "desktop-assets",
      "binaries",
      "python-x86_64-pc-windows-msvc",
    );
    mkdirSync(packagedPythonDir, { recursive: true });
    writeFileSync(path.join(packagedPythonDir, "python.exe"), "binary");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.python.state).toBe("ready");
    expect(snapshot.python.source).toBe("bundled");
    expect(snapshot.python.path).toBe(path.join(packagedPythonDir, "python.exe"));
  });

  it("resolves macOS bundled downloader names without Windows extensions", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });
    const binariesDir = path.join(environment.repoRoot, "desktop-assets", "binaries");
    const bundledPythonDir = path.join(binariesDir, "python-aarch64-apple-darwin");
    const galleryDlDir = path.join(
      environment.configDir,
      "runtimes",
      "gallery-dl",
      "aarch64-apple-darwin",
      "venv",
      "bin",
    );
    const ffmpegDir = path.join(
      environment.configDir,
      "runtimes",
      "ffmpeg",
      "aarch64-apple-darwin",
    );
    const denoDir = path.join(
      environment.configDir,
      "runtimes",
      "deno",
      "aarch64-apple-darwin",
    );
    mkdirSync(binariesDir, { recursive: true });
    mkdirSync(path.join(bundledPythonDir, "bin"), { recursive: true });
    mkdirSync(galleryDlDir, { recursive: true });
    mkdirSync(ffmpegDir, { recursive: true });
    mkdirSync(denoDir, { recursive: true });

    writeFileSync(path.join(bundledPythonDir, "bin", "python3"), "binary");
    writeFileSync(path.join(galleryDlDir, "gallery-dl"), "binary");
    writeFileSync(path.join(ffmpegDir, "ffmpeg"), "binary");
    writeFileSync(path.join(ffmpegDir, "ffprobe"), "binary");
    writeFileSync(path.join(denoDir, "deno"), "binary");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.python.state).toBe("ready");
    expect(snapshot.python.source).toBe("bundled");
    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.source).toBeNull();
    expect(snapshot.ytDlp.expectedSource).toBe("managed");
    expect(snapshot.ytDlp.path).toBeNull();
    expect(snapshot.ytDlp.error).toContain("Missing managed yt-dlp runtime");
    expect(snapshot.galleryDl.state).toBe("ready");
    expect(snapshot.galleryDl.source).toBe("managed");
    expect(snapshot.galleryDl.path).toContain(path.join("gallery-dl", "aarch64-apple-darwin", "venv", "bin", "gallery-dl"));
    expect(snapshot.ffmpeg.path).toContain(path.join("ffmpeg", "aarch64-apple-darwin", "ffmpeg"));
    expect(snapshot.deno.path).toContain(path.join("deno", "aarch64-apple-darwin", "deno"));
  });

  it("prefers macOS managed yt-dlp when the managed runtime exists", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });
    const binariesDir = path.join(environment.repoRoot, "desktop-assets", "binaries");
    const bundledPythonDir = path.join(binariesDir, "python-aarch64-apple-darwin");
    const managedYtDlpDir = path.join(
      environment.configDir,
      "runtimes",
      "yt-dlp",
      "aarch64-apple-darwin",
      "venv",
      "bin",
    );
    mkdirSync(binariesDir, { recursive: true });
    mkdirSync(path.join(bundledPythonDir, "bin"), { recursive: true });
    mkdirSync(managedYtDlpDir, { recursive: true });

    writeFileSync(path.join(bundledPythonDir, "bin", "python3"), "bundled-python");
    writeFileSync(path.join(managedYtDlpDir, "yt-dlp"), "managed");

    const snapshot = inspectRuntimeDependencyStatus(environment);
    const binaries = resolveRuntimeBinaryPaths(environment);

    expect(snapshot.ytDlp.state).toBe("ready");
    expect(snapshot.ytDlp.source).toBe("managed");
    expect(snapshot.ytDlp.expectedSource).toBe("managed");
    expect(snapshot.ytDlp.path).toContain(path.join("yt-dlp", "aarch64-apple-darwin", "venv", "bin", "yt-dlp"));
    expect(snapshot.ytDlp.error).toBeNull();
    expect(binaries.ytDlp).toBe(snapshot.ytDlp.path);
  });

  it("reports macOS managed yt-dlp missing without bundled fallback semantics", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });

    const snapshot = inspectRuntimeDependencyStatus(environment);
    const binaries = resolveRuntimeBinaryPaths(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.source).toBeNull();
    expect(snapshot.ytDlp.expectedSource).toBe("managed");
    expect(snapshot.ytDlp.error).toContain("Missing managed yt-dlp runtime");
    expect(binaries.ytDlp).toContain(path.join("yt-dlp", "aarch64-apple-darwin", "venv", "bin", "yt-dlp"));
  });

  it("resolves macOS yt-dlp execution path to managed venv location even when missing", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });
    const bundledPythonDir = path.join(environment.repoRoot, "desktop-assets", "binaries", "python-aarch64-apple-darwin");
    mkdirSync(path.join(bundledPythonDir, "bin"), { recursive: true });
    writeFileSync(path.join(bundledPythonDir, "bin", "python3"), "bundled-python");

    const snapshot = inspectRuntimeDependencyStatus(environment);
    const binaries = resolveRuntimeBinaryPaths(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(binaries.ytDlp).toContain(path.join("yt-dlp", "aarch64-apple-darwin", "venv", "bin", "yt-dlp"));
  });
});
