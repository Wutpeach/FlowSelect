import { describe, expect, it, vi } from "vitest";
import type { EnginePlan, ResolvedDownloadPlan } from "../core/index.js";
import type { EngineExecutionContextWithRuntime } from "./engineExecutionContext.js";

const { runGalleryDlDownloadMock, runYtDlpDownloadMock } = vi.hoisted(() => ({
  runGalleryDlDownloadMock: vi.fn(),
  runYtDlpDownloadMock: vi.fn(),
}));

vi.mock("./galleryDlDownload.js", () => ({
  runGalleryDlDownload: runGalleryDlDownloadMock,
}));

vi.mock("./ytDlpDownload.js", () => ({
  runYtDlpDownload: runYtDlpDownloadMock,
}));

import { GalleryDlEngineAdapter } from "./galleryDlEngineAdapter.js";
import { YtDlpEngineAdapter } from "./ytDlpEngineAdapter.js";

const enginePlan: EnginePlan = {
  engine: "yt-dlp",
  priority: 100,
  when: "primary",
  reason: "adapter lease test",
  sourceUrl: "https://example.com/watch/lease",
};

const plan: ResolvedDownloadPlan = {
  providerId: "adapter-test",
  label: "Adapter lease test",
  intent: {
    type: "video",
    siteId: "generic",
    originalUrl: "https://example.com/watch/lease",
    pageUrl: "https://example.com/watch/lease",
    priority: 100,
    candidates: [],
    preferredFormat: "best",
  },
  engines: [enginePlan],
};

const createContext = (abortSignal = new AbortController().signal): EngineExecutionContextWithRuntime => ({
  traceId: "adapter-lease",
  plan,
  enginePlan,
  intent: plan.intent,
  outputDir: "D:/downloads",
  outputStem: "adapter-lease",
  config: {},
  network: {
    preference: "system",
    effectivePolicyReason: null,
    consumer: "yt-dlp",
    targetUrl: "https://example.com/watch/lease",
    route: {
      mode: "direct",
      source: "direct",
      reason: "resolved_direct",
      resolvedFor: "https://example.com/watch/lease",
    },
    status: "resolved",
    trace: [],
  },
  abortSignal,
  onProgress: async () => undefined,
});

describe("runtime-set engine adapters", () => {
  it("releases the yt-dlp lease only after the download runner settles", async () => {
    const release = vi.fn();
    let settleRunner: ((result: { traceId: string; success: boolean; filePath: string }) => void) | undefined;
    runYtDlpDownloadMock.mockImplementationOnce(async () => new Promise((resolve) => {
      settleRunner = resolve;
    }));
    const adapter = new YtDlpEngineAdapter({
      binaries: { ytDlp: "D:/yt-dlp.exe", ffmpeg: "D:/ffmpeg.exe", deno: "D:/deno.exe" },
    });
    const context = { ...createContext(), runtimeSetLease: { release } };

    const execution = adapter.execute(context);
    expect(release).not.toHaveBeenCalled();
    settleRunner?.({ traceId: context.traceId, success: true, filePath: "D:/downloads/adapter-lease.mp4" });

    await expect(execution).resolves.toMatchObject({ success: true });
    expect(release).toHaveBeenCalledOnce();
  });

  it("uses the attempt-scoped bundled binaries instead of composition-time paths", async () => {
    const release = vi.fn();
    runYtDlpDownloadMock.mockResolvedValueOnce({
      traceId: "adapter-pinned",
      success: true,
      filePath: "D:/downloads/pinned.mp4",
    });
    const adapter = new YtDlpEngineAdapter({
      binaries: { ytDlp: "D:/stale/yt-dlp.exe", ffmpeg: "D:/stale/ffmpeg.exe", deno: "D:/stale/deno.exe" },
    });
    const context = {
      ...createContext(),
      runtimeSetLease: { release },
      ytDlpRuntimeBinding: {
        lease: { release },
        binaries: {
          ytDlp: "D:/userdata/runtimes/yt-dlp/baseline/yt-dlp.exe",
          ffmpeg: "D:/userdata/runtimes/ffmpeg/real/ffmpeg.exe",
          deno: "D:/userdata/runtimes/deno/real/deno.exe",
        },
        identity: { candidate: "bundled" as const, runtimeSetId: "pinned" },
      },
    };

    await adapter.execute(context);

    expect(runYtDlpDownloadMock).toHaveBeenLastCalledWith(expect.objectContaining({
      binaries: context.ytDlpRuntimeBinding.binaries,
    }));
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the gallery-dl lease after a cancelled runner settles with failure", async () => {
    const controller = new AbortController();
    const release = vi.fn();
    runGalleryDlDownloadMock.mockImplementationOnce(async () => new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("gallery-dl aborted")), { once: true });
    }));
    const adapter = new GalleryDlEngineAdapter({ binaries: { galleryDl: "D:/gallery-dl.exe" } });
    const context = { ...createContext(controller.signal), runtimeSetLease: { release } };

    const execution = adapter.execute(context);
    controller.abort();

    await expect(execution).rejects.toThrow("gallery-dl aborted");
    expect(release).toHaveBeenCalledOnce();
  });
});
