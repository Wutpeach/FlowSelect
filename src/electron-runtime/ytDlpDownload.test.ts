import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readdirMock,
  readFileMock,
  unlinkMock,
  runStreamingCommandMock,
  writeCookiesFileMock,
  cleanupCookiesFileMock,
} = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
  unlinkMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
  writeCookiesFileMock: vi.fn<(traceId: string, cookies: string | undefined) => Promise<string | null>>(
    async () => null,
  ),
  cleanupCookiesFileMock: vi.fn<(cookiesPath: string | null) => Promise<void>>(async () => undefined),
}));

vi.mock("node:fs", () => ({
  promises: {
    readdir: readdirMock,
    readFile: readFileMock,
    unlink: unlinkMock,
  },
}));

vi.mock("./processRunner.js", () => ({
  runStreamingCommand: runStreamingCommandMock,
}));

vi.mock("./sidecarCookies.js", () => ({
  writeCookiesFile: writeCookiesFileMock,
  cleanupCookiesFile: cleanupCookiesFileMock,
}));

import { runYtDlpDownload } from "./ytDlpDownload.js";
import { DownloadRuntimeError } from "../core/index.js";

describe("runYtDlpDownload", () => {
  beforeEach(() => {
    readdirMock.mockReset();
    readFileMock.mockReset();
    unlinkMock.mockClear();
    runStreamingCommandMock.mockReset();
    writeCookiesFileMock.mockReset();
    cleanupCookiesFileMock.mockReset();
    writeCookiesFileMock.mockResolvedValue(null);
    cleanupCookiesFileMock.mockResolvedValue(undefined);
  });

  it("uses title plus resolution and quality in the output template when rename is disabled", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Sample Video"
        : path.join("D:/downloads", "Sample Video[1920x1080][highest].mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const outputIndex = args.indexOf("-o");
      const mergeOutputIndex = args.indexOf("--merge-output-format");
      const titleReportIndex = args.indexOf("after_move:title");
      expect(outputIndex).toBeGreaterThanOrEqual(0);
      expect(mergeOutputIndex).toBeGreaterThanOrEqual(0);
      expect(titleReportIndex).toBeGreaterThanOrEqual(0);
      expect(args[outputIndex + 1]).toBe(path.join(
        "D:/downloads",
        "Sample Video[%(width|unknown)sx%(height|unknown)s][highest].%(ext)s",
      ),
      );
      expect(args[mergeOutputIndex + 1]).toBe("mp4/mkv");
      return 0;
    });

    const context = {
      traceId: "trace-template",
      outputDir: "D:/downloads",
      outputStem: "Sample Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=1",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=1",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Sample Video[1920x1080][highest].mp4"),
    });
  });

  it("cleans up newly created task artifacts when yt-dlp fails", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["video.mp4.part", "video.mp4.ytdl", "video.f137.mp4"]);
    readFileMock.mockRejectedValue(new Error("missing report"));
    runStreamingCommandMock.mockResolvedValue(1);

    const context = {
      traceId: "trace-yt",
      outputDir: "D:/downloads",
      outputStem: "video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://example.com/watch?v=1",
      },
      intent: {
        originalUrl: "https://example.com/watch?v=1",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow();
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.mp4.part"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.mp4.ytdl"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.f137.mp4"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "trace-yt-after-move.txt"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "trace-yt-title.txt"));
  });

  it("retries Bilibili yt-dlp once after a transient SSL EOF webpage failure", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["Bilibili Video.mp4.part", "Bilibili Video.mp4.ytdl"]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Bilibili Video"
        : path.join("D:/downloads", "Bilibili Video.mp4")
    ));
    runStreamingCommandMock
      .mockImplementationOnce(async (_command, _args, options) => {
        await options?.onStderrLine?.(
          "ERROR: [BiliBili] 1QCMjziEpq: Unable to download webpage: "
          + "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol "
          + "(_ssl.c:1016) (caused by SSLError('[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1016)'))",
        );
        return 1;
      })
      .mockResolvedValueOnce(0);

    const context = {
      traceId: "trace-bilibili-ssl-eof",
      outputDir: "D:/downloads",
      outputStem: "Bilibili Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.bilibili.com/video/BV1QCMjziEpq/",
      },
      intent: {
        originalUrl: "https://www.bilibili.com/video/BV1QCMjziEpq/",
        pageUrl: "https://www.bilibili.com/video/BV1QCMjziEpq/",
        selectionScope: "current_item",
        siteId: "bilibili",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Bilibili Video.mp4"),
    });
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(2);
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "Bilibili Video.mp4.part"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "Bilibili Video.mp4.ytdl"));
  });

  it("emits an early downloading activity while yt-dlp is still resolving media", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Sample Video"
        : path.join("D:/downloads", "Sample Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStderrLine?.("[youtube] abc123: Downloading webpage");
      return 0;
    });

    const context = {
      traceId: "trace-activity",
      outputDir: "D:/downloads",
      outputStem: "Sample Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=abc123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=abc123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Sample Video.mp4"),
    });

    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-activity",
      percent: -1,
      stage: "preparing",
      speed: "Resolving media...",
    }));
  });

  it("uses extended youtube args for plain youtube downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Plain URL Video"
        : path.join("D:/downloads", "Plain URL Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--js-runtimes");
      expect(args).toContain("deno:D:/deno/deno.exe");
      expect(args).toContain("--no-plugin-dirs");
      expect(args).not.toContain("--remote-components");
      expect(args.at(-1)).toBe("https://www.youtube.com/watch?v=plain123");
      return 0;
    });

    const context = {
      traceId: "trace-plain-youtube",
      outputDir: "D:/downloads",
      outputStem: "youtube_plain123",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=plain123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=plain123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Plain URL Video.mp4"),
    });
  });

  it("applies a resolved proxy route as exactly one --proxy argument with scrubbed env", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Proxy Video"
        : path.join("D:/downloads", "Proxy Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args, options) => {
      const proxyOccurrences = args.filter((arg: string) => arg === "--proxy").length;
      expect(proxyOccurrences).toBe(1);
      expect(args[args.indexOf("--proxy") + 1]).toBe("http://127.0.0.1:7897");
      expect(options.env).not.toHaveProperty("HTTP_PROXY");
      expect(options.env).not.toHaveProperty("http_proxy");
      expect(options.env).not.toHaveProperty("ALL_PROXY");
      expect(options.env).not.toHaveProperty("no_proxy");
      return 0;
    });

    const context = {
      traceId: "trace-auto-proxy",
      outputDir: "D:/downloads",
      outputStem: "Proxy Video",
      config: {},
      network: {
        route: {
          mode: "proxy",
          source: "system",
          protocol: "http",
          proxyUrl: "http://127.0.0.1:7897",
          resolvedFor: "https://www.youtube.com/watch?v=proxy123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=proxy123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=proxy123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Proxy Video.mp4"),
    });
  });

  it("makes direct explicit with --proxy \"\" and scrubbed ambient proxy env", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Direct Video"
        : path.join("D:/downloads", "Direct Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args, options) => {
      expect(args).toContain("--proxy");
      expect(args[args.indexOf("--proxy") + 1]).toBe("");
      expect(options.env).not.toHaveProperty("HTTP_PROXY");
      expect(options.env).not.toHaveProperty("ALL_PROXY");
      expect(options.env).not.toHaveProperty("NO_PROXY");
      return 0;
    });

    const context = {
      traceId: "trace-no-proxy",
      outputDir: "D:/downloads",
      outputStem: "Direct Video",
      config: {},
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.youtube.com/watch?v=direct123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=direct123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=direct123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Direct Video.mp4"),
    });
  });

  it("rejects complex routes before spawning yt-dlp with NETWORK_PROXY_UNSUPPORTED", async () => {
    readdirMock.mockResolvedValue([]);
    const context = {
      traceId: "trace-complex-route",
      outputDir: "D:/downloads",
      outputStem: "Complex Video",
      config: {},
      network: {
        route: {
          mode: "complex",
          source: "system",
          reason: "multiple_candidates",
          candidates: [],
          resolvedFor: "https://www.youtube.com/watch?v=complex123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=complex123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=complex123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
      context: {
        networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
      },
    });
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });

  it("reports the rejected complex outcome through onNetworkApplication", async () => {
    readdirMock.mockResolvedValue([]);
    const onNetworkApplication = vi.fn();
    const context = {
      traceId: "trace-complex-outcome",
      outputDir: "D:/downloads",
      outputStem: "Complex Outcome",
      config: {},
      onNetworkApplication,
      network: {
        route: {
          mode: "complex",
          source: "system",
          reason: "multiple_candidates",
          candidates: [],
          resolvedFor: "https://www.youtube.com/watch?v=complexOutcome123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=complexOutcome123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=complexOutcome123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
    });
    expect(onNetworkApplication).toHaveBeenCalledWith(expect.objectContaining({
      engine: "yt-dlp",
      appliedToEngine: false,
      failureClassification: "NETWORK_PROXY_UNSUPPORTED",
    }));
  });

  it("fails closed on SOCKS routes before spawning yt-dlp for ordinary downloads", async () => {
    readdirMock.mockResolvedValue([]);
    const onNetworkApplication = vi.fn();
    const context = {
      traceId: "trace-socks-ordinary",
      outputDir: "D:/downloads",
      outputStem: "Socks Video",
      config: {},
      onNetworkApplication,
      network: {
        route: {
          mode: "proxy",
          source: "system",
          protocol: "socks5",
          proxyUrl: "socks5://user:supersecret@127.0.0.1:7891",
          resolvedFor: "https://www.youtube.com/watch?v=socksOrdinary123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=socksOrdinary123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=socksOrdinary123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    const error = await runYtDlpDownload(context).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "E_EXECUTION_FAILED",
      context: {
        networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
      },
    });
    // Credentials never leak into the ordinary error surface.
    expect((error as Error).message).not.toContain("supersecret");
    expect(JSON.stringify((error as Error).message)).not.toContain("socks5://");
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
    expect(onNetworkApplication).toHaveBeenCalledWith(expect.objectContaining({
      engine: "yt-dlp",
      appliedToEngine: false,
      failureClassification: "NETWORK_PROXY_UNSUPPORTED",
      proxyProtocol: "socks5",
    }));
  });

  it("fails closed on SOCKS routes for section downloads before spawning yt-dlp", async () => {
    readdirMock.mockResolvedValue([]);
    const onNetworkApplication = vi.fn();
    const context = {
      traceId: "trace-socks-clip",
      outputDir: "D:/downloads",
      outputStem: "Socks Clip",
      config: {},
      onNetworkApplication,
      network: {
        route: {
          mode: "proxy",
          source: "system",
          protocol: "socks4",
          proxyUrl: "socks4://127.0.0.1:7891",
          resolvedFor: "https://www.youtube.com/watch?v=socksClip123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=socksClip123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=socksClip123",
        pageUrl: "https://www.youtube.com/watch?v=socksClip123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5,
        clipEndSec: 15,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    const error = await runYtDlpDownload(context).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "E_EXECUTION_FAILED",
      context: {
        networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
      },
    });
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
    expect(onNetworkApplication).toHaveBeenCalledWith(expect.objectContaining({
      engine: "yt-dlp",
      appliedToEngine: false,
      failureClassification: "NETWORK_PROXY_UNSUPPORTED",
      proxyProtocol: "socks4",
    }));
  });

  it("supports direct routes for section downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Direct Clip"
        : path.join("D:/downloads", "5000-15000_Direct Clip.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--download-sections");
      expect(args[args.indexOf("--proxy") + 1]).toBe("");
      return 0;
    });
    const context = {
      traceId: "trace-direct-clip",
      outputDir: "D:/downloads",
      outputStem: "Direct Clip",
      config: {},
      network: {
        route: {
          mode: "direct",
          source: "direct",
          reason: "no_proxy_source",
          resolvedFor: "https://www.youtube.com/watch?v=directClip123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=directClip123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=directClip123",
        pageUrl: "https://www.youtube.com/watch?v=directClip123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5,
        clipEndSec: 15,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "5000-15000_Direct Clip.mp4"),
    });
  });

  it("still applies HTTP(S) routes to section downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Http Clip"
        : path.join("D:/downloads", "5000-15000_Http Clip.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--download-sections");
      expect(args[args.indexOf("--proxy") + 1]).toBe("http://127.0.0.1:7897");
      return 0;
    });
    const context = {
      traceId: "trace-http-clip",
      outputDir: "D:/downloads",
      outputStem: "Http Clip",
      config: {},
      network: {
        route: {
          mode: "proxy",
          source: "system",
          protocol: "http",
          proxyUrl: "http://127.0.0.1:7897",
          resolvedFor: "https://www.youtube.com/watch?v=httpClip123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=httpClip123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=httpClip123",
        pageUrl: "https://www.youtube.com/watch?v=httpClip123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5,
        clipEndSec: 15,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "5000-15000_Http Clip.mp4"),
    });
  });

  it("classifies proxy connection failures from stderr evidence", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStderrLine?.(
        "ERROR: Unable to download webpage: <url> (caused by ProxyError('Cannot connect to proxy'))",
      );
      await options.onStderrLine?.("Traceback (most recent call last):");
      return 1;
    });
    const context = {
      traceId: "trace-proxy-conn",
      outputDir: "D:/downloads",
      outputStem: "Proxy Conn",
      config: {},
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.youtube.com/watch?v=proxyConn123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=proxyConn123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=proxyConn123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await runYtDlpDownload(context).catch((error) => {
      expect(error.code).toBe("E_EXECUTION_FAILED");
      expect(error.context?.networkFailureClassification)
        .toBe("NETWORK_PROXY_CONNECTION_FAILED");
    });
  });

  it("redacts credentials in stderr-derived error messages without losing the classification", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStderrLine?.(
        "ERROR: Cannot connect to proxy http://user:supersecret@127.0.0.1:7897",
      );
      return 1;
    });
    const context = {
      traceId: "trace-proxy-leak",
      outputDir: "D:/downloads",
      outputStem: "Proxy Leak",
      config: {},
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.youtube.com/watch?v=proxyLeak123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=proxyLeak123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=proxyLeak123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await runYtDlpDownload(context).catch((error) => {
      // Raw stderr stays as internal evidence on the cause; the ordinary
      // error surfaces (message/context) must be credential-free.
      expect(error.message).not.toContain("supersecret");
      expect(JSON.stringify(error.context)).not.toContain("supersecret");
      expect(error.context?.networkFailureClassification)
        .toBe("NETWORK_PROXY_CONNECTION_FAILED");
    });
  });

  it("never classifies content-level failures (403/login/ffmpeg) as proxy failures", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStderrLine?.(
        "ERROR: Unable to download webpage: https://example.com/video (caused by HTTPError('HTTP Error 403: Forbidden'))",
      );
      await options.onStderrLine?.("ERROR: ffmpeg failed to merge output files");
      return 1;
    });
    const context = {
      traceId: "trace-content-failure",
      outputDir: "D:/downloads",
      outputStem: "Content Failure",
      config: {},
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.youtube.com/watch?v=contentFailure123",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=contentFailure123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=contentFailure123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await runYtDlpDownload(context).catch((error) => {
      expect(error.code).toBe("E_EXECUTION_FAILED");
      expect(error.context?.networkFailureClassification).toBeUndefined();
    });
  });

  it("does not retry public youtube downloads through an extended mode branch", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Retry Video"
        : path.join("D:/downloads", "Retry Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("deno:D:/deno/deno.exe");
      expect(args).not.toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-light",
      outputDir: "D:/downloads",
      outputStem: "Retry Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=light123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=light123",
        pageUrl: "https://www.youtube.com/watch?v=light123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Retry Video.mp4"),
    });
  });

  it("uses extended youtube mode for injected downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Balanced Video"
        : path.join("D:/downloads", "Balanced Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-balanced",
      outputDir: "D:/downloads",
      outputStem: "Balanced Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=balanced123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=balanced123",
        pageUrl: "https://www.youtube.com/watch?v=balanced123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "balanced",
        extensionData: {
          youtube: {
            source: "injected",

          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Balanced Video.mp4"),
    });
  });

  it("uses extended youtube mode for data-saver downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Data Saver Video"
        : path.join("D:/downloads", "Data Saver Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-data-saver",
      outputDir: "D:/downloads",
      outputStem: "Data Saver Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=datasaver123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=datasaver123",
        pageUrl: "https://www.youtube.com/watch?v=datasaver123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Data Saver Video.mp4"),
    });
  });

  it("keeps injected public high quality downloads on extended mode", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Injected Public Video"
        : path.join("D:/downloads", "Injected Public Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--no-playlist");
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--cookies");
      expect(args).not.toContain("--remote-components");
      expect(args).toContain("deno:D:/deno/deno.exe");
      expect(args).toContain("--js-runtimes");
      return 0;
    });

    const context = {
      traceId: "trace-public-injected",
      outputDir: "D:/downloads",
      outputStem: "Injected Public Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=public123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=public123",
        pageUrl: "https://www.youtube.com/watch?v=public123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        extensionData: {
          youtube: {
            source: "injected",

          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Injected Public Video.mp4"),
    });
  });

  it("does not retry youtube failures after the download has been aborted", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Cancelled Video"
        : path.join("D:/downloads", "Cancelled Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    const abortController = new AbortController();
    runStreamingCommandMock.mockImplementationOnce(async (_command, args, options) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      abortController.abort();
      await options?.onStderrLine?.("ERROR: Sign in to confirm you're not a bot");
      return 1;
    });

    const context = {
      traceId: "trace-cancelled-youtube",
      outputDir: "D:/downloads",
      outputStem: "Cancelled Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=cancel123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=cancel123",
        pageUrl: "https://www.youtube.com/watch?v=cancel123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
        extensionData: {
          youtube: {
            source: "injected",

          },
        },
      },
      abortSignal: abortController.signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow("Sign in to confirm you're not a bot");
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({
      speed: "activity:youtube.retryingCompatibleExtractor",
    }));
  });

  it("uses the trimmed youtube balanced selector for injected downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Balanced Video"
        : path.join("D:/downloads", "Balanced Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const formatIndex = args.indexOf("-f");
      expect(formatIndex).toBeGreaterThanOrEqual(0);
      expect(args[formatIndex + 1]).toBe(
        "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/"
        + "bv*[height=1080][ext=mp4]+ba[ext=m4a]/"
        + "b[height=1080][vcodec^=avc1][ext=mp4]/"
        + "b[height=1080][ext=mp4]/"
        + "best[height=1080][ext=mp4]/"
        + "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/"
        + "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/"
        + "b[height<=1080][vcodec^=avc1][ext=mp4]/"
        + "b[height<=1080][ext=mp4]/"
        + "best[height<=1080][ext=mp4]/"
        + "best[ext=mp4]/"
        + "best",
      );
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-balanced",
      outputDir: "D:/downloads",
      outputStem: "Balanced Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=balanced123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=balanced123",
        pageUrl: "https://www.youtube.com/watch?v=balanced123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "balanced",
        extensionData: {
          youtube: {
            source: "injected",

          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Balanced Video.mp4"),
    });
  });

  it("uses extended youtube mode for data-saver downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Data Saver Video"
        : path.join("D:/downloads", "Data Saver Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-data-saver",
      outputDir: "D:/downloads",
      outputStem: "Data Saver Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=datasaver123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=datasaver123",
        pageUrl: "https://www.youtube.com/watch?v=datasaver123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Data Saver Video.mp4"),
    });
  });

  it("adds referer, no-playlist, cookies, and youtube extractor args for injected current-item downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Injected Video"
        : path.join("D:/downloads", "Injected Video.mp4")
    ));
    writeCookiesFileMock.mockResolvedValue("D:/temp/trace-injected-cookies.txt");
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--no-playlist");
      expect(args).toContain("--cookies");
      expect(args).toContain("D:/temp/trace-injected-cookies.txt");
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--remote-components");
      expect(args).toContain("deno:D:/deno/deno.exe");

      const refererIndex = args.indexOf("--add-header");
      expect(refererIndex).toBeGreaterThanOrEqual(0);
      expect(args[refererIndex + 1]).toBe("Referer:https://www.youtube.com/watch?v=abc123");
      expect(args.at(-1)).toBe("https://www.youtube.com/watch?v=abc123");
      return 0;
    });

    const context = {
      traceId: "trace-injected",
      outputDir: "D:/downloads",
      outputStem: "Injected Video",
      config: {
        extensionInjectionDebugEnabled: true,
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=abc123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=abc123",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
        selectionScope: "current_item",
        cookies: "# Netscape HTTP Cookie File",
        siteId: "youtube",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Injected Video.mp4"),
    });
    expect(cleanupCookiesFileMock).toHaveBeenCalledWith("D:/temp/trace-injected-cookies.txt");
  });

  it("adds yt-dlp download sections for YouTube clip downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Clip Video"
        : path.join("D:/downloads", "5250-8750_Clip Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const outputIndex = args.indexOf("-o");
      const sectionIndex = args.indexOf("--download-sections");
      expect(outputIndex).toBeGreaterThanOrEqual(0);
      expect(sectionIndex).toBeGreaterThanOrEqual(0);
      expect(args[outputIndex + 1]).toBe(path.join(
        "D:/downloads",
        "5250-8750_Clip Video.%(ext)s",
      ));
      expect(args[sectionIndex + 1]).toBe("*00:00:05.250-00:00:08.750");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-clip",
      outputDir: "D:/downloads",
      outputStem: "Clip Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=clip123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=clip123",
        pageUrl: "https://www.youtube.com/watch?v=clip123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5.25,
        clipEndSec: 8.75,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "5250-8750_Clip Video.mp4"),
    });
  });

  it("emits clip download progress from yt-dlp stderr section and ffmpeg time lines", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Clip Video"
        : path.join("D:/downloads", "5000-25000_Clip Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStderrLine?.("[download] Downloading section 1 of 1");
      await options?.onStderrLine?.("size=   2048kB time=00:00:05.00 bitrate=3355.4kbits/s speed=2.5x");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-clip-progress",
      outputDir: "D:/downloads",
      outputStem: "Clip Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=clip123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=clip123",
        pageUrl: "https://www.youtube.com/watch?v=clip123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5,
        clipEndSec: 25,
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "5000-25000_Clip Video.mp4"),
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-youtube-clip-progress",
      percent: -1,
      stage: "downloading",
      speed: "Downloading media...",
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-youtube-clip-progress",
      percent: 25,
      stage: "downloading",
      speed: "2.5x",
    }));
  });

  it("adds yt-dlp download sections for Bilibili clip downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Bilibili Clip"
        : path.join("D:/downloads", "12000-24000_Bilibili Clip.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const sectionIndex = args.indexOf("--download-sections");
      expect(sectionIndex).toBeGreaterThanOrEqual(0);
      expect(args[sectionIndex + 1]).toBe("*00:00:12-00:00:24");
      expect(args).not.toContain("--extractor-args");
      return 0;
    });

    const context = {
      traceId: "trace-bilibili-clip",
      outputDir: "D:/downloads",
      outputStem: "Bilibili Clip",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
      },
      intent: {
        originalUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        selectionScope: "current_item",
        siteId: "bilibili",
        videoQuality: "best",
        clipStartSec: 12,
        clipEndSec: 24,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "12000-24000_Bilibili Clip.mp4"),
    });
  });

  it("rejects clip downloads for sites outside YouTube and Bilibili", async () => {
    readdirMock.mockResolvedValue([]);

    const context = {
      traceId: "trace-twitter-clip",
      outputDir: "D:/downloads",
      outputStem: "Twitter Clip",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://x.com/ameow/status/1234567890",
      },
      intent: {
        originalUrl: "https://x.com/ameow/status/1234567890",
        pageUrl: "https://x.com/ameow/status/1234567890",
        selectionScope: "current_item",
        siteId: "twitter-x",
        videoQuality: "best",
        clipStartSec: 3,
        clipEndSec: 9,
      },
      plan: {
        providerId: "twitter-x",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_INVALID_ENGINE_PLAN",
      message: "Clip downloads are only supported for YouTube and Bilibili",
    } satisfies Partial<DownloadRuntimeError>);
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });

  it("maps a missing source URL to an invalid engine plan error", async () => {
    const context = {
      traceId: "trace-missing-source",
      outputDir: "D:/downloads",
      outputStem: "Missing Source",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {},
      intent: {},
      plan: {
        providerId: "generic",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_INVALID_ENGINE_PLAN",
      message: "yt-dlp source URL is missing",
    } satisfies Partial<DownloadRuntimeError>);
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });

  it("preserves runtime error codes that escape the yt-dlp execution path", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["video.mp4.part"]);
    readFileMock.mockRejectedValue(new Error("missing report"));
    runStreamingCommandMock.mockResolvedValue(0);

    const context = {
      traceId: "trace-runtime-error",
      outputDir: "D:/downloads",
      outputStem: "video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://example.com/watch?v=runtime-error",
      },
      intent: {
        originalUrl: "https://example.com/watch?v=runtime-error",
      },
      plan: {
        providerId: "generic",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_OUTPUT_NOT_FOUND",
      message: "yt-dlp exited successfully but produced no final output path",
    } satisfies Partial<DownloadRuntimeError>);
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.mp4.part"));
  });

  it("keeps injected public high quality downloads on extended mode", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Injected Public Video"
        : path.join("D:/downloads", "Injected Public Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--no-playlist");
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--remote-components");
      expect(args).not.toContain("--cookies");
      expect(args).toContain("deno:D:/deno/deno.exe");
      expect(args).toContain("--js-runtimes");
      return 0;
    });

    const context = {
      traceId: "trace-public-injected",
      outputDir: "D:/downloads",
      outputStem: "Injected Public Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=public123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=public123",
        pageUrl: "https://www.youtube.com/watch?v=public123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        extensionData: {
          youtube: {
            source: "injected",

          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "Injected Public Video.mp4"),
    });
  });

  it("does not retry youtube failures after the download has been aborted", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Cancelled Video"
        : path.join("D:/downloads", "Cancelled Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    const abortController = new AbortController();
    runStreamingCommandMock.mockImplementationOnce(async (_command, args, options) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--remote-components");
      abortController.abort();
      await options?.onStderrLine?.("ERROR: Sign in to confirm you're not a bot");
      return 1;
    });

    const context = {
      traceId: "trace-cancelled-youtube",
      outputDir: "D:/downloads",
      outputStem: "Cancelled Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=cancel123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=cancel123",
        pageUrl: "https://www.youtube.com/watch?v=cancel123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
        extensionData: {
          youtube: {
            source: "injected",

          },
        },
      },
      abortSignal: abortController.signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow("Sign in to confirm you're not a bot");
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({
      speed: "activity:youtube.retryingCompatibleExtractor",
    }));
  });

  it("retries failed YouTube clip downloads once with a conservative section format selector", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["5000-8000_Clip Video.mp4.part"])
      .mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Clip Video"
        : path.join("D:/downloads", "5000-8000_Clip Video.mp4")
    ));
    writeCookiesFileMock.mockResolvedValue("D:/temp/trace-section-retry-cookies.txt");
    runStreamingCommandMock
      .mockImplementationOnce(async (_command, args, options) => {
        expect(args).toContain("--download-sections");
        expect(args[args.indexOf("--download-sections") + 1]).toBe("*00:00:05-00:00:08");
        expect(args).toContain("--cookies");
        expect(args).toContain("D:/temp/trace-section-retry-cookies.txt");
        expect(args).toContain("--proxy");
        expect(args[args.indexOf("--proxy") + 1]).toBe("http://127.0.0.1:7890");
        await options?.onStderrLine?.("ERROR: ffmpeg exited with code 4294967158");
        await options?.onStderrLine?.("Press [q] to stop, [?] for help");
        return 1;
      })
      .mockImplementationOnce(async (_command, args) => {
        const formatIndex = args.indexOf("-f");
        expect(formatIndex).toBeGreaterThanOrEqual(0);
        expect(args[formatIndex + 1]).toContain("vcodec^=avc1");
        expect(args[formatIndex + 1]).toContain("acodec^=mp4a");
        expect(args[formatIndex + 1]).toContain("protocol^=http");
        expect(args[formatIndex + 1]).toContain("protocol!*=dash");
        expect(args).toContain("--download-sections");
        expect(args[args.indexOf("--download-sections") + 1]).toBe("*00:00:05-00:00:08");
        expect(args).toContain("--cookies");
        expect(args).toContain("D:/temp/trace-section-retry-cookies.txt");
        expect(args).toContain("--proxy");
        expect(args[args.indexOf("--proxy") + 1]).toBe("http://127.0.0.1:7890");
        return 0;
      });

    const context = {
      traceId: "trace-section-retry",
      outputDir: "D:/downloads",
      outputStem: "Clip Video",
      config: {},
      network: {
        route: {
          mode: "proxy",
          source: "system",
          protocol: "http",
          proxyUrl: "http://127.0.0.1:7890",
          resolvedFor: "https://www.bilibili.com/video/BV1xx411c7mD",
        },
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=clipretry",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=clipretry",
        pageUrl: "https://www.youtube.com/watch?v=clipretry",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5,
        clipEndSec: 8,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      filePath: path.join("D:/downloads", "5000-8000_Clip Video.mp4"),
    });
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(2);
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "5000-8000_Clip Video.mp4.part"));
  });

  it("does not retry YouTube clip failures for terminal availability errors", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["5000-8000_Clip Video.mp4.part"]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Clip Video"
        : path.join("D:/downloads", "5000-8000_Clip Video.mp4")
    ));
    runStreamingCommandMock.mockImplementationOnce(async (_command, _args, options) => {
      await options?.onStderrLine?.("ERROR: [youtube] clipretry: Private video");
      return 1;
    });

    const context = {
      traceId: "trace-private-section",
      outputDir: "D:/downloads",
      outputStem: "Clip Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=privateclip",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=privateclip",
        pageUrl: "https://www.youtube.com/watch?v=privateclip",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "balanced",
        clipStartSec: 5,
        clipEndSec: 8,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow("ERROR: [youtube] clipretry: Private video");
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(1);
  });

  it("uses the retry attempt stderr when a YouTube clip retry also fails", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Clip Video"
        : path.join("D:/downloads", "5000-8000_Clip Video.mp4")
    ));
    runStreamingCommandMock
      .mockImplementationOnce(async (_command, _args, options) => {
        await options?.onStderrLine?.("ERROR: first attempt failure");
        return 1;
      })
      .mockImplementationOnce(async (_command, _args, options) => {
        await options?.onStderrLine?.("ERROR: retry attempt failure");
        await options?.onStderrLine?.("Press [q] to stop, [?] for help");
        return 1;
      });

    const context = {
      traceId: "trace-section-retry-fails",
      outputDir: "D:/downloads",
      outputStem: "Clip Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=retryfails",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=retryfails",
        pageUrl: "https://www.youtube.com/watch?v=retryfails",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "balanced",
        clipStartSec: 5,
        clipEndSec: 8,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow("ERROR: retry attempt failure");
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(2);
  });
});
