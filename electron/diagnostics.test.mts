import { constants, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDiagnosticsSnapshot,
  inspectOutputDirectoryReadOnly,
} from "./diagnostics.mjs";

const tempRoots: string[] = [];

const createOptions = () => ({
  appVersion: "0.3.1",
  platform: "win32",
  arch: "x64",
  isPackaged: false,
  runtimeTarget: "x86_64-pc-windows-msvc",
  runtimeStatus: {
    python: { state: "ready", source: "bundled", expectedSource: "bundled", path: "/runtime/python", error: null },
    ytDlp: { state: "ready", source: "bundled", expectedSource: "bundled", path: "/runtime/yt-dlp", error: null },
    galleryDl: { state: "missing", source: null, expectedSource: "managed", path: null, error: "missing gallery-dl" },
    ffmpeg: { state: "ready", source: "managed", expectedSource: "managed", path: "/runtime/ffmpeg", error: null },
    deno: { state: "ready", source: "managed", expectedSource: "managed", path: "/runtime/deno", error: null },
  },
  runtimePaths: {
    ytDlp: "/runtime/yt-dlp",
    galleryDl: "/runtime/gallery-dl",
    ffmpeg: "/runtime/ffmpeg",
    ffprobe: "/runtime/ffprobe",
    deno: "/runtime/deno",
  },
  runtimeGate: {
    phase: "idle" as const,
    missingComponents: ["galleryDl"],
    lastError: null,
    updatedAtMs: 1,
    currentComponent: null,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: "galleryDl" as const,
  },
  ytdlpBaseline: {
    manifest: {
      available: true,
      verified: true,
      packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0",
      manifestDigest: "baseline-digest",
      ytDlpVersion: "2026.07.04",
      ejsVersion: "0.8.0",
    },
    cache: { materialized: true, identityMatches: true, probeVersion: "2026.07.04" },
    selection: "bundled" as const,
  },
  runtimeSetLeaseCount: 1,
  inspectOutputDirectory: vi.fn(async () => ({
    configured: true,
    exists: false,
    accessible: false,
    writable: false,
  })),
  inspectBrowserBridge: vi.fn(() => ({ listenerActive: true, connectedClientCount: 0, pendingRequestCount: 0 })),
  inspectDownloads: vi.fn(() => ({ activeCount: 1, pendingCount: 2 })),
  readRecentRuntimeLogLines: vi.fn(async () => [
    "download https://example.test/watch?token=secret",
    "Cookie: SID=secret",
  ]),
  isPathPresent: vi.fn((entryPath: string) => entryPath !== "/runtime/gallery-dl"),
  probeVersion: vi.fn(async (id: string) => {
    if (id === "ffprobe") throw new Error("ffprobe --version failed at C:/Users/alice/private");
    return `${id} 1.0.0`;
  }),
  now: () => new Date("2026-08-25T00:00:00.000Z"),
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("read-only diagnostics snapshot", () => {
  it("shares the one bounded hidden-process version probe with existing downloader version info", () => {
    const mainSource = readFileSync(new URL("./main.mts", import.meta.url), "utf8");
    const diagnosticsSource = mainSource.slice(
      mainSource.indexOf("async function getDiagnosticsSnapshot"),
      mainSource.indexOf("async function getRuntimeDependencyGateState"),
    );
    const ytDlpSource = mainSource.slice(
      mainSource.indexOf("async function checkYtdlpVersion"),
      mainSource.indexOf("async function getGalleryDlInfo"),
    );
    const galleryDlSource = mainSource.slice(mainSource.indexOf("async function getGalleryDlInfo"));

    expect(diagnosticsSource).toContain("probeVersion: getLocalDownloaderVersion");
    expect(diagnosticsSource).toContain("inspectBundledYtDlpBaseline");
    expect(ytDlpSource).toContain("getLocalDownloaderVersion,");
    expect(galleryDlSource).toContain("getLocalDownloaderVersion,");
    expect(mainSource).not.toContain("probeDiagnosticsVersion");
    expect(mainSource.match(/spawn\(binaryPath, \["--version"\]/g)).toHaveLength(1);
    expect(mainSource).toContain("windowsHide: true");
    expect(mainSource).toContain("VERSION_PROBE_OUTPUT_LIMIT");
    expect(mainSource).toContain("VERSION_PROBE_TIMEOUT_MS");
  });

  it("keeps observed presence distinct from a successful or failed version probe", async () => {
    const snapshot = await buildDiagnosticsSnapshot(createOptions());
    const ytDlp = snapshot.runtimes.find((runtime) => runtime.id === "ytDlp");
    const ffprobe = snapshot.runtimes.find((runtime) => runtime.id === "ffprobe");
    const galleryDl = snapshot.runtimes.find((runtime) => runtime.id === "galleryDl");

    expect(ytDlp?.executablePresent).toMatchObject({
      origin: "observed",
      conclusion: "unknown",
      value: true,
    });
    expect(ytDlp?.expectedSource).toMatchObject({ origin: "configured", value: "bundled" });
    expect(ytDlp?.currentSource).toMatchObject({ origin: "observed", value: "bundled" });
    expect(ytDlp?.version).toMatchObject({ origin: "probed", conclusion: "available" });
    expect(ffprobe?.version).toMatchObject({ origin: "probed", conclusion: "degraded" });
    expect(ffprobe?.version.summary).not.toContain("alice");
    expect(galleryDl?.version).toMatchObject({ origin: "probed", conclusion: "unavailable" });
    expect(galleryDl?.currentSource).toMatchObject({ conclusion: "unavailable", value: null });
    expect(snapshot.outputDirectory.writable).toMatchObject({
      origin: "probed",
      conclusion: "unavailable",
      value: false,
    });
    expect(snapshot.browserBridge.connectedClients).toMatchObject({ conclusion: "unavailable", value: 0 });
    expect(snapshot.ytdlpBaseline).toMatchObject({
      manifest: { conclusion: "available", value: { packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0" } },
      cache: { conclusion: "available", value: { identityMatches: true } },
      selection: { value: "bundled" },
    });
    expect(snapshot.runtimeSetLease).toMatchObject({ value: { activeLeaseCount: 1 } });
  });

  it("returns bounded sanitized log evidence and serializes as a plain snapshot", async () => {
    const snapshot = await buildDiagnosticsSnapshot(createOptions());

    expect(snapshot.downloads.recentDiagnostics.value).toEqual([
      "download https://example.test",
      "Cookie: [REDACTED]",
    ]);
    expect(JSON.parse(JSON.stringify(snapshot))).toMatchObject({
      generatedAt: "2026-08-25T00:00:00.000Z",
      downloads: { active: { value: 1 }, pending: { value: 2 } },
    });
  });

  it("does not create a missing output root while inspecting it", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ameow-diagnostics-"));
    tempRoots.push(root);
    const missingDirectory = path.join(root, "missing-output");

    const before = existsSync(missingDirectory);
    const result = await inspectOutputDirectoryReadOnly(missingDirectory, false);

    expect(before).toBe(false);
    expect(result).toEqual({
      configured: false,
      exists: false,
      accessible: false,
      writable: false,
    });
    expect(existsSync(missingDirectory)).toBe(false);
  });

  it("uses non-mutating read and write permission access without creating a probe file", async () => {
    const access = vi.fn(async () => undefined);

    const result = await inspectOutputDirectoryReadOnly("C:/output", true, {
      existsSync: vi.fn(() => true),
      access,
    });

    expect(result).toEqual({ configured: true, exists: true, accessible: true, writable: true });
    expect(access).toHaveBeenCalledWith("C:/output", constants.R_OK);
    expect(access).toHaveBeenCalledWith("C:/output", constants.W_OK);

    const options = createOptions();
    options.inspectOutputDirectory.mockResolvedValue(result);
    const snapshot = await buildDiagnosticsSnapshot(options);
    expect(snapshot.outputDirectory.accessible).toMatchObject({ origin: "probed", value: true });
    expect(snapshot.outputDirectory.writable).toMatchObject({
      origin: "probed",
      conclusion: "available",
      value: true,
      summary: "Write permission access is granted; this does not prove a real write.",
    });
  });

  it("reports denied write permission without a filesystem mutation", async () => {
    const access = vi.fn(async (_path: string, mode: number) => {
      if (mode === constants.W_OK) throw new Error("read-only");
    });

    const result = await inspectOutputDirectoryReadOnly("C:/output", true, {
      existsSync: vi.fn(() => true),
      access,
    });

    expect(result).toEqual({ configured: true, exists: true, accessible: true, writable: false });
    const options = createOptions();
    options.inspectOutputDirectory.mockResolvedValue(result);
    const snapshot = await buildDiagnosticsSnapshot(options);
    expect(snapshot.outputDirectory.writable).toMatchObject({
      origin: "probed",
      conclusion: "degraded",
      value: false,
      summary: "Write permission access was denied; Diagnostics did not create a file.",
    });
  });

  it("keeps a partial report when one read-only collector cannot answer", async () => {
    const options = createOptions();
    options.inspectOutputDirectory.mockRejectedValueOnce(new Error("output C:/Users/alice unavailable"));
    options.inspectBrowserBridge.mockImplementationOnce(() => {
      throw new Error("bridge unavailable");
    });

    const snapshot = await buildDiagnosticsSnapshot(options);

    expect(snapshot.outputDirectory.exists).toMatchObject({ conclusion: "unknown", value: null });
    expect(snapshot.outputDirectory.exists.summary).not.toContain("alice");
    expect(snapshot.browserBridge.listener).toMatchObject({ conclusion: "unknown", value: null });
    expect(snapshot.downloads.active.value).toBe(1);
  });

});
