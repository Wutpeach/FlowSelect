import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/xiaohongshu-drag-resolution-utils.js");
const helperSource = readFileSync(helperPath, "utf8");

function loadHelpers() {
  const context = {
    self: {},
    globalThis: {},
  };

  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.FlowSelectXiaohongshuDragResolutionUtils;
}

describe("xiaohongshu drag resolution utils", () => {
  it("treats resolved image media as usable for image-targeted requests", () => {
    const helpers = loadHelpers();

    expect(
      helpers.hasResolvedXiaohongshuDragMedia(
        {
          kind: "image",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/example.jpg",
          videoUrl: null,
          videoCandidates: [],
        },
        {
          mediaType: "image",
          videoIntentConfidence: 0,
        },
      ),
    ).toBe(true);
  });

  it("keeps image results non-usable when strong video intent is present", () => {
    const helpers = loadHelpers();

    expect(
      helpers.hasResolvedXiaohongshuDragMedia(
        {
          kind: "image",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/example.jpg",
          videoUrl: null,
          videoCandidates: [],
          videoIntentConfidence: 1,
        },
        {
          mediaType: "image",
          videoIntentConfidence: 1,
        },
      ),
    ).toBe(true);
  });

  it("treats explicit video results as usable regardless of requested media type", () => {
    const helpers = loadHelpers();

    expect(
      helpers.hasResolvedXiaohongshuDragMedia(
        {
          kind: "video",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/example.jpg",
          videoUrl: null,
          videoCandidates: [],
        },
        {
          mediaType: "image",
          videoIntentConfidence: 0,
        },
      ),
    ).toBe(true);
  });
});
