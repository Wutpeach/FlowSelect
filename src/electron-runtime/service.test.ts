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
  onEmit?(event: RuntimeEmitterEvent, payload: unknown): void;
}) => createElectronDownloadRuntime({
  environment: {
    repoRoot: "D:/repo",
    configDir: "D:/repo/config",
    platform: "win32",
    arch: "x64",
  },
  configStore: {
    async readConfigString() {
      return "{}";
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

  it("falls back from gallery-dl to yt-dlp for Pinterest pages when the primary engine fails", async () => {
    const routes: string[] = [];
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

    await waitFor(() => routes.length === 2);
    expect(routes[0]?.startsWith("gallery:")).toBe(true);
    expect(routes[1]?.startsWith("yt:")).toBe(true);
  });
});
