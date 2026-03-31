import { describe, expect, it, vi } from "vitest";

const { readdirMock, unlinkMock, runStreamingCommandMock } = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  unlinkMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    readdir: readdirMock,
    unlink: unlinkMock,
  },
}));

vi.mock("./processRunner.js", () => ({
  runStreamingCommand: runStreamingCommandMock,
}));

vi.mock("./sidecarCookies.js", () => ({
  writeCookiesFile: vi.fn(async (traceId: string, cookies: string | undefined) => (
    cookies?.trim() ? `C:/temp/${traceId}-cookies.txt` : null
  )),
  cleanupCookiesFile: vi.fn(async () => undefined),
}));

import { DownloadRuntimeError } from "../core/index.js";
import { runGalleryDlDownload } from "./galleryDlDownload.js";

describe("runGalleryDlDownload", () => {
  it("switches gallery-dl tasks into downloading state before detailed output is available", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockResolvedValue(0);
    const onProgress = vi.fn(async () => undefined);

    const context = {
      traceId: "trace-progress",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      message: "gallery-dl finished without producing an output file",
    } satisfies Partial<DownloadRuntimeError>);

    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({
      traceId: "trace-progress",
      percent: 0,
      stage: "preparing",
    }));
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({
      traceId: "trace-progress",
      percent: -1,
      stage: "downloading",
      speed: "activity:galleryDl.resolvingMedia",
    }));
  });

  it("passes extension cookies to gallery-dl through a Netscape cookie file", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--cookies");
      const cookieFlagIndex = args.indexOf("--cookies");
      expect(cookieFlagIndex).toBeGreaterThanOrEqual(0);
      expect(String(args[cookieFlagIndex + 1] ?? "")).toMatch(/trace-cookie-cookies\.txt$/);
      return 0;
    });

    const context = {
      traceId: "trace-cookie",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
        cookies: "# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\tsid\tabc",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      message: "gallery-dl finished without producing an output file",
    } satisfies Partial<DownloadRuntimeError>);
  });

  it("maps gallery-dl output lines to human-friendly activity labels", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["pin.mp4"]);
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStdoutLine?.("[gallery-dl][info] collecting pin metadata");
      return 0;
    });

    const context = {
      traceId: "trace-humanized",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runGalleryDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: "D:\\downloads\\pin.mp4",
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-humanized",
      stage: "downloading",
      speed: "activity:galleryDl.collectingMetadata",
    }));
  });

  it("surfaces the tail of gallery-dl stderr when the command fails", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["pin.mp4.part", "pin.mp4.txt"]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStdoutLine?.("[gallery-dl][info] collecting pin metadata");
      await options.onStderrLine?.("HTTP Error 403: Forbidden");
      return 4;
    });

    const context = {
      traceId: "trace-1",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      message: "gallery-dl exited with code 4: HTTP Error 403: Forbidden",
    } satisfies Partial<DownloadRuntimeError>);
    expect(unlinkMock).toHaveBeenCalledWith("D:\\downloads\\pin.mp4.part");
    expect(unlinkMock).toHaveBeenCalledWith("D:\\downloads\\pin.mp4.txt");
  });
});
