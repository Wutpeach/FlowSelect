import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSupportLogText, exportSupportLogFile } from "./supportLogExport.mjs";

const createOptions = (overrides = {}) => ({
  environment: {
    appVersion: "0.3.0",
    platform: "win32" as NodeJS.Platform,
    arch: "x64" as NodeJS.Architecture,
    isPackaged: false,
    configPath: "C:/Ameow/settings.json",
    logDir: "C:/Ameow/logs",
    runtimeLogPath: "C:/Ameow/logs/runtime-latest.log",
  },
  readConfigObject: async () => ({
    outputPath: "C:/Downloads",
    networkProxyUrl: "http://proxy.example.com:8080",
    networkProxyMode: "manual",
    theme: "black",
    renameMediaOnDownload: true,
    secretKey: "should-never-egress",
    cookieStorage: { session: "top-secret" },
  }),
  getRuntimeDependencyStatus: async () => ({
    python: {
      state: "ready",
      source: "bundled",
      path: "C:/python/python.exe",
      error: null,
    },
    ytDlp: {
      state: "ready",
      source: "managed",
      expectedSource: "managed",
      path: "C:/Users/alice/AppData/Ameow/bin/yt-dlp.exe",
      error: null,
    },
    galleryDl: {
      state: "missing",
      source: null,
      expectedSource: "managed",
      path: null,
      error: "No gallery-dl executable at C:/Users/alice/AppData/Ameow/bin",
    },
  }),
  readRecentRuntimeLogLines: async () => [
    "[log] runtime ready",
    ">>> [yt-dlp] Cookie: SID=secret",
    ">>> [yt-dlp] Authorization: Bearer abc.def",
    "download /home/alice/private/video.mp4",
  ],
  ...overrides,
});

