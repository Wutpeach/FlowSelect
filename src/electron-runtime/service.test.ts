import { describe, expect, it } from "vitest";
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

describe("FlowSelectElectronDownloadRuntime", () => {
  it("emits queue state changes and enforces max concurrency", async () => {
    const activeTraceIds: string[] = [];
    let inFlight = 0;
    let peakInFlight = 0;
    const completions: Array<() => void> = [];
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];

    const runtime = createElectronDownloadRuntime({
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
          events.push({ event, payload });
        },
      },
      maxConcurrent: 2,
      executors: {
        async runYtDlpDownload(context) {
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
        },
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
    const runtime = createElectronDownloadRuntime({
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
          if (event === "video-download-complete") {
            completed.push(payload as { traceId: string; success: boolean; error?: string });
          }
        },
      },
      maxConcurrent: 1,
      executors: {
        async runYtDlpDownload(context) {
          await new Promise<void>(() => undefined);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "ignored",
          };
        },
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/active" });
    const pending = await runtime.queueVideoDownload({ url: "https://example.com/pending" });

    const cancelled = await runtime.cancelDownload(pending.traceId);

    expect(cancelled).toBe(true);
    expect(completed.some((entry) => entry.traceId === pending.traceId)).toBe(true);
  });

  it("falls back to yt-dlp when a Pinterest page has no direct video hint", async () => {
    const routes: string[] = [];
    const runtime = createElectronDownloadRuntime({
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
        emit() {
          // No-op.
        },
      },
      maxConcurrent: 1,
      executors: {
        async runYtDlpDownload(context) {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        },
        async runPinterestDownload(context) {
          routes.push(`pin:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "pin.mp4",
          };
        },
      },
    });

    await runtime.queueVideoDownload({
      url: "https://example.com/watch?v=123",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.startsWith("yt:")).toBe(true);
  });
});
