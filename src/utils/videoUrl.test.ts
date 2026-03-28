import { describe, expect, it } from "vitest";

import { isVideoUrl } from "./videoUrl";

describe("isVideoUrl", () => {
  it("detects supported video URLs on the normal path", () => {
    expect(isVideoUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD")).toBe(true);
    expect(isVideoUrl("https://www.xiaohongshu.com/explore/123")).toBe(true);
  });

  it("trims surrounding whitespace before checking a pasted or dropped URL", () => {
    expect(isVideoUrl("  https://www.youtube.com/watch?v=abc123  ")).toBe(true);
  });

  it("accepts uppercase HTTP(S) schemes", () => {
    expect(isVideoUrl("HTTPS://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isVideoUrl("HTTP://v.douyin.com/abcdef/")).toBe(true);
  });

  it("rejects unsupported or non-http(s) URLs", () => {
    expect(isVideoUrl("ftp://www.youtube.com/watch?v=abc123")).toBe(false);
    expect(isVideoUrl("https://example.com/article/123")).toBe(false);
    expect(isVideoUrl("javascript:alert(1)")).toBe(false);
  });
});
