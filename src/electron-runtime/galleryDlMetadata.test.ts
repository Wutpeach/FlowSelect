import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const {
  cleanupCookiesFileMock,
  runStreamingCommandMock,
  writeCookiesFileMock,
} = vi.hoisted(() => ({
  cleanupCookiesFileMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
  writeCookiesFileMock: vi.fn(async () => "D:/gallery-cookies.txt"),
}));

vi.mock("./processRunner.js", () => ({
  runStreamingCommand: runStreamingCommandMock,
}));

vi.mock("./sidecarCookies.js", () => ({
  cleanupCookiesFile: cleanupCookiesFileMock,
  writeCookiesFile: writeCookiesFileMock,
}));

import {
  extractGalleryDlProbeTitle,
  probeGalleryDlMetadataTitle,
  resolveGalleryDlMetadataTitleFromSidecars,
} from "./galleryDlMetadata.js";

describe("extractGalleryDlProbeTitle", () => {
  it("returns descriptive content when gallery metadata title is too generic", () => {
    expect(extractGalleryDlProbeTitle({
      title: "Instagram",
      user: { username: "alice" },
      content: "Sunset over the lake",
    })).toBe("alice - Sunset over the lake");
  });

  it("falls back to author plus stable id when no descriptive text exists", () => {
    expect(extractGalleryDlProbeTitle({
      title: "Instagram",
      user: { username: "alice" },
      shortcode: "C123XYZ",
    })).toBe("alice - C123XYZ");
  });

  it("treats branded Weibo page titles as weak and prefers post text", () => {
    expect(extractGalleryDlProbeTitle({
      title: "微博 - 随时随地发现新鲜事",
      user: { screen_name: "alice" },
      text_raw: "今天的晚霞很好看",
    })).toBe("alice - 今天的晚霞很好看");
  });

  it("reads nested Instagram caption text from GraphQL-style metadata", () => {
    expect(extractGalleryDlProbeTitle({
      title: "Instagram",
      owner: { username: "alice" },
      edge_media_to_caption: {
        edges: [
          {
            node: {
              text: "Sunset over the lake",
            },
          },
        ],
      },
    })).toBe("alice - Sunset over the lake");
  });

  it("prefers Instagram shortcode over a long description", () => {
    expect(extractGalleryDlProbeTitle({
      post_id: "3870191871168246909",
      post_shortcode: "DW1rwBtlnR9",
      description: "When a cross-continent road trip meets a concept, the story writes itself.",
      username: "karl_shakur",
      fullname: "Karl Ndieli",
      category: "instagram",
      subcategory: "post",
    })).toBe("karl_shakur - DW1rwBtlnR9");
  });
});

describe("probeGalleryDlMetadataTitle", () => {
  beforeEach(() => {
    cleanupCookiesFileMock.mockClear();
    runStreamingCommandMock.mockReset();
    writeCookiesFileMock.mockClear();
    writeCookiesFileMock.mockResolvedValue("D:/gallery-cookies.txt");
  });

  it("returns a descriptive title recovered from gallery-dl metadata", async () => {
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStdoutLine?.("{\"title\":\"Instagram\",\"user\":{\"username\":\"alice\"},\"content\":\"Sunset over the lake\"}");
      return 0;
    });

    await expect(probeGalleryDlMetadataTitle({
      sourceUrl: "https://www.instagram.com/p/C7example/",
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        galleryDl: "D:/gallery-dl.exe",
        ffmpeg: "D:/ffmpeg.exe",
        ffprobe: "D:/ffprobe.exe",
        deno: "D:/deno.exe",
      },
    })).resolves.toBe("alice - Sunset over the lake");
  });

  it("passes simulate and cookies args to gallery-dl", async () => {
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--dump-json");
      expect(args).toContain("--simulate");
      expect(args).toContain("--config-ignore");
      expect(args).toContain("--cookies");
      expect(args).toContain("D:/gallery-cookies.txt");
      return 0;
    });

    await probeGalleryDlMetadataTitle({
      sourceUrl: "https://www.instagram.com/p/C7example/",
      cookies: "cookie-data",
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        galleryDl: "D:/gallery-dl.exe",
        ffmpeg: "D:/ffmpeg.exe",
        ffprobe: "D:/ffprobe.exe",
        deno: "D:/deno.exe",
      },
    });

    expect(writeCookiesFileMock).toHaveBeenCalled();
    expect(cleanupCookiesFileMock).toHaveBeenCalledWith("D:/gallery-cookies.txt");
  });
});

