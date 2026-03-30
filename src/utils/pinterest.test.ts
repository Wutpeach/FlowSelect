import { describe, expect, it } from "vitest";

import {
  extractEmbeddedPinterestDragPayload,
  extractPinterestVideoSelectionFromHtml,
  isPinterestPinUrl,
} from "./pinterest";

function encodeEmbeddedPayload(payload: object): string {
  const json = JSON.stringify(payload);
  return `FLOWSELECT_PINTEREST_DRAG:${btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
  )}`;
}

describe("isPinterestPinUrl", () => {
  it("accepts canonical Pinterest pin URLs", () => {
    expect(isPinterestPinUrl("https://www.pinterest.com/pin/403705554121341216/")).toBe(true);
    expect(isPinterestPinUrl("https://pin.it/pin/403705554121341216/")).toBe(false);
    expect(isPinterestPinUrl("https://www.pinterest.com/pin/not-a-number/")).toBe(false);
  });
});

describe("extractPinterestVideoSelectionFromHtml", () => {
  it("prefers direct mp4 candidates over manifest candidates from raw HTML", () => {
    const selection = extractPinterestVideoSelectionFromHtml(`
      <div>
        https://v1.pinimg.com/videos/iht/hls/example-video.m3u8
        https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4
        blob:https://www.pinterest.com/not-usable
      </div>
    `);

    expect(selection.videoUrl).toBe(
      "https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4",
    );
    expect(selection.videoCandidates).toEqual([
      {
        url: "https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4",
        type: "direct_mp4",
        source: "html_scan",
        confidence: "medium",
      },
      {
        url: "https://v1.pinimg.com/videos/iht/hls/example-video.m3u8",
        type: "manifest_m3u8",
        source: "html_scan",
        confidence: "low",
      },
    ]);
  });
});

describe("extractEmbeddedPinterestDragPayload", () => {
  it("drops embedded videoUrl values that are not actual video hints", () => {
    const payload = encodeEmbeddedPayload({
      pageUrl: "https://www.pinterest.com/pin/403705554121341216/",
      videoUrl: "https://www.pinterest.com/pin/403705554121341216/",
      videoCandidates: [
        {
          url: "https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4",
          type: "direct_mp4",
          source: "embedded_drag_payload",
          confidence: "high",
        },
      ],
      title: "Example pin",
    });

    expect(extractEmbeddedPinterestDragPayload(payload)).toEqual({
      pageUrl: "https://www.pinterest.com/pin/403705554121341216/",
      videoUrl: null,
      videoCandidates: [
        {
          url: "https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4",
          type: "direct_mp4",
          source: "embedded_drag_payload",
          confidence: "high",
        },
      ],
      title: "Example pin",
    });
  });
});
