import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DownloadEngine, RawDownloadInput, SiteProvider } from "../core";
import { genericProvider } from "../sites/generic";
import { pinterestProvider } from "../sites/pinterest";
import { xiaohongshuProvider } from "../sites/xiaohongshu";
import { youtubeProvider } from "../sites/youtube";

const { probeYtDlpMetadataTitleMock } = vi.hoisted(() => ({
  probeYtDlpMetadataTitleMock: vi.fn<() => Promise<string | undefined>>(async () => undefined),
}));

const {
  prepareVideoTranscodeTaskFromDownloadMock,
  runPreparedVideoTranscodeTaskMock,
} = vi.hoisted(() => ({
  prepareVideoTranscodeTaskFromDownloadMock: vi.fn(),
  runPreparedVideoTranscodeTaskMock: vi.fn(),
}));

vi.mock("./ytDlpMetadata.js", () => ({
  probeYtDlpMetadataTitle: probeYtDlpMetadataTitleMock,
}));

vi.mock("./transcode.js", () => ({
  prepareVideoTranscodeTaskFromDownload: prepareVideoTranscodeTaskFromDownloadMock,
  runPreparedVideoTranscodeTask: runPreparedVideoTranscodeTaskMock,
}));

import { createElectronDownloadRuntime } from "./service";
import type { RuntimeEmitterEvent } from "./contracts";
import { resetRenameSequenceState } from "./renameRules";
import { bilibiliProvider } from "../sites/bilibili";

