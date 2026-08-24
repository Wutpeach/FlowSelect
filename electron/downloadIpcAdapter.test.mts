import { describe, expect, it, vi } from "vitest";

import { createDownloadIpcAdapter } from "./downloadIpcAdapter.mjs";
import type { DownloadApplicationApi } from "../src/application/download-api.js";
import type { ExtensionRequestBridge } from "./extensionRequestBridge.mjs";

const createRuntimeStub = (): DownloadApplicationApi & {
  queueDownload: ReturnType<typeof vi.fn>;
  queuePastedDownload: ReturnType<typeof vi.fn>;
  selectAdvancedQualityOption: ReturnType<typeof vi.fn>;
  cancelDownload: ReturnType<typeof vi.fn>;
} => ({
  queueDownload: vi.fn(async (command) => ({
    accepted: true,
    traceId: command.url,
  })),
  queuePastedDownload: vi.fn(async () => ({
    accepted: true,
    traceId: "pasted-trace",
  })),
  selectAdvancedQualityOption: vi.fn(async () => true),
  cancelDownload: vi.fn(async () => true),
});

const createExtensionBridgeStub = (
  resolution: Parameters<ExtensionRequestBridge["requestPastedVideoSelectionResolution"]>[0] | null,
): ExtensionRequestBridge & {
  requestPastedVideoSelectionResolution: ReturnType<typeof vi.fn>;
} => ({
  requestPastedVideoSelectionResolution: vi.fn(async () => {
    if (!resolution) {
      throw new Error("Browser extension is not connected");
    }
    return {
      success: true,
      videoCandidates: [],
      ...resolution,
    };
  }),
  handlePastedVideoSelectionResult: vi.fn(),
  handleSiteSessionCookieSyncResult: vi.fn(),
  rejectAllPendingRequests: vi.fn(),
  requestSiteSessionCookieSync: vi.fn(),
});

const createAdapter = (
  runtime = createRuntimeStub(),
  extensionBridge: ExtensionRequestBridge = createExtensionBridgeStub(null),
) => createDownloadIpcAdapter({
  runtime,
  extensionBridge,
  readConfigObject: vi.fn(async () => ({ defaultVideoDownloadQuality: "balanced" })),
  logInjectedDebug: vi.fn(),
});

