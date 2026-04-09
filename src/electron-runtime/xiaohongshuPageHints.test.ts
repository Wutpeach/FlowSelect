import { describe, expect, it } from "vitest";

import {
  resolveXiaohongshuDragMedia,
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

  it("ignores xhscdn static bundles when scanning html image fallbacks", async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      `
        <html>
          <head>
            <script src="https://fe-static.xhscdn.com/as/v1/3e44/public/04b29480233f4def5c875875b6bdc3b1.js"></script>
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
      kind: "unknown",
      pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
      imageUrl: null,
      videoUrl: null,
      videoCandidates: [],
    });
  });
});

describe("resolveXiaohongshuDragMedia", () => {
  it("uses note-detail api fallback for video notes when drag payload lacks a direct video url", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/api/sns/web/v1/feed")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  note_card: {
                    type: "video",
                    video: {
                      media: {
                        stream: {
                          h264: [
                            {
                              master_url: "https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4",
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          },
        );
      }

      if (url.includes("/api/sns/web/v1/note/")) {
        return new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      }

      return new Response("<html><body>unused html fallback</body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    };

    await expect(
      resolveXiaohongshuDragMedia(
        {
          url: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
          pageUrl: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
          noteId: "69d4720e000000001d01a7d7",
          mediaType: "video",
          siteHint: "xiaohongshu",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      kind: "video",
      pageUrl: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
      imageUrl: null,
      videoUrl: "https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4",
      videoCandidates: [
        {
          url: "https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4",
          type: "direct_cdn",
          source: "detail_api",
          confidence: "high",
          mediaType: "video",
        },
      ],
    });
  });

  it("prefers resolved note-level image results over raw drag image hints", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/sns/web/v1/feed")) {
        return new Response(
          JSON.stringify({
            data: {
              note_card: {
                image_list: [
                  {
                    info_list: [
                      {
                        url: "https://sns-webpic-qc.xhscdn.com/resolved-image?imageView2/2/w/1080/format/jpg",
                      },
                    ],
                  },
                ],
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          },
        );
      }

      return new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    };

    await expect(
      resolveXiaohongshuDragMedia(
        {
          url: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
          pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
          noteId: "69d5e2f0000000001a023be5",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/drag-hint?imageView2/2/w/540/format/jpg",
          mediaType: "image",
          siteHint: "xiaohongshu",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      kind: "image",
      pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
      imageUrl: "https://sns-webpic-qc.xhscdn.com/resolved-image?imageView2/2/w/1080/format/jpg",
      videoUrl: null,
      videoCandidates: [],
    });
  });

  it("keeps video-note intent when the api only exposes cover media", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/sns/web/v1/feed")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  note_card: {
                    type: "video",
                    image_list: [
                      {
                        info_list: [
                          {
                            url: "https://sns-webpic-qc.xhscdn.com/video-cover?imageView2/2/w/1080/format/jpg",
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          },
        );
      }

      return new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    };

    await expect(
      resolveXiaohongshuDragMedia(
        {
          url: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
          pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
          noteId: "69d5e2f0000000001a023be5",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/drag-cover?imageView2/2/w/540/format/jpg",
          mediaType: "image",
          siteHint: "xiaohongshu",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      kind: "video",
      pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
      imageUrl: "https://sns-webpic-qc.xhscdn.com/video-cover?imageView2/2/w/1080/format/jpg",
      videoUrl: null,
      videoCandidates: [],
    });
  });

  it("keeps video intent when apis fail and html only exposes cover media", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/sns/web/v1/feed") || url.includes("/api/sns/web/v1/note/")) {
        return new Response("{}", {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      }

      return new Response(
        `
          <html>
            <head>
              <meta property="og:image" content="https://sns-webpic-qc.xhscdn.com/video-cover?imageView2/2/w/1080/format/jpg" />
              <script src="https://fe-static.xhscdn.com/as/v1/3e44/public/04b29480233f4def5c875875b6bdc3b1.js"></script>
            </head>
            <body>
              <script>
                window.__INITIAL_STATE__ = {
                  note: {
                    note_card: {
                      type: "video"
                    }
                  }
                };
              </script>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        },
      );
    };

    await expect(
      resolveXiaohongshuDragMedia(
        {
          url: "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69ce44ea000000001b0031bb",
          pageUrl: "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69ce44ea000000001b0031bb",
          noteId: "69ce44ea000000001b0031bb",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/drag-cover?imageView2/2/w/540/format/jpg",
          mediaType: "image",
          siteHint: "xiaohongshu",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      kind: "video",
      pageUrl: "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69ce44ea000000001b0031bb",
      imageUrl: "https://sns-webpic-qc.xhscdn.com/video-cover?imageView2/2/w/1080/format/jpg",
      videoUrl: null,
      videoCandidates: [],
    });
  });

  it("preserves high-confidence video intent when desktop fallback only sees a cover image", async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      `
        <html>
          <head>
            <meta property="og:image" content="https://sns-webpic-qc.xhscdn.com/video-cover?imageView2/2/w/1080/format/jpg" />
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
      resolveXiaohongshuDragMedia(
        {
          url: "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69ce44ea000000001b0031bb",
          pageUrl: "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69ce44ea000000001b0031bb",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/drag-cover?imageView2/2/w/540/format/jpg",
          mediaType: "image",
          videoIntentConfidence: 1,
          videoIntentSources: ["__INITIAL_STATE__.user.notes[0][3].noteCard.type"],
          siteHint: "xiaohongshu",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      kind: "video",
      pageUrl: "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69ce44ea000000001b0031bb",
      imageUrl: "https://sns-webpic-qc.xhscdn.com/video-cover?imageView2/2/w/1080/format/jpg",
      videoUrl: null,
      videoCandidates: [],
      videoIntentConfidence: 1,
      videoIntentSources: ["__INITIAL_STATE__.user.notes[0][3].noteCard.type"],
    });
  });

  it("ignores bare xhscdn host urls as image hints", async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      `<html><body><h1>plain note page</h1></body></html>`,
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );

    await expect(
      resolveXiaohongshuDragMedia(
        {
          url: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
          pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
          noteId: "69d5e2f0000000001a023be5",
          imageUrl: "https://sns-webpic-qc.xhscdn.com/",
          mediaType: "image",
          siteHint: "xiaohongshu",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      kind: "unknown",
      pageUrl: "https://www.xiaohongshu.com/explore/69d5e2f0000000001a023be5",
      imageUrl: null,
      videoUrl: null,
      videoCandidates: [],
    });
  });
});