const waitFor = async (
  predicate: () => boolean,
  attempts = 20,
): Promise<void> => {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const createEngineStub = (
  id: "yt-dlp" | "gallery-dl" | "direct",
  execute: DownloadEngine["execute"],
): DownloadEngine => ({
  id,
  validateIntent() {
    return null;
  },
  execute,
});

const createRuntime = (options: {
  providers?: SiteProvider[];
  engines?: DownloadEngine[];
  maxConcurrent?: number;
  configString?: string;
  environment?: {
    repoRoot?: string;
    configDir?: string;
    platform?: "win32" | "darwin" | "linux";
    arch?: "x64" | "arm64";
    desktopDir?: string;
    fetch?: typeof fetch;
  };
  onEmit?(event: RuntimeEmitterEvent, payload: unknown): void;
}) => createElectronDownloadRuntime({
  environment: {
    repoRoot: options.environment?.repoRoot ?? process.cwd(),
    configDir: options.environment?.configDir ?? path.join(process.cwd(), ".tmp-config"),
    platform: options.environment?.platform ?? "win32",
    arch: options.environment?.arch ?? "x64",
    desktopDir: options.environment?.desktopDir,
    fetch: options.environment?.fetch,
  },
  configStore: {
    async readConfigString() {
      return options.configString ?? "{}";
    },
  },
  eventSink: {
    emit(event, payload) {
      options.onEmit?.(event, payload);
    },
  },
  maxConcurrent: options.maxConcurrent,
  providers: options.providers,
  engines: options.engines,
});

describe("FlowSelectElectronDownloadRuntime", () => {
  afterEach(() => {
    resetRenameSequenceState();
    probeYtDlpMetadataTitleMock.mockReset();
    probeYtDlpMetadataTitleMock.mockResolvedValue(undefined);
    prepareVideoTranscodeTaskFromDownloadMock.mockReset();
    prepareVideoTranscodeTaskFromDownloadMock.mockResolvedValue(null);
    runPreparedVideoTranscodeTaskMock.mockReset();
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { finalPath: string }) => ({
      filePath: task.finalPath,
    }));
  });

  it("emits queue state changes and enforces max concurrency", async () => {
    const activeTraceIds: string[] = [];
    let inFlight = 0;
    let peakInFlight = 0;
    const completions: Array<() => void> = [];
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          activeTraceIds.push(context.traceId);
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          await new Promise<void>((resolve) => {
            completions.push(() => {
              inFlight -= 1;
              resolve();
            });
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      onEmit(event, payload) {
        events.push({ event, payload });
      },
    });

    const first = await runtime.queueVideoDownload({ url: "https://example.com/1" });
    const second = await runtime.queueVideoDownload({ url: "https://example.com/2" });
    const third = await runtime.queueVideoDownload({ url: "https://example.com/3" });

    await waitFor(() => peakInFlight === 2);
    expect(runtime.getQueueState().totalCount).toBe(3);
    expect(peakInFlight).toBe(2);
    expect(activeTraceIds).toContain(first.traceId);
    expect(activeTraceIds).toContain(second.traceId);
    expect(activeTraceIds).not.toContain(third.traceId);

    completions.shift()?.();
    await waitFor(() => activeTraceIds.includes(third.traceId));
    expect(activeTraceIds).toContain(third.traceId);

    completions.shift()?.();
    completions.shift()?.();
    await waitFor(() => runtime.getQueueState().totalCount === 0);

    expect(runtime.getQueueState().totalCount).toBe(0);
    expect(events.some((entry) => entry.event === "video-download-complete")).toBe(true);
  });

  it("cancels pending work immediately", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          await new Promise<void>(() => undefined);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "ignored",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/active" });
    const pending = await runtime.queueVideoDownload({ url: "https://example.com/pending" });

    const cancelled = await runtime.cancelDownload(pending.traceId);

    expect(cancelled).toBe(true);
    expect(completed.some((entry) => entry.traceId === pending.traceId)).toBe(true);
  });

  it("settles an active task after cancellation", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context): Promise<never> => (
          await new Promise<never>((_resolve, reject) => {
            if (context.abortSignal.aborted) {
              reject(new Error("active task aborted"));
              return;
            }
            context.abortSignal.addEventListener(
              "abort",
              () => reject(new Error("active task aborted")),
              { once: true },
            );
          })
        )),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    const active = await runtime.queueVideoDownload({ url: "https://example.com/active" });
    await waitFor(() => runtime.getQueueState().activeCount === 1);

    const cancelled = await runtime.cancelDownload(active.traceId);

    expect(cancelled).toBe(true);
    await waitFor(() => completed.some((entry) => entry.traceId === active.traceId));
    expect(completed.some((entry) => entry.traceId === active.traceId)).toBe(true);
    expect(completed.find((entry) => entry.traceId === active.traceId)).toMatchObject({
      success: false,
    });
    await waitFor(() => runtime.getQueueState().totalCount === 0);
  });

  it("prefers gallery-dl for a Pinterest page without a verified direct asset", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "gallery.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.startsWith("gallery:")).toBe(true);
  });

  it("prefers direct for a Pinterest page with a verified direct asset", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "gallery.mp4",
          };
        }),
        createEngineStub("direct", async (context) => {
          routes.push(`direct:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "direct.mp4",
          };
        }),
      ],
    });

    const request: RawDownloadInput = {
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      videoUrl: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
    };

    await runtime.queueVideoDownload(request);

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.startsWith("direct:")).toBe(true);
  });

  it("passes the injected environment fetch into engine execution context", async () => {
    const sessionFetch = async () => new Response(null, { status: 204 });
    let receivedFetch: typeof fetch | undefined;

    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      environment: {
        fetch: sessionFetch,
      },
      engines: [
        createEngineStub("direct", async (context) => {
          receivedFetch = context.fetch;
          return {
            traceId: context.traceId,
            success: true,
            file_path: "direct.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      videoUrl: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
    });

    await waitFor(() => receivedFetch != null);
    expect(receivedFetch).toBe(sessionFetch);
  });

  it("hydrates Xiaohongshu page requests and prefers the direct engine when page html exposes a direct asset", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      environment: {
        fetch: async () => new Response(
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
        ),
      },
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
        createEngineStub("direct", async (context) => {
          routes.push(`direct:${context.traceId}`);
          expect(context.enginePlan.sourceUrl).toBe(
            "https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4",
          );
          return {
            traceId: context.traceId,
            success: true,
            file_path: "direct.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
      pageUrl: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
      siteHint: "xiaohongshu",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.startsWith("direct:")).toBe(true);
  });

  it("does not fall back to yt-dlp when Xiaohongshu already has a verified direct asset", async () => {
    const routes: string[] = [];
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      engines: [
        createEngineStub("direct", async (context) => {
          routes.push(`direct:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: false,
            error: "direct failed",
          };
        }),
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      pageUrl: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      siteHint: "xiaohongshu",
      videoUrl: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
      videoCandidates: [
        {
          url: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
          type: "direct_mp4",
          source: "extension_resolution",
          confidence: "high",
          mediaType: "video",
        },
      ],
    });

    await waitFor(() => completions.length > 0);
    expect(routes).toEqual([expect.stringMatching(/^direct:/)]);
    expect(completions[0]).toMatchObject({
      success: false,
      error: "direct failed",
    });
  });

  it("skips downstream transcode for Xiaohongshu direct downloads", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      engines: [
        createEngineStub("direct", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      pageUrl: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      siteHint: "xiaohongshu",
      videoUrl: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
      videoCandidates: [
        {
          url: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
          type: "direct_mp4",
          source: "extension_resolution",
          confidence: "high",
          mediaType: "video",
        },
      ],
    });

    await waitFor(() => events.includes("video-download-complete"));
    expect(prepareVideoTranscodeTaskFromDownloadMock).not.toHaveBeenCalled();
    expect(events).not.toContain("video-transcode-queued");
  });

  it("surfaces a Pinterest gallery-dl failure without falling back to yt-dlp", async () => {
    const routes: string[] = [];
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: false,
            error: "gallery failed",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      siteHint: "pinterest",
    });

    await waitFor(() => completions.length > 0);
    expect(routes).toEqual([expect.stringMatching(/^gallery:/)]);
    expect(completions[0]).toMatchObject({
      success: false,
      error: "gallery failed",
    });
  });

  it("does not invoke a registered yt-dlp engine for Pinterest fallback plans", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "gallery.mp4",
          };
        }),
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      siteHint: "pinterest",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toEqual([expect.stringMatching(/^gallery:/)]);
  });

  it("reserves distinct output stems for concurrent same-title tasks", async () => {
    const outputDir = path.join(os.tmpdir(), `flowselect-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      configString: JSON.stringify({ outputPath: outputDir }),
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://example.com/1",
        title: "Pin 图卡片",
      });
      await runtime.queueVideoDownload({
        url: "https://example.com/2",
        title: "Pin 图卡片",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems).toContain("Pin 图卡片");
      expect(outputStems).toContain("Pin 图卡片 (2)");
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("prefers title-first stems for pinterest tasks when a title is available", async () => {
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/111111111111111111/",
        pageUrl: "https://www.pinterest.com/pin/111111111111111111/",
        title: "Pin 图卡片",
        siteHint: "pinterest",
      });
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/222222222222222222/",
        pageUrl: "https://www.pinterest.com/pin/222222222222222222/",
        title: "Pin 图卡片",
        siteHint: "pinterest",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems[0]).toBe("Pin 图卡片");
      expect(outputStems[1]).toBe("Pin 图卡片 (2)");
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
    }
  });

  it("falls back to pinterest short-id stems when no title is available", async () => {
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/111111111111111111/",
        pageUrl: "https://www.pinterest.com/pin/111111111111111111/",
        siteHint: "pinterest",
      });
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/222222222222222222/",
        pageUrl: "https://www.pinterest.com/pin/222222222222222222/",
        siteHint: "pinterest",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems[0]).toMatch(/^pinterest_[0-9a-f]{6}$/);
      expect(outputStems[1]).toMatch(/^pinterest_[0-9a-f]{6}$/);
      expect(new Set(outputStems).size).toBe(2);
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
    }
  });

  it("uses shared rename-rule stems when rename mode is enabled", async () => {
    const outputDir = path.join(os.tmpdir(), `flowselect-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      configString: JSON.stringify({
        outputPath: outputDir,
        renameMediaOnDownload: true,
      }),
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://example.com/1",
        title: "Sample Video",
      });
      await runtime.queueVideoDownload({
        url: "https://example.com/2",
        title: "Another Video",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems).toEqual(["99", "98"]);
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("probes yt-dlp metadata titles for pasted YouTube URLs before allocating the output stem", async () => {
    const outputStems: string[] = [];
    probeYtDlpMetadataTitleMock.mockResolvedValue("Recovered YouTube Title");

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          outputStems.push(context.outputStem);
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => outputStems.length === 1);
    expect(probeYtDlpMetadataTitleMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    }));
    expect(outputStems).toEqual(["Recovered YouTube Title"]);
  });

  it("queues downstream transcode after a highest-quality YouTube download completes with MKV output", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const transcodeCompletions: Array<() => void> = [];

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { traceId: string; label: string; sourcePath: string };
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 120,
        finalPath: "D:/downloads/Recovered YouTube Title.mp4",
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { finalPath: string }) => {
      await new Promise<void>((resolve) => {
        transcodeCompletions.push(resolve);
      });
      return { filePath: task.finalPath };
    });

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Recovered YouTube Title.mkv",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.youtube.com/watch?v=abc123",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
        title: "Recovered YouTube Title",
        ytdlpQuality: "best",
        siteHint: "youtube",
      });

      await waitFor(() => events.includes("video-transcode-queued"));
      expect(events).toContain("video-download-complete");
      expect(events).toContain("video-transcode-progress");
      expect(events.indexOf("video-download-complete")).toBeLessThan(events.indexOf("video-transcode-queued"));
      expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: "D:/downloads/Recovered YouTube Title.mkv",
      }));
    } finally {
      transcodeCompletions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getTranscodeQueueState().totalCount === 0);
    }
  });

  it("applies the same transcode follow-up path to Bilibili yt-dlp downloads", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const transcodeCompletions: Array<() => void> = [];

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { traceId: string; label: string; sourcePath: string };
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 180,
        finalPath: "D:/downloads/Bilibili Archive.mp4",
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { finalPath: string }) => {
      await new Promise<void>((resolve) => {
        transcodeCompletions.push(resolve);
      });
      return { filePath: task.finalPath };
    });

    const runtime = createRuntime({
      providers: [bilibiliProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Bilibili Archive.mkv",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title: "Bilibili Archive",
        ytdlpQuality: "best",
        siteHint: "bilibili",
      });

      await waitFor(() => events.includes("video-transcode-queued"));
      expect(events).toContain("video-download-complete");
      expect(events.indexOf("video-download-complete")).toBeLessThan(events.indexOf("video-transcode-queued"));
      expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: "D:/downloads/Bilibili Archive.mkv",
      }));
    } finally {
      transcodeCompletions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getTranscodeQueueState().totalCount === 0);
    }
  });

  it("skips downstream transcode when a highest-quality Bilibili download already lands as MP4", async () => {
    const events: RuntimeEmitterEvent[] = [];

    const runtime = createRuntime({
      providers: [bilibiliProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Bilibili Preview[1920x1080][highest].mp4",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.bilibili.com/video/BV1preview1080",
      pageUrl: "https://www.bilibili.com/video/BV1preview1080?p=1",
      title: "Bilibili Preview",
      ytdlpQuality: "best",
      siteHint: "bilibili",
    });

    await waitFor(() => events.includes("video-download-complete"));
    await waitFor(() => prepareVideoTranscodeTaskFromDownloadMock.mock.calls.length === 1);

    expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
      sourcePath: "D:/downloads/Bilibili Preview[1920x1080][highest].mp4",
    }));
    expect(events).not.toContain("video-transcode-queued");
    expect(runtime.getTranscodeQueueState().totalCount).toBe(0);
  });

  it("supports retrying and removing failed transcode rows", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const runAttempts: string[] = [];

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { traceId: string; label: string; sourcePath: string };
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 60,
        finalPath: "D:/downloads/Failure Case.mp4",
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { traceId?: string; finalPath: string }) => {
      runAttempts.push(task.traceId ?? "missing-trace");
      throw new Error("ffmpeg failed");
    });

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Failure Case.mkv",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=fail123",
      pageUrl: "https://www.youtube.com/watch?v=fail123",
      title: "Failure Case",
      siteHint: "youtube",
    });

    await waitFor(() => events.includes("video-transcode-failed"));
    expect(runtime.getTranscodeQueueState().failedCount).toBe(1);

    const retried = await runtime.retryTranscode(ack.traceId);
    expect(retried).toBe(true);
    await waitFor(() => events.includes("video-transcode-retried"));
    await waitFor(() => runAttempts.length >= 2);

    const removed = await runtime.removeTranscode(ack.traceId);
    expect(removed).toBe(true);
    await waitFor(() => runtime.getTranscodeQueueState().totalCount === 0);
    expect(events).toContain("video-transcode-removed");
  });
});
