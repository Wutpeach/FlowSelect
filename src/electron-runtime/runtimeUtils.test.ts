import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildOutputStem, resolveAvailableOutputStem, sanitizeFileStem } from "./runtimeUtils";

describe("buildOutputStem", () => {
  it("decodes percent-escaped path segments before deriving the output stem", () => {
    expect(
      buildOutputStem(
        "trace-1",
        "https://cdn.example.com/videos/My%20Clip%20%281%29.mp4",
        {},
      ),
    ).toBe("My Clip (1)");
  });

  it("uses a pinterest short-id stem for pinterest requests", () => {
    expect(
      buildOutputStem(
        "trace-1",
        "https://www.pinterest.com/pin/403705554121341216/",
        {},
        undefined,
        "pinterest",
      ),
    ).toMatch(/^pinterest_[0-9a-f]{6}$/);
  });

  it("prefers title-first stems even for pinterest requests", () => {
    expect(
      buildOutputStem(
        "trace-1",
        "https://www.pinterest.com/pin/403705554121341216/",
        {},
        "Pin Title",
        "pinterest",
      ),
    ).toBe("Pin Title");
  });

  it("keeps title-first source naming even when rename mode is enabled", () => {
    expect(
      buildOutputStem(
        "trace-1",
        "https://www.bilibili.com/video/BV1xx411c7mD",
        { renameMediaOnDownload: true },
        "Sample Video",
      ),
    ).toBe("Sample Video");
  });
});

describe("sanitizeFileStem", () => {
  it("removes unsafe filename characters while preserving readable text", () => {
    expect(sanitizeFileStem("Bad<>:\\Name?.mp4")).toBe("Bad Name .mp4");
  });

  it("avoids reserved Windows device names", () => {
    expect(sanitizeFileStem("CON")).toBe("CON_");
    expect(sanitizeFileStem("lpt1")).toBe("lpt1_");
  });

  it("avoids reserved Windows device names even when they are followed by dot suffixes", () => {
    expect(sanitizeFileStem("CON.txt")).toBe("CON_.txt");
    expect(sanitizeFileStem("nul.part1")).toBe("nul_.part1");
  });
});

describe("resolveAvailableOutputStem", () => {
  it("adds a numeric suffix when the preferred stem already exists on disk", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-runtime-utils-"));
    try {
      writeFileSync(path.join(outputDir, "Pin 图卡片.mp4"), "video");
      writeFileSync(path.join(outputDir, "Pin 图卡片 (2).mp4"), "video");

      await expect(resolveAvailableOutputStem(outputDir, "Pin 图卡片")).resolves.toBe("Pin 图卡片 (3)");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("ignores sidecar artifacts when picking the next available stem", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-runtime-utils-"));
    try {
      writeFileSync(path.join(outputDir, "Pin 图卡片.txt"), "metadata");
      writeFileSync(path.join(outputDir, "Pin 图卡片.mp4.part"), "partial");

      await expect(resolveAvailableOutputStem(outputDir, "Pin 图卡片")).resolves.toBe("Pin 图卡片");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("reserves suffixes that are already claimed by active tasks", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-runtime-utils-"));
    try {
      await expect(
        resolveAvailableOutputStem(outputDir, "Pin 图卡片", ["Pin 图卡片", "Pin 图卡片 (2)"]),
      ).resolves.toBe("Pin 图卡片 (3)");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
