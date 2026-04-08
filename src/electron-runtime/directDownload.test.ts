import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EngineExecutionContext } from "../core/index.js";
import { runDirectVideoDownload } from "./directDownload.js";

const createContext = (
  overrides: Partial<EngineExecutionContext>,
): EngineExecutionContext => ({
  traceId: "trace-1",
  plan: {
    providerId: "xiaohongshu",
    label: "Example",
          intent: {
            type: "video",
            siteId: "xiaohongshu",
            originalUrl: "https://www.xiaohongshu.com/explore/123",
            pageUrl: "https://www.xiaohongshu.com/explore/123",
            priority: 1,
            candidates: [],
            preferredFormat: "mp4",
          },
          engines: [],
        },
  enginePlan: {
    engine: "direct",
    priority: 100,
    when: "primary",
    reason: "test",
    sourceUrl: "https://sns-video-v4.xhscdn.com/example.mp4",
    fallbackOn: "any",
  },
  intent: {
    type: "video",
    siteId: "xiaohongshu",
    originalUrl: "https://www.xiaohongshu.com/explore/123",
    pageUrl: "https://www.xiaohongshu.com/explore/123",
    priority: 1,
    candidates: [],
    preferredFormat: "mp4",
  },
  outputDir: overrides.outputDir ?? mkdtempSync(path.join(os.tmpdir(), "flowselect-direct-")),
  outputStem: "output",
  config: {},
  binaries: {
    ytDlp: "",
    galleryDl: "",
    deno: "",
    ffmpeg: "",
    ffprobe: "",
  },
  abortSignal: new AbortController().signal,
  fetch: async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      "content-type": "video/mp4",
      "content-length": "3",
    },
  }),
  onProgress: async () => undefined,
  ...overrides,
});

describe("runDirectVideoDownload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not send a page referer for Xiaohongshu direct assets", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-direct-"));
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Referer")).toBeNull();
      expect(headers.get("Origin")).toBe("https://www.xiaohongshu.com");
      expect(init?.referrer).toBe("");
      expect(init?.referrerPolicy).toBe("no-referrer");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "3",
        },
      });
    });

    const result = await runDirectVideoDownload(createContext({
      outputDir,
      fetch: fetchMock,
    }));
    expect(result.success).toBe(true);
  });

  it("keeps the page referer for non-Xiaohongshu direct downloads", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-direct-"));
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Referer")).toBe("https://www.example.com/watch/123");
      expect(headers.get("Origin")).toBeNull();
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "3",
        },
      });
    });

    const result = await runDirectVideoDownload(createContext({
      outputDir,
      plan: {
        providerId: "generic",
        label: "Example",
        intent: {
          type: "video",
          siteId: "generic",
          originalUrl: "https://www.example.com/watch/123",
          pageUrl: "https://www.example.com/watch/123",
          priority: 1,
          candidates: [],
          preferredFormat: "mp4",
        },
        engines: [],
      },
      intent: {
        type: "video",
        siteId: "generic",
        originalUrl: "https://www.example.com/watch/123",
        pageUrl: "https://www.example.com/watch/123",
        priority: 1,
        candidates: [],
        preferredFormat: "mp4",
      },
      enginePlan: {
        engine: "direct",
        priority: 100,
        when: "primary",
        reason: "test",
        sourceUrl: "https://cdn.example.com/example.mp4",
        fallbackOn: "any",
      },
      fetch: fetchMock,
    }));
    expect(result.success).toBe(true);
  });
});