describe("createDownloadIpcAdapter", () => {
  it("dispatches normal queue requests through the Application API with config quality", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await adapter.invoke("queue_video_download", {
      url: "https://www.youtube.com/watch?v=abc123",
      page_url: "https://www.youtube.com/watch?v=abc123",
    });

    expect(runtime.queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      videoQuality: "balanced",
    }));
  });

  it("passes a finite local Intake cause separately from the canonical command", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);
    await adapter.invoke("queue_video_download", {
      url: "https://www.youtube.com/watch?v=origin",
      intakeOrigin: { x: 0.2, y: 0.8 },
    });
    expect(runtime.queueDownload).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://www.youtube.com/watch?v=origin" }),
      { intakeOrigin: { x: 0.2, y: 0.8 } },
    );

    await adapter.invoke("queue_video_download", {
      url: "https://www.youtube.com/watch?v=malformed",
      intakeOrigin: { x: 2, y: "nope" },
    });
    expect(runtime.queueDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: "https://www.youtube.com/watch?v=malformed" }),
    );
  });

  it("preserves injected clip ranges when queueing video downloads", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await adapter.invoke("queue_video_download", {
      url: "https://www.youtube.com/watch?v=clip123",
      pageUrl: "https://www.youtube.com/watch?v=clip123",
      siteHint: "youtube",
      selectionScope: "current_item",
      clipStartSec: 35.25,
      clipEndSec: 48.75,
    });

    expect(runtime.queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/watch?v=clip123",
      pageUrl: "https://www.youtube.com/watch?v=clip123",
      siteHint: "youtube",
      selectionScope: "current_item",
      clipStartSec: 35.25,
      clipEndSec: 48.75,
      videoQuality: "balanced",
    }));
  });

  it("rejects queue requests whose primary url is not HTTP(S)", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("queue_video_download", {
      url: "ftp://example.com/file",
    })).rejects.toThrow(/Invalid command payload field: url/);
    expect(runtime.queueDownload).not.toHaveBeenCalled();
  });

  it("rejects queue requests with a missing primary url", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("queue_video_download", {
      pageUrl: "https://example.com/watch",
    })).rejects.toThrow(/Missing required command payload field: url/);
    expect(runtime.queueDownload).not.toHaveBeenCalled();
  });

  it("preserves the selected video variant all the way into the Application command", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await adapter.invoke("queue_video_download", {
      url: "https://weibo.com/detail/N12345",
      pageUrl: "https://weibo.com/detail/N12345",
      siteHint: "weibo",
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
    });

    expect(runtime.queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://weibo.com/detail/N12345",
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
    }));
  });

  it("maps extension capture evidence into the canonical command field", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await adapter.invoke("queue_video_download", {
      url: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
      pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
      siteHint: "douyin",
      extensionData: {
        ameowCapture: {
          version: 1,
          action: "current_content",
          pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
          contentIds: { modal_id: "7637912431158644014" },
        },
      },
    });

    const command = runtime.queueDownload.mock.calls[0][0];
    expect(command).toMatchObject({
      url: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
      captureEvidence: {
        version: 1,
        action: "current_content",
        contentIds: { modal_id: "7637912431158644014" },
      },
    });
    expect(command).not.toHaveProperty("extensionData");
  });

  it("injects pasted selection ports wired to the extension bridge and allowlist", async () => {
    const runtime = createRuntimeStub();
    const extensionBridge = createExtensionBridgeStub({
      url: "https://www.youtube.com/watch?v=resolved",
      pageUrl: "https://www.youtube.com/watch?v=resolved",
      siteHint: "youtube",
      videoCandidates: [
        { url: "https://www.youtube.com/watch?v=resolved", mediaType: "video" },
      ],
    });
    const adapter = createAdapter(runtime, extensionBridge);

    await adapter.invoke("queue_pasted_video_download", {
      url: "https://www.youtube.com/watch?v=abc123",
      intakeOrigin: { x: 0.35, y: 0.65 },
    });

    const pastedCall = runtime.queuePastedDownload.mock.calls[0];
    expect(pastedCall[0]).toMatchObject({
      url: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      videoQuality: "balanced",
    });
    const ports = pastedCall[1];
    expect(pastedCall[2]).toEqual({ intakeOrigin: { x: 0.35, y: 0.65 } });

    // Eligibility follows the desktop pasted-site allowlist.
    expect(ports.isEligible("youtube")).toBe(true);
    expect(ports.isEligible("douyin")).toBe(false);
    expect(ports.isEligible(undefined)).toBe(false);

    // Resolution delegates to the extension bridge with pageUrl fallback.
    const resolved = await ports.resolveSelection({
      url: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });
    expect(extensionBridge.requestPastedVideoSelectionResolution).toHaveBeenCalledWith({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });
    expect(resolved).toMatchObject({
      url: "https://www.youtube.com/watch?v=resolved",
      pageUrl: "https://www.youtube.com/watch?v=resolved",
      siteHint: "youtube",
      videoCandidates: [
        { url: "https://www.youtube.com/watch?v=resolved", mediaType: "video" },
      ],
    });
  });

  it("queues pasted Douyin URLs directly without requesting extension assistance", async () => {
    const runtime = createRuntimeStub();
    const extensionBridge = createExtensionBridgeStub(null);
    const adapter = createAdapter(runtime, extensionBridge);

    await adapter.invoke("queue_pasted_video_download", {
      url: "https://v.douyin.com/5qqlazbdEoU/",
    });

    expect(extensionBridge.requestPastedVideoSelectionResolution).not.toHaveBeenCalled();
    expect(runtime.queuePastedDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://v.douyin.com/5qqlazbdEoU/",
      siteHint: "douyin",
      videoQuality: "balanced",
    }), expect.anything());
  });

  it("falls back to the original pasted URL when extension assistance fails", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime, createExtensionBridgeStub(null));

    await adapter.invoke("queue_pasted_video_download", {
      url: "https://www.youtube.com/watch?v=abc123",
    });

    expect(runtime.queuePastedDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/watch?v=abc123",
    }), expect.anything());
  });

  it("dispatches cancel requests to the runtime", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("cancel_download", { traceId: "trace-1" })).resolves.toBe(true);

    expect(runtime.cancelDownload).toHaveBeenCalledWith("trace-1");
  });

  it("normalizes snake_case cancel payloads", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await adapter.invoke("cancel_download", { trace_id: "trace-2" });

    expect(runtime.cancelDownload).toHaveBeenCalledWith("trace-2");
  });

  it("rejects cancel requests with a missing traceId before invoking the runtime", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("cancel_download", {}))
      .rejects.toThrow(/Missing required command payload field: traceId/);
    expect(runtime.cancelDownload).not.toHaveBeenCalled();
  });

  it("rejects cancel requests with a whitespace-only traceId", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("cancel_download", { traceId: "   " }))
      .rejects.toThrow(/Missing required command payload field: traceId/);
    expect(runtime.cancelDownload).not.toHaveBeenCalled();
  });

  it("rejects cancel requests with a wrong-type traceId", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("cancel_download", { traceId: 42 }))
      .rejects.toThrow(/Invalid command payload field: traceId/);
    expect(runtime.cancelDownload).not.toHaveBeenCalled();
  });

  it("dispatches advanced quality selections to the runtime", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(
      adapter.invoke("select_advanced_quality_option", {
        traceId: "trace-1",
        optionId: "height_1080",
      }),
    ).resolves.toBe(true);

    expect(runtime.selectAdvancedQualityOption).toHaveBeenCalledWith("trace-1", "height_1080");
  });

  it("accepts snake_case trace_id and option_id for advanced quality selection", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(
      adapter.invoke("select_advanced_quality_option", {
        trace_id: "trace-3",
        option_id: "height_480",
      }),
    ).resolves.toBe(true);

    expect(runtime.selectAdvancedQualityOption).toHaveBeenCalledWith("trace-3", "height_480");
  });

  it("rejects selections with a missing traceId before invoking the runtime", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("select_advanced_quality_option", {
      optionId: "height_1080",
    })).rejects.toThrow(/Missing required command payload field: traceId/);
    expect(runtime.selectAdvancedQualityOption).not.toHaveBeenCalled();
  });

  it("rejects selections with a missing optionId", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("select_advanced_quality_option", {
      traceId: "trace-1",
    })).rejects.toThrow(/Missing required command payload field: optionId/);
    expect(runtime.selectAdvancedQualityOption).not.toHaveBeenCalled();
  });

  it("rejects selections with a whitespace-only optionId", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("select_advanced_quality_option", {
      traceId: "trace-1",
      optionId: " \n\t ",
    })).rejects.toThrow(/Missing required command payload field: optionId/);
    expect(runtime.selectAdvancedQualityOption).not.toHaveBeenCalled();
  });

  it("rejects selections with a wrong-type optionId", async () => {
    const runtime = createRuntimeStub();
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("select_advanced_quality_option", {
      traceId: "trace-1",
      optionId: 1080,
    })).rejects.toThrow(/Invalid command payload field: optionId/);
    expect(runtime.selectAdvancedQualityOption).not.toHaveBeenCalled();
  });

  it("maps an Application invocation error without reclassifying its raw text", async () => {
    const runtime = createRuntimeStub();
    runtime.queueDownload.mockRejectedValueOnce(new Error("engine exploded"));
    const adapter = createAdapter(runtime);

    await expect(adapter.invoke("queue_video_download", {
      url: "https://example.com/1",
    })).rejects.toThrow("engine exploded");
  });

  it("does not support non-download commands", async () => {
    const adapter = createAdapter();

    expect(adapter.supports("queue_video_download")).toBe(true);
    expect(adapter.supports("cancel_download")).toBe(true);
    expect(adapter.supports("queue_pasted_video_download")).toBe(true);
    expect(adapter.supports("select_advanced_quality_option")).toBe(true);
    expect(adapter.supports("cancel_transcode")).toBe(false);
    expect(adapter.supports("get_runtime_dependency_status")).toBe(false);
  });
});
