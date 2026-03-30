import { describe, expect, it } from "vitest";

import {
  normalizeVideoCandidates,
  normalizeVideoCandidateUrls,
  normalizeVideoHintUrl,
  normalizeVideoPageUrl,
  normalizeRequiredVideoRouteUrl,
  resolveVideoSelectionSiteHint,
} from "./videoHintNormalization.mjs";

describe("normalizeVideoHintUrl", () => {
  it("keeps valid direct video hint URLs", () => {
    expect(
      normalizeVideoHintUrl(" https://v.pinimg.com/videos/iht/expmp4/video.mp4 "),
    ).toBe("https://v.pinimg.com/videos/iht/expmp4/video.mp4");
  });

  it("drops non-HTTP(S) hint URLs", () => {
    expect(normalizeVideoHintUrl(" blob:https://www.pinterest.com/opaque-id ")).toBeUndefined();
    expect(normalizeVideoHintUrl(" data:text/plain;base64,SGVsbG8= ")).toBeUndefined();
    expect(normalizeVideoHintUrl(" javascript:alert('xss') ")).toBeUndefined();
    expect(normalizeVideoHintUrl(" ftp://v.pinimg.com/videos/iht/expmp4/video.mp4 ")).toBeUndefined();
  });

  it("drops HTTP(S) Pinterest hint URLs that are not actual video candidates", () => {
    expect(normalizeVideoHintUrl(" https://www.pinterest.com/pin/1234567890/ ", "pinterest")).toBeUndefined();
    expect(normalizeVideoHintUrl(" https://i.pinimg.com/originals/example.jpg ", "pinterest")).toBeUndefined();
    expect(normalizeVideoHintUrl(" https://cdn.example.com/watch?v=123 ", "pinterest")).toBeUndefined();
  });

  it("keeps non-Pinterest HTTP(S) hints when the runtime owns validation", () => {
    expect(
      normalizeVideoHintUrl(
        " https://sns-video-bd.xhscdn.com/stream/example.mp4 ",
        "xiaohongshu",
      ),
    ).toBe("https://sns-video-bd.xhscdn.com/stream/example.mp4");
  });
});

describe("normalizeRequiredVideoRouteUrl", () => {
  it("keeps valid HTTP(S) primary route urls", () => {
    expect(
      normalizeRequiredVideoRouteUrl(" https://www.pinterest.com/pin/1234567890/ "),
    ).toBe("https://www.pinterest.com/pin/1234567890/");
  });

  it("rejects invalid primary route urls", () => {
    expect(normalizeRequiredVideoRouteUrl(" blob:https://www.pinterest.com/opaque-id ")).toBeUndefined();
    expect(normalizeRequiredVideoRouteUrl(" javascript:alert('xss') ")).toBeUndefined();
    expect(normalizeRequiredVideoRouteUrl(" ftp://v.pinimg.com/videos/iht/expmp4/video.mp4 ")).toBeUndefined();
  });
});

describe("normalizeVideoPageUrl", () => {
  it("keeps valid HTTP(S) page urls", () => {
    expect(
      normalizeVideoPageUrl(" https://www.pinterest.com/pin/1234567890/ "),
    ).toBe("https://www.pinterest.com/pin/1234567890/");
  });

  it("rejects invalid page urls", () => {
    expect(normalizeVideoPageUrl(" javascript:alert('xss') ")).toBeUndefined();
    expect(normalizeVideoPageUrl(" data:text/plain;base64,SGVsbG8= ")).toBeUndefined();
    expect(normalizeVideoPageUrl(" ftp://www.pinterest.com/pin/1234567890/ ")).toBeUndefined();
  });
});

describe("normalizeVideoCandidateUrls", () => {
  it("filters invalid candidates and prioritizes direct mp4 hints ahead of manifests", () => {
    expect(
      normalizeVideoCandidateUrls([
        { url: " javascript:alert('xss') " },
        { url: "https://www.pinterest.com/pin/1234567890/" },
        { url: "https://v.pinimg.com/videos/iht/hls/video.m3u8" },
        { url: " blob:https://www.pinterest.com/opaque-id " },
        { url: "https://i.pinimg.com/originals/example.jpg" },
        { url: " https://v.pinimg.com/videos/iht/expmp4/video.mp4 " },
        { url: "https://v.pinimg.com/videos/iht/hls/video.m3u8" },
      ], "pinterest"),
    ).toEqual([
      "https://v.pinimg.com/videos/iht/expmp4/video.mp4",
      "https://v.pinimg.com/videos/iht/hls/video.m3u8",
    ]);
  });
});

describe("normalizeVideoCandidates", () => {
  it("preserves candidate metadata for non-Pinterest site hints", () => {
    expect(
      normalizeVideoCandidates([
        {
          url: " https://sns-video-bd.xhscdn.com/stream/example.mp4 ",
          type: "direct_mp4",
          source: "video_element",
          confidence: "high",
          mediaType: "video",
        },
        {
          url: " https://www.xiaohongshu.com/explore/66112233445566778899 ",
          type: "page_url",
        },
      ], "xiaohongshu"),
    ).toEqual([
      {
        url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
        type: "direct_mp4",
        source: "video_element",
        confidence: "high",
        mediaType: "video",
      },
      {
        url: "https://www.xiaohongshu.com/explore/66112233445566778899",
        type: "page_url",
        source: undefined,
        confidence: undefined,
        mediaType: undefined,
      },
    ]);
  });
});

describe("resolveVideoSelectionSiteHint", () => {
  it("normalizes aliases and falls back to url detection", () => {
    expect(resolveVideoSelectionSiteHint("xhs")).toBe("xiaohongshu");
    expect(resolveVideoSelectionSiteHint(undefined, "https://x.com/flowselect/status/123")).toBe("twitter-x");
  });
});
