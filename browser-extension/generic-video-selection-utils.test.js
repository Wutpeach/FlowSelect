import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/generic-video-selection-utils.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
    URL,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.FlowSelectGenericVideoSelectionUtils;
};

describe("generic video selection utils", () => {
  it("merges candidates by url and keeps the stronger direct hint", () => {
    const helper = loadHelper();

    expect(helper.mergeVideoCandidates(
      [
        {
          url: "https://cdn.example.com/video/master.m3u8",
          type: "manifest_m3u8",
          confidence: "medium",
          source: "performance_resource",
        },
      ],
      [
        {
          url: "https://cdn.example.com/video/master.m3u8",
          type: "manifest_m3u8",
          confidence: "low",
          source: "video_element",
        },
        {
          url: "https://cdn.example.com/video/final.mp4",
          type: "direct_mp4",
          confidence: "high",
          source: "video_element",
        },
      ],
      [
        {
          url: "blob:https://example.com/123",
          type: "direct_mp4",
          confidence: "high",
          source: "video_element",
        },
      ],
    )).toEqual([
      {
        url: "https://cdn.example.com/video/final.mp4",
        type: "direct_mp4",
        confidence: "high",
        source: "video_element",
      },
      {
        url: "https://cdn.example.com/video/master.m3u8",
        type: "manifest_m3u8",
        confidence: "medium",
        source: "performance_resource",
      },
    ]);
  });

  it("prefers direct video assets over manifest urls", () => {
    const helper = loadHelper();

    expect(helper.selectPreferredVideoUrl([
      {
        url: "https://cdn.example.com/video/master.m3u8",
        type: "manifest_m3u8",
        confidence: "high",
        source: "performance_resource",
      },
      {
        url: "https://cdn.example.com/video/final.mp4",
        type: "direct_mp4",
        confidence: "medium",
        source: "video_element",
      },
    ])).toBe("https://cdn.example.com/video/final.mp4");
  });
});