describe("resolveGalleryDlMetadataTitleFromSidecars", () => {
  it("reads a better title from an info-json sidecar", async () => {
    const outputDir = await import("node:fs/promises").then(({ mkdtemp, writeFile, rm }) => ({
      mkdtemp,
      writeFile,
      rm,
    })).then(async ({ mkdtemp, writeFile, rm }) => {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = await mkdtemp(join(tmpdir(), "flowselect-gallery-sidecar-"));
      await writeFile(
        join(dir, "Instagram.info.json"),
        JSON.stringify({
          title: "Instagram",
          user: { username: "alice" },
          content: "Sunset over the lake",
        }),
        "utf8",
      );
      return { dir, rm };
    });

    try {
      await expect(
        resolveGalleryDlMetadataTitleFromSidecars(outputDir.dir, "Instagram"),
      ).resolves.toBe("alice - Sunset over the lake");
    } finally {
      await outputDir.rm(outputDir.dir, { recursive: true, force: true });
    }
  });

  it("uses a shortcode-based title for real Instagram sidecars with long descriptions", async () => {
    const outputDir = await import("node:fs/promises").then(({ mkdtemp, writeFile, rm }) => ({
      mkdtemp,
      writeFile,
      rm,
    })).then(async ({ mkdtemp, writeFile, rm }) => {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = await mkdtemp(join(tmpdir(), "flowselect-gallery-sidecar-"));
      await writeFile(
        join(dir, "Instagram.info.json"),
        JSON.stringify({
          post_id: "3870191871168246909",
          post_shortcode: "DW1rwBtlnR9",
          description: "When a cross-continent road trip meets a concept, the story writes itself.",
          username: "karl_shakur",
          fullname: "Karl Ndieli",
        }),
        "utf8",
      );
      return { dir, rm };
    });

    try {
      await expect(
        resolveGalleryDlMetadataTitleFromSidecars(outputDir.dir, "Instagram"),
      ).resolves.toBe("karl_shakur - DW1rwBtlnR9");
    } finally {
      await outputDir.rm(outputDir.dir, { recursive: true, force: true });
    }
  });

  it("reads metadata from a generic info.json sidecar", async () => {
    const outputDir = await import("node:fs/promises").then(({ mkdtemp, writeFile, rm }) => ({
      mkdtemp,
      writeFile,
      rm,
    })).then(async ({ mkdtemp, writeFile, rm }) => {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = await mkdtemp(join(tmpdir(), "flowselect-gallery-sidecar-"));
      await writeFile(
        join(dir, "info.json"),
        JSON.stringify({
          post_id: "3870191871168246909",
          post_shortcode: "DW1rwBtlnR9",
          description: "When a cross-continent road trip meets a concept, the story writes itself.",
          username: "karl_shakur",
          fullname: "Karl Ndieli",
        }),
        "utf8",
      );
      return { dir, rm };
    });

    try {
      await expect(
        resolveGalleryDlMetadataTitleFromSidecars(
          outputDir.dir,
          "Instagram",
          path.join(outputDir.dir, "Instagram.mp4"),
        ),
      ).resolves.toBe("karl_shakur - DW1rwBtlnR9");
    } finally {
      await outputDir.rm(outputDir.dir, { recursive: true, force: true });
    }
  });
});
