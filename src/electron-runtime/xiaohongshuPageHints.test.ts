import { describe, expect, it } from "vitest";

import {
  resolveXiaohongshuPageHints,
  resolveXiaohongshuPageMedia,
} from "./xiaohongshuPageHints";

describe("resolveXiaohongshuPageHints", () => {
  it("hydrates Xiaohongshu page requests with direct video candidates from fetched html", async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      `
        <html>
          <script>
            window.__INITIAL_STATE__ = {
              note: {
                video: {
                  url: "https:\\/\\/sns-video-bd.xhscdn.com\\/stream\\/example-1080p.mp4"
                }
              }
            };
          </script>
        </html>
      `,
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );

    const resolved = await resolveXiaohongshuPageHints(
      {
        url: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
        pageUrl: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
        siteHint: "xiaohongshu",
      },
      fetchImpl,
    );

    expect(resolved.videoUrl).toBe("https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4");
    expect(resolved.videoCandidates).toEqual([
      {
        url: "https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4",
        type: "direct_cdn",
        source: "page_html",
        confidence: "high",
        mediaType: "video",
      },
    ]);
  });

  it("preserves existing direct hints without refetching", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("", { status: 200 });
    };

    const resolved = await resolveXiaohongshuPageHints(
      {
        url: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
        pageUrl: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
        videoUrl: "https://sns-video-bd.xhscdn.com/stream/existing.mp4",
        siteHint: "xiaohongshu",
      },
      fetchImpl,
    );

    expect(called).toBe(false);
    expect(resolved.videoUrl).toBe("https://sns-video-bd.xhscdn.com/stream/existing.mp4");
  });

  it("returns the original request when no xhscdn media is present", async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      `<html><body><h1>plain note page</h1></body></html>`,
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );

    const original = {
      url: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
      pageUrl: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
      siteHint: "xiaohongshu" as const,
    };

    await expect(resolveXiaohongshuPageHints(original, fetchImpl)).resolves.toEqual(original);
  });

  it("resolves image notes to a canonical page image", async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      `
        <html>
          <head>
            <meta property="og:image" content="https://sns-webpic-qc.xhscdn.com/example-note-cover?imageView2/2/w/1080/format/jpg" />
          </head>
        </html>
      `,
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );

    await expect(
      resolveXiaohongshuPageMedia(
        {
          url: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
          pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      kind: "image",
      pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
      imageUrl: "https://sns-webpic-qc.xhscdn.com/example-note-cover?imageView2/2/w/1080/format/jpg",
      videoUrl: null,
      videoCandidates: [],
    });
  });
});
