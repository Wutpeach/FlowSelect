import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectRuntimeDependencyStatus } from "./runtimePaths";
import type { ElectronRuntimeEnvironment } from "./contracts";

const tempRoots: string[] = [];

const createEnvironment = (): ElectronRuntimeEnvironment => {
  const root = mkdtempSync(path.join(os.tmpdir(), "flowselect-electron-runtime-"));
  tempRoots.push(root);
  return {
    repoRoot: root,
    configDir: path.join(root, "config"),
    platform: "win32",
    arch: "x64",
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
    const pinterestDir = path.join(
      environment.configDir,
      "runtimes",
      "pinterest-dl",
      "x86_64-pc-windows-msvc",
    );
    mkdirSync(binariesDir, { recursive: true });
    mkdirSync(ffmpegRealDir, { recursive: true });
    mkdirSync(denoRealDir, { recursive: true });
    mkdirSync(pinterestDir, { recursive: true });

    writeFileSync(path.join(binariesDir, "yt-dlp-x86_64-pc-windows-msvc.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffmpeg.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffprobe.exe"), "binary");
    writeFileSync(path.join(denoRealDir, "deno.exe"), "binary");
    writeFileSync(
      path.join(pinterestDir, "pinterest-dl-x86_64-pc-windows-msvc.exe"),
      "binary",
    );

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("ready");
    expect(snapshot.ytDlp.source).toBe("bundled");
    expect(snapshot.ffmpeg.state).toBe("ready");
    expect(snapshot.ffmpeg.source).toBe("managed");
    expect(snapshot.deno.state).toBe("ready");
    expect(snapshot.pinterestDownloader.state).toBe("ready");
  });

  it("marks missing runtimes with actionable errors", () => {
    const environment = createEnvironment();
    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.error).toContain("Missing bundled yt-dlp runtime");
    expect(snapshot.ffmpeg.state).toBe("missing");
    expect(snapshot.deno.state).toBe("missing");
    expect(snapshot.pinterestDownloader.state).toBe("missing");
  });
});

