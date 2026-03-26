import { describe, expect, it, vi } from "vitest";
import { createElectronRuntimeCommandRouter } from "./commandRouter";
import type { ElectronDownloadRuntime } from "./contracts";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies";

const readyStatus = {
  state: "ready",
  source: "bundled",
  path: "D:/runtime/tool",
  error: null,
} as const;

const runtimeStatus: RuntimeDependencyStatusSnapshot = {
  ytDlp: readyStatus,
  ffmpeg: { ...readyStatus, source: "managed" },
  deno: { ...readyStatus, source: "managed" },
  pinterestDownloader: { ...readyStatus, source: "managed" },
};

const gateState: RuntimeDependencyGateStatePayload = {
  phase: "ready",
  missingComponents: [],
  lastError: null,
  updatedAtMs: 1,
  currentComponent: null,
  currentStage: null,
  progressPercent: null,
  downloadedBytes: null,
  totalBytes: null,
  nextComponent: null,
};

const createRuntimeStub = (): ElectronDownloadRuntime & {
  queueVideoDownload: ReturnType<typeof vi.fn>;
  cancelDownload: ReturnType<typeof vi.fn>;
} => ({
  maxConcurrent: 3,
  getRuntimeDependencyStatus: vi.fn(() => runtimeStatus),
  getRuntimeDependencyGateState: vi.fn(() => gateState),
  refreshRuntimeDependencyGateState: vi.fn(() => gateState),
  startRuntimeDependencyBootstrap: vi.fn(async (reason?: string) => ({
    ...gateState,
    updatedAtMs: reason ? 2 : 1,
  })),
  queueVideoDownload: vi.fn(async (request) => ({
    accepted: true,
    traceId: request.videoUrl ?? request.url,
  })),
  cancelDownload: vi.fn(async (traceId: string) => traceId === "trace-1"),
  getQueueState: vi.fn(() => ({
    activeCount: 0,
    pendingCount: 0,
    totalCount: 0,
    maxConcurrent: 3,
  })),
  getQueueDetail: vi.fn(() => ({ tasks: [] })),
});

describe("createElectronRuntimeCommandRouter", () => {
  it("dispatches supported runtime commands with normalized queue payloads", async () => {
    const runtime = createRuntimeStub();
    const router = createElectronRuntimeCommandRouter({ runtime });

    const result = await router.invoke<{ accepted: boolean; traceId: string }>(
      "queue_video_download",
      {
        url: " https://www.pinterest.com/pin/1234567890/ ",
        page_url: " https://www.pinterest.com/pin/1234567890/ ",
        video_candidates: [
          { url: " https://v.pinimg.com/videos/iht/hls/video.m3u8 ", type: "manifest_m3u8" },
          { url: " https://v.pinimg.com/videos/iht/expmp4/video.mp4 ", type: "direct_mp4" },
          { url: "   " },
        ],
        drag_diagnostic: {
          html_length: 42,
          html_preview: "drag payload",
          flags: {
            hasVideoTag: true,
            hasVideoList: false,
            hasStoryPinData: false,
            hasCarouselData: false,
            hasMp4: true,
            hasM3u8: true,
            hasCmfv: false,
            hasPinimgVideoHost: true,
          },
          image_url: "https://i.pinimg.com/originals/example.jpg",
          video_candidates_count: 2,
        },
      },
    );

    expect(result).toEqual({
      accepted: true,
      traceId: "https://www.pinterest.com/pin/1234567890/",
    });
    expect(runtime.queueVideoDownload).toHaveBeenCalledWith({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      videoUrl: undefined,
      videoCandidates: [
        {
          url: "https://v.pinimg.com/videos/iht/expmp4/video.mp4",
          type: "direct_mp4",
          source: undefined,
          confidence: undefined,
        },
        {
          url: "https://v.pinimg.com/videos/iht/hls/video.m3u8",
          type: "manifest_m3u8",
          source: undefined,
          confidence: undefined,
        },
      ],
      dragDiagnostic: {
        htmlLength: 42,
        htmlPreview: "drag payload",
        flags: {
          hasEmbeddedPayload: false,
          hasVideoTag: true,
          hasVideoList: false,
          hasStoryPinData: false,
          hasCarouselData: false,
          hasMp4: true,
          hasM3u8: true,
          hasCmfv: false,
          hasPinimgVideoHost: true,
        },
        imageUrl: "https://i.pinimg.com/originals/example.jpg",
        videoUrl: null,
        videoCandidatesCount: 2,
        videoCandidates: [
          {
            url: "https://v.pinimg.com/videos/iht/expmp4/video.mp4",
            type: "direct_mp4",
            source: undefined,
            confidence: undefined,
          },
          {
            url: "https://v.pinimg.com/videos/iht/hls/video.m3u8",
            type: "manifest_m3u8",
            source: undefined,
            confidence: undefined,
          },
        ],
      },
    });
  });

  it("dispatches cancel and bootstrap commands", async () => {
    const runtime = createRuntimeStub();
    const router = createElectronRuntimeCommandRouter({ runtime });

    await expect(
      router.invoke<boolean>("cancel_download", { trace_id: "trace-1" }),
    ).resolves.toBe(true);
    await expect(
      router.invoke<RuntimeDependencyGateStatePayload>(
        "start_runtime_dependency_bootstrap",
        { reason: "settings_retry" },
      ),
    ).resolves.toMatchObject({ phase: "ready", updatedAtMs: 2 });

    expect(runtime.cancelDownload).toHaveBeenCalledWith("trace-1");
    expect(runtime.startRuntimeDependencyBootstrap).toHaveBeenCalledWith("settings_retry");
  });

  it("delegates unsupported commands to the fallback handler", async () => {
    const runtime = createRuntimeStub();
    const fallback = vi.fn(async () => "config-json");
    const router = createElectronRuntimeCommandRouter({ runtime, fallback });

    await expect(
      router.invoke<string>("get_config", { scope: "main" }),
    ).resolves.toBe("config-json");

    expect(fallback).toHaveBeenCalledWith("get_config", { scope: "main" });
  });
});