describe("buildSupportLogText", () => {
  it("builds the required four-section v2 support log contract with safe projections", async () => {
    const text = await buildSupportLogText(createOptions());

    expect(text).toContain("Ameow Support Log");
    expect(text).toContain("formatVersion=2");
    expect(text).toContain("[environment]\n");
    expect(text).toContain("appVersion=0.3.0\n");
    expect(text).toContain("platform=win32\n");
    expect(text).toContain("arch=x64\n");
    expect(text).toContain("isPackaged=false\n");
    expect(text).toContain("[settings]\n");
    expect(text).toContain("[runtime]\n");
    expect(text).toContain("[recent-runtime-log]\n");
  });

  it("redacts environment path values while keeping compatibility keys", async () => {
    const text = await buildSupportLogText(createOptions());

    expect(text).toContain("configPath=[REDACTED_PATH]\n");
    expect(text).toContain("logDir=[REDACTED_PATH]\n");
    expect(text).toContain("runtimeLogPath=[REDACTED_PATH]\n");
    expect(text).not.toContain("C:/Ameow/settings.json");
    expect(text).not.toContain("C:/Ameow/logs");
  });

  it("recursively sanitizes the projected environment before egress", async () => {
    const text = await buildSupportLogText(createOptions({
      environment: {
        appVersion: `0.3.0-token=env-secret "C:\\Users\\Alice\\app\\v.exe"`,
        platform: "win32" as NodeJS.Platform,
        arch: "x64" as NodeJS.Architecture,
        isPackaged: false,
        configPath: "C:/Ameow/settings.json",
        logDir: "C:/Ameow/logs",
        runtimeLogPath: "C:/Ameow/logs/runtime-latest.log",
      },
    }));

    expect(text).not.toContain("env-secret");
    expect(text).not.toContain("Alice");
    expect(text).not.toContain("app\\v.exe");
    // Normal environment facts survive unchanged.
    expect(text).toContain("appVersion=0.3.0-token=[REDACTED] [REDACTED_PATH]\n");
    expect(text).toContain("platform=win32\n");
    expect(text).toContain("arch=x64\n");
    expect(text).toContain("isPackaged=false\n");
  });

  it("projects settings through an allowlist without raw config or proxy endpoint", async () => {
    const text = await buildSupportLogText(createOptions());

    expect(text).toContain('"outputPathConfigured": true');
    expect(text).toContain('"networkProxyConfigured": true');
    expect(text).toContain('"networkProxyMode": "manual"');
    expect(text).toContain('"theme": "black"');
    // Unknown open config keys and secret values must never egress.
    expect(text).not.toContain("should-never-egress");
    expect(text).not.toContain("top-secret");
    expect(text).not.toContain("proxy.example.com");
    expect(text).not.toContain('"outputPath": "C:/Downloads"');
    expect(text).not.toContain('"cookieStorage"');
  });

  it("projects runtime dependency facts without executable paths", async () => {
    const text = await buildSupportLogText(createOptions());

    expect(text).toContain('"state": "ready"');
    expect(text).toContain('"source": "managed"');
    expect(text).toContain('"pathPresent": true');
    expect(text).toContain('"pathPresent": false');
    // Paths and raw error paths never egress.
    expect(text).not.toContain("C:/python/python.exe");
    expect(text).not.toContain("C:/yt-dlp.exe");
    expect(text).not.toContain("C:/Users/alice");
  });

  it("keeps bounded chronological runtime evidence, re-sanitized at egress", async () => {
    const text = await buildSupportLogText(createOptions());

    expect(text).toContain("[recent-runtime-log]\n[log] runtime ready");
    // Order preserved.
    const cookieIndex = text.indexOf("Cookie: [REDACTED]");
    const authIndex = text.indexOf("Authorization: [REDACTED]");
    expect(cookieIndex).toBeGreaterThan(text.indexOf("[log] runtime ready"));
    expect(authIndex).toBeGreaterThan(cookieIndex);
    // Secrets and paths scrubbed again at egress.
    expect(text).not.toContain("SID=secret");
    expect(text).not.toContain("Bearer abc.def");
    expect(text).not.toContain("/home/alice/private/video.mp4");
    expect(text).not.toContain("C:/python");
  });

  it("preserves the newest 800-line bounded window when a caller returns more lines", async () => {
    const totalLines = 1_234;
    const lines = Array.from(
      { length: totalLines },
      (_, index) => `[log] line ${index + 1}`,
    );
    const text = await buildSupportLogText(createOptions({
      readRecentRuntimeLogLines: async () => lines,
    }));

    const sectionStart = text.indexOf("[recent-runtime-log]\n");
    const section = text.slice(sectionStart);
    // The oldest line is dropped; the newest bounded window is preserved in order.
    expect(section).not.toContain("[log] line 434\n");
    expect(section).toContain("[recent-runtime-log]\n[log] line 435\n");
    expect(section).toContain("[log] line 1234\n");
    const lineCount = section
      .split("\n")
      .filter((line) => line.startsWith("[log] line ")).length;
    expect(lineCount).toBe(800);
  });

  it("uses a clear placeholder when no runtime log lines are available", async () => {
    const text = await buildSupportLogText(createOptions({
      readRecentRuntimeLogLines: async () => [],
    }));

    expect(text).toContain("<no runtime log lines captured>");
  });

  it("rejects cleanly when a source reader fails (non-authoritative)", async () => {
    await expect(buildSupportLogText(createOptions({
      readConfigObject: async () => {
        throw new Error("config read failed");
      },
    }))).rejects.toThrow("config read failed");
  });
});

describe("exportSupportLogFile", () => {
  it("writes the generated support log under the log directory and returns the path", async () => {
    const logDir = await mkdtemp(join(tmpdir(), "ameow-support-log-"));
    try {
      const outputPath = await exportSupportLogFile(createOptions({
        environment: {
          ...createOptions().environment,
          logDir,
          runtimeLogPath: join(logDir, "runtime-latest.log"),
        },
        now: () => new Date("2026-05-16T12:34:56.789Z"),
      }));

      expect(outputPath).toBe(join(logDir, "support-2026-05-16T12-34-56-789Z.txt"));
      const content = await readFile(outputPath, "utf8");
      expect(content).toContain("[recent-runtime-log]");
      // Egress file carries no secrets or raw paths either.
      expect(content).not.toContain("SID=secret");
      expect(content).not.toContain("C:/python");
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it("rejects cleanly when the support file write path fails (non-authoritative sink)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ameow-support-fail-"));
    try {
      // logDir points at a missing subdirectory so the final writeFile path
      // cannot be created; the file sink is non-authoritative so this must
      // reject without producing a file or any success return.
      await expect(exportSupportLogFile(createOptions({
        environment: {
          ...createOptions().environment,
          logDir: join(dir, "missing-subdir"),
        },
      }))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
