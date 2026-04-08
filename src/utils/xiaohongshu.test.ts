import { describe, expect, it } from "vitest";

import {
  extractEmbeddedXiaohongshuDragPayload,
  isXiaohongshuPageUrl,
  looksLikeXiaohongshuVideoHtml,
} from "./xiaohongshu";

function encodePayload(payload: object): string {
  const json = JSON.stringify(payload);
  return `FLOWSELECT_XIAOHONGSHU_DRAG:${btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
  )}`;
}

describe("isXiaohongshuPageUrl", () => {
  it("recognizes Xiaohongshu note urls", () => {
    expect(isXiaohongshuPageUrl("https://www.xiaohongshu.com/explore/123")).toBe(true);
    expect(isXiaohongshuPageUrl("https://xhslink.com/abc")).toBe(true);
    expect(isXiaohongshuPageUrl("https://example.com/post/123")).toBe(false);
  });
});

describe("looksLikeXiaohongshuVideoHtml", () => {
  it("detects explicit video hints in dragged html", () => {
    expect(
      looksLikeXiaohongshuVideoHtml(`
        <div>
          <video src="https://sns-video-bd.xhscdn.com/stream/example.mp4"></video>
        </div>
      `),
    ).toBe(true);
    expect(
      looksLikeXiaohongshuVideoHtml(`
        <a href="https://www.xiaohongshu.com/explore/123">
          <img src="https://sns-webpic-qc.xhscdn.com/example?imageView2/2/w/540/format/jpg" />
        </a>
      `),
    ).toBe(false);
  });
});

describe("extractEmbeddedXiaohongshuDragPayload", () => {
  it("parses image drag payloads", () => {
    expect(
      extractEmbeddedXiaohongshuDragPayload(
        `${"https://www.xiaohongshu.com/explore/69d3d28a00000000210040a4"}\n${encodePayload({
          pageUrl: "https://www.xiaohongshu.com/explore/69d3d28a00000000210040a4",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/example-note-cover?imageView2/2/w/540/format/jpg",
          mediaType: "image",
          title: "Image note",
        })}`,
      ),
    ).toEqual({
      token: null,
      pageUrl: "https://www.xiaohongshu.com/explore/69d3d28a00000000210040a4",
      noteId: null,
      exactImageUrl: null,
      imageUrl: "https://sns-webpic-qc.xhscdn.com/example-note-cover?imageView2/2/w/540/format/jpg",
      videoUrl: null,
      videoCandidates: [],
      mediaType: "image",
      title: "Image note",
    });
  });

  it("preserves explicit video payload metadata", () => {
    expect(
      extractEmbeddedXiaohongshuDragPayload(
        encodePayload({
          token: "flowselect-xhs-token",
          pageUrl: "https://www.xiaohongshu.com/explore/69d4d5170000000022024263",
          noteId: "69d4d5170000000022024263",
          exactImageUrl: "https://sns-webpic-qc.xhscdn.com/example-note-cover",
          mediaType: "video",
          videoUrl: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
          videoCandidates: [
            {
              url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
              type: "direct_cdn",
              source: "drag_scope",
              confidence: "medium",
              mediaType: "video",
            },
          ],
        }),
      ),
    ).toEqual({
      token: "flowselect-xhs-token",
      pageUrl: "https://www.xiaohongshu.com/explore/69d4d5170000000022024263",
      noteId: "69d4d5170000000022024263",
      exactImageUrl: "https://sns-webpic-qc.xhscdn.com/example-note-cover",
      imageUrl: null,
      videoUrl: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
      videoCandidates: [
        {
          url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
          type: "direct_cdn",
          source: "drag_scope",
          confidence: "medium",
          mediaType: "video",
        },
      ],
      mediaType: "video",
      title: null,
    });
  });

  it("rejects invalid payload urls instead of trusting them", () => {
    expect(
      extractEmbeddedXiaohongshuDragPayload(
        encodePayload({
          pageUrl: "javascript:alert(1)",
          imageUrl: "blob:https://www.xiaohongshu.com/example",
          mediaType: "image",
        }),
      ),
    ).toEqual({
      token: null,
      pageUrl: null,
      noteId: null,
      exactImageUrl: null,
      imageUrl: null,
      videoUrl: null,
      videoCandidates: [],
      mediaType: "image",
      title: null,
    });
  });
});
