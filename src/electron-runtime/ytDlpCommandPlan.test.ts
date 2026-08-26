import path from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { buildYtdlpCommandArgs, createYtdlpCommandPlan } from "./ytDlpCommandPlan.js";

const createContext = (overrides: Record<string, unknown> = {}) => ({
  traceId: "trace-plan",
  outputDir: "D:/downloads",
  outputStem: "Sample Video",
  config: {},
  binaries: {
    ytDlp: "D:/yt-dlp.exe",
    galleryDl: "D:/gallery-dl.exe",
    ffmpeg: "D:/tools/ffmpeg/bin/ffmpeg.exe",
    ffprobe: "D:/tools/ffmpeg/bin/ffprobe.exe",
    deno: "D:/deno/deno.exe",
  },
  enginePlan: {
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
  },
  intent: {
    originalUrl: "https://www.youtube.com/watch?v=abc123",
    pageUrl: "https://www.youtube.com/watch?v=abc123",
    selectionScope: "current_item",
    siteId: "youtube",
    videoQuality: "best",
  },
  abortSignal: new AbortController().signal,
  onProgress: async () => undefined,
  plan: {
    providerId: "youtube",
  },
  ...overrides,
} as never);

describe("yt-dlp command planning", () => {
  it("plans output reports, template, ffmpeg directory, and artifact prefixes", () => {
    const plan = createYtdlpCommandPlan(createContext());

    expect(plan.reportPath).toBe(path.join("D:/downloads", "trace-plan-after-move.txt"));
    expect(plan.titleReportPath).toBe(path.join("D:/downloads", "trace-plan-title.txt"));
    expect(plan.outputTemplate).toBe(path.join(
      "D:/downloads",
      "Sample Video[%(width|unknown)sx%(height|unknown)s][highest].%(ext)s",
    ));
    expect(plan.artifactPrefixes).toEqual(["Sample Video"]);
    expect(plan.ffmpegDir).toBe(path.dirname("D:/tools/ffmpeg/bin/ffmpeg.exe"));
  });

  it("builds extended youtube args in the expected command order", () => {
    const plan = createYtdlpCommandPlan(createContext());
    const args = buildYtdlpCommandArgs(plan, {
      cookiesPath: "D:/temp/trace-plan-cookies.txt",
      hasFfmpeg: true,
      denoPath: "D:/deno/deno.exe",
      proxyArgs: ["--proxy", "http://127.0.0.1:7890"],
      selectionScope: "current_item",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      platform: "darwin",
    });

    expect(args.slice(0, 16)).toEqual([
      "--newline",
      "--no-warnings",
      "--ignore-config",
      "--no-plugin-dirs",
      "--progress",
      "-f",
      "bestvideo+bestaudio/best",
      "--encoding",
      "utf-8",
      "--print-to-file",
      "after_move:filepath",
      path.join("D:/downloads", "trace-plan-after-move.txt"),
      "--print-to-file",
      "after_move:title",
      path.join("D:/downloads", "trace-plan-title.txt"),
      "-o",
    ]);
    expect(args).toContain("--ffmpeg-location");
    expect(args).toContain("--proxy");
    expect(args[args.indexOf("--proxy") + 1]).toBe("http://127.0.0.1:7890");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("D:/temp/trace-plan-cookies.txt");
    expect(args).toContain("youtube:player_js_variant=tv");
    expect(args).toContain("--no-plugin-dirs");
    expect(args).not.toContain("--remote-components");
    expect(args[args.length - 1]).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("never delegates downloads to an external downloader and only supplies local ffmpeg-location", () => {
    const plan = createYtdlpCommandPlan(createContext());
    const args = buildYtdlpCommandArgs(plan, {
      cookiesPath: "D:/temp/trace-plan-cookies.txt",
      hasFfmpeg: true,
      denoPath: "D:/deno/deno.exe",
      platform: "win32",
    });

    // yt-dlp must keep downloading with its native downloaders; ffmpeg only
    // receives remote URLs through yt-dlp's own internal FFmpegFD selection
    // (forced by --download-sections / live HLS), never via an explicit
    // external-downloader argument from Ameow.
    expect(args).not.toContain("--external-downloader");
    expect(args).not.toContain("--downloader");
    expect(args.some((arg) => String(arg).startsWith("--external-downloader"))).toBe(false);
    expect(args.some((arg) => String(arg).startsWith("--downloader"))).toBe(false);

    const ffmpegLocationIndex = args.indexOf("--ffmpeg-location");
    expect(ffmpegLocationIndex).toBeGreaterThanOrEqual(0);
    expect(args[ffmpegLocationIndex + 1]).toBe("D:/tools/ffmpeg/bin");
    expect(args[ffmpegLocationIndex + 1]).not.toMatch(/^[a-z][a-z0-9+.-]*:\/\//i);
  });

  it("includes adapter-provided proxy args verbatim when present", () => {
    const plan = createYtdlpCommandPlan(createContext());
    const args = buildYtdlpCommandArgs(plan, {
      cookiesPath: null,
      hasFfmpeg: true,
      denoPath: "D:/deno/deno.exe",
      proxyArgs: ["--proxy", ""],
      selectionScope: "current_item",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      platform: "win32",
    });

    expect(args).toContain("--proxy");
    expect(args[args.indexOf("--proxy") + 1]).toBe("");
  });

  it("adds clip section args and clip output stem for supported sites", () => {
    const plan = createYtdlpCommandPlan(createContext({
      intent: {
        originalUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        selectionScope: "current_item",
        siteId: "bilibili",
        videoQuality: "best",
        clipStartSec: 5.25,
        clipEndSec: 8.75,
      },
      enginePlan: {
        sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
      },
    }));

    const args = buildYtdlpCommandArgs(plan, {
      cookiesPath: null,
      hasFfmpeg: true,
      denoPath: null,
      selectionScope: "current_item",
      pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
      platform: "darwin",
    });

    expect(plan.outputTemplate).toBe(path.join("D:/downloads", "5250-8750_Sample Video.%(ext)s"));
    expect(plan.artifactPrefixes).toEqual(["Sample Video", "5250-8750_Sample Video"]);
    expect(args).toContain("--download-sections");
    expect(args[args.indexOf("--download-sections") + 1]).toBe("*00:00:05.250-00:00:08.750");
  });

  it("prefers runtime-owned advanced quality selectors over preset selectors", () => {
    const plan = createYtdlpCommandPlan(createContext({
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=abc123",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
      },
      advancedQualitySelector: "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/bv*[height=1080]+ba",
      advancedQualityLabel: "1080p",
    }));

    expect(plan.formatProfile.selector).toBe(
      "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/bv*[height=1080]+ba",
    );
  });

  it("binds YouTube EJS to the managed Deno path without machine fallbacks", () => {
    const plan = createYtdlpCommandPlan(createContext());
    const windowsArgs = buildYtdlpCommandArgs(plan, {
      cookiesPath: null,
      hasFfmpeg: true,
      denoPath: "D:/ameow/runtimes/deno/x86_64-pc-windows-msvc/real/deno.exe",
      platform: "win32",
    });

    expect(windowsArgs).toContain("youtube:player_js_variant=tv");
    expect(windowsArgs.slice(windowsArgs.indexOf("--js-runtimes"))).toEqual([
      "--js-runtimes",
      "deno:D:/ameow/runtimes/deno/x86_64-pc-windows-msvc/real/deno.exe",
      "https://www.youtube.com/watch?v=abc123",
    ]);
    expect(windowsArgs).not.toContain("deno");
    expect(windowsArgs).not.toContain("node");
    expect(windowsArgs).not.toContain("ejs:github");
  });

  it("rejects clip downloads for unsupported sites before spawning yt-dlp", () => {
    expect(() => createYtdlpCommandPlan(createContext({
      intent: {
        originalUrl: "https://x.com/ameow/status/1234567890",
        pageUrl: "https://x.com/ameow/status/1234567890",
        selectionScope: "current_item",
        siteId: "twitter-x",
        videoQuality: "best",
        clipStartSec: 3,
        clipEndSec: 9,
      },
      enginePlan: {
        sourceUrl: "https://x.com/ameow/status/1234567890",
      },
    }))).toThrow(InvalidCommandPlanError);
  });
});
