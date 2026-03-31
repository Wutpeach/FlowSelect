import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DownloadEngine, RawDownloadInput, SiteProvider } from "../core";
import { genericProvider } from "../sites/generic";
import { pinterestProvider } from "../sites/pinterest";
import { createElectronDownloadRuntime } from "./service";
import type { RuntimeEmitterEvent } from "./contracts";

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

  it("uses pinterest short-id stems instead of repeated titles", async () => {
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
      expect(outputStems[0]).toMatch(/^pinterest_[0-9a-f]{6}$/);
      expect(outputStems[1]).toMatch(/^pinterest_[0-9a-f]{6}$/);
      expect(new Set(outputStems).size).toBe(2);
      expect(outputStems).not.toContain("Pin 图卡片");
      expect(outputStems).not.toContain("Pin 图卡片 (2)");
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
    }
  });
});
