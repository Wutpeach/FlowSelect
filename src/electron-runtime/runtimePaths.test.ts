import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectRuntimeDependencyStatus } from "./runtimePaths";
import type { ElectronRuntimeEnvironment } from "./contracts";

const tempRoots: string[] = [];

const createEnvironment = (
  overrides: Partial<ElectronRuntimeEnvironment> = {},
): ElectronRuntimeEnvironment => {
  const root = mkdtempSync(path.join(os.tmpdir(), "flowselect-electron-runtime-"));
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
    const binariesDir = path.join(environment.repoRoot, "desktop-assets", "binaries");
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
    mkdirSync(binariesDir, { recursive: true });
    mkdirSync(ffmpegRealDir, { recursive: true });
    mkdirSync(denoRealDir, { recursive: true });

    writeFileSync(path.join(binariesDir, "yt-dlp-x86_64-pc-windows-msvc.exe"), "binary");
    writeFileSync(path.join(binariesDir, "gallery-dl-x86_64-pc-windows-msvc.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffmpeg.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffprobe.exe"), "binary");
    writeFileSync(path.join(denoRealDir, "deno.exe"), "binary");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("ready");
    expect(snapshot.ytDlp.source).toBe("bundled");
    expect(snapshot.galleryDl.state).toBe("ready");
    expect(snapshot.galleryDl.source).toBe("bundled");
    expect(snapshot.ffmpeg.state).toBe("ready");
    expect(snapshot.ffmpeg.source).toBe("managed");
    expect(snapshot.deno.state).toBe("ready");
  });

  it("marks missing runtimes with actionable errors", () => {
    const environment = createEnvironment();
    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.error).toContain("Missing bundled yt-dlp runtime");
    expect(snapshot.galleryDl.state).toBe("missing");
    expect(snapshot.galleryDl.error).toContain("Missing bundled gallery-dl runtime");
    expect(snapshot.ffmpeg.state).toBe("missing");
    expect(snapshot.deno.state).toBe("missing");
  });

  it("resolves macOS bundled downloader names without Windows extensions", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });
    const binariesDir = path.join(environment.repoRoot, "desktop-assets", "binaries");
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
    mkdirSync(ffmpegDir, { recursive: true });
    mkdirSync(denoDir, { recursive: true });

    writeFileSync(path.join(binariesDir, "yt-dlp-aarch64-apple-darwin"), "binary");
    writeFileSync(path.join(binariesDir, "gallery-dl-aarch64-apple-darwin"), "binary");
    writeFileSync(path.join(ffmpegDir, "ffmpeg"), "binary");
    writeFileSync(path.join(ffmpegDir, "ffprobe"), "binary");
    writeFileSync(path.join(denoDir, "deno"), "binary");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("ready");
    expect(snapshot.ytDlp.path).toContain("yt-dlp-aarch64-apple-darwin");
    expect(snapshot.galleryDl.state).toBe("ready");
    expect(snapshot.galleryDl.path).toContain("gallery-dl-aarch64-apple-darwin");
    expect(snapshot.ffmpeg.path).toContain(path.join("ffmpeg", "aarch64-apple-darwin", "ffmpeg"));
    expect(snapshot.deno.path).toContain(path.join("deno", "aarch64-apple-darwin", "deno"));
  });
});

