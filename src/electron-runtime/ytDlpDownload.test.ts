import { describe, expect, it, vi } from "vitest";

const { readdirMock, readFileMock, unlinkMock, runStreamingCommandMock } = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
  unlinkMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
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
  writeCookiesFile: vi.fn(async () => null),
  cleanupCookiesFile: vi.fn(async () => undefined),
}));

import { runYtDlpDownload } from "./ytDlpDownload.js";

describe("runYtDlpDownload", () => {
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
    expect(unlinkMock).toHaveBeenCalledWith("D:\\downloads\\video.mp4.part");
    expect(unlinkMock).toHaveBeenCalledWith("D:\\downloads\\video.mp4.ytdl");
    expect(unlinkMock).toHaveBeenCalledWith("D:\\downloads\\video.f137.mp4");
    expect(unlinkMock).toHaveBeenCalledWith("D:\\downloads\\trace-yt-after-move.txt");
  });
});
