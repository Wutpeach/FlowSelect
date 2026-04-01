import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cleanupCookiesFileMock,
  runStreamingCommandMock,
  writeCookiesFileMock,
} = vi.hoisted(() => ({
  cleanupCookiesFileMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
  writeCookiesFileMock: vi.fn(async () => "D:/cookies.txt"),
}));

vi.mock("./processRunner.js", () => ({
  runStreamingCommand: runStreamingCommandMock,
}));

vi.mock("./sidecarCookies.js", () => ({
  cleanupCookiesFile: cleanupCookiesFileMock,
  writeCookiesFile: writeCookiesFileMock,
}));

import { probeYtDlpMetadataTitle } from "./ytDlpMetadata.js";

describe("probeYtDlpMetadataTitle", () => {
  beforeEach(() => {
    cleanupCookiesFileMock.mockClear();
    runStreamingCommandMock.mockReset();
    writeCookiesFileMock.mockClear();
    writeCookiesFileMock.mockResolvedValue("D:/cookies.txt");
  });

  it("returns the title from yt-dlp metadata output", async () => {
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStdoutLine?.("{\"title\":\"Recovered Title\"}");
      return 0;
    });

    await expect(probeYtDlpMetadataTitle({
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        galleryDl: "D:/gallery-dl.exe",
        ffmpeg: "D:/ffmpeg.exe",
        ffprobe: "D:/ffprobe.exe",
        deno: "D:/deno.exe",
      },
    })).resolves.toBe("Recovered Title");
  });

  it("passes cookies, referer, current-item no-playlist, and YouTube extractor args", async () => {
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--dump-single-json");
      expect(args).toContain("--no-playlist");
      expect(args).toContain("--cookies");
      expect(args).toContain("D:/cookies.txt");
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      expect(args).toContain("ejs:github");
      expect(args).toContain("--add-header");
      expect(args).toContain("Referer:https://www.youtube.com/watch?v=abc123");
      return 0;
    });

    await probeYtDlpMetadataTitle({
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      cookies: "cookie-data",
      selectionScope: "current_item",
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        galleryDl: "D:/gallery-dl.exe",
        ffmpeg: "D:/ffmpeg.exe",
        ffprobe: "D:/ffprobe.exe",
        deno: "D:/deno.exe",
      },
    });

    expect(writeCookiesFileMock).toHaveBeenCalled();
    expect(cleanupCookiesFileMock).toHaveBeenCalledWith("D:/cookies.txt");
  });
});
