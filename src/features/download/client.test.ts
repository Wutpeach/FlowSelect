import { describe, expect, it, vi } from "vitest";
import type { DownloadProgressPayload, DownloadResultPayload } from "../../protocol/download/ipcTypes";
import {
  classifyDownloadTerminal,
  createDownloadQueueClient,
  type DownloadQueueBridge,
} from "./client";

type Emit = (event: string, payload: unknown) => void;

const createFakeBridge = (): {
  bridge: DownloadQueueBridge;
  emit: Emit;
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  listenerCount: () => number;
} => {
  const listeners: Record<string, Set<(event: { payload: unknown }) => void>> = {};
  const invoke = vi.fn(async () => ({}));
  const on = vi.fn((event: string, listener: (event: { payload: unknown }) => void) => {
    listeners[event] ??= new Set();
    listeners[event].add(listener);
    const disposer = () => {
      listeners[event].delete(listener);
    };
    return Promise.resolve(disposer);
  });
  return {
    bridge: {
      commands: { invoke: invoke as unknown as DownloadQueueBridge["commands"]["invoke"] },
      events: { on },
    },
    emit: (event, payload) => listeners[event]?.forEach((listener) => listener({ payload })),
    invoke,
    on,
    listenerCount: () => Object.values(listeners).reduce((sum, set) => sum + set.size, 0),
  };
};

const progressPayload = (overrides: Partial<DownloadProgressPayload> = {}): DownloadProgressPayload => ({
  traceId: "trace-1",
  percent: 42,
  stage: "downloading",
  speed: "1.2 MB/s",
  eta: "10s",
  ...overrides,
});

const resultPayload = (overrides: Partial<DownloadResultPayload> = {}): DownloadResultPayload => ({
  traceId: "trace-1",
  success: true,
  ...overrides,
});

describe("createDownloadQueueClient", () => {
  it("routes public methods to the existing protocol commands", async () => {
    const { bridge, invoke } = createFakeBridge();
    const client = createDownloadQueueClient(bridge);

    await client.queue({ url: "https://example.com/video" });
    expect(invoke).toHaveBeenCalledWith("queue_video_download", { url: "https://example.com/video" });

    await client.queuePasted("https://example.com/video");
    expect(invoke).toHaveBeenCalledWith("queue_pasted_video_download", { url: "https://example.com/video" });

    await client.cancel("trace-1");
    expect(invoke).toHaveBeenCalledWith("cancel_download", { traceId: "trace-1" });

    await client.selectQuality("trace-1", "o1");
    expect(invoke).toHaveBeenCalledWith("select_advanced_quality_option", { traceId: "trace-1", optionId: "o1" });
  });

  it("forwards pinterest drag diagnostics verbatim as opaque telemetry", async () => {
    const { bridge, invoke } = createFakeBridge();
    const client = createDownloadQueueClient(bridge);
    const dragDiagnostic = { htmlLength: 10, flags: { hasMp4: true } };

    await client.queue({ url: "https://pinterest.com/pin", dragDiagnostic });

    expect(invoke).toHaveBeenCalledWith("queue_video_download", {
      url: "https://pinterest.com/pin",
      dragDiagnostic,
    });
  });

  it("registers one subscription per Download channel and disposes all of them", async () => {
    const { bridge, on, listenerCount } = createFakeBridge();
    const client = createDownloadQueueClient(bridge);
    const listener = vi.fn();

    const disposer = await client.subscribe(listener);

    expect(on).toHaveBeenCalledTimes(4);
    expect(on.mock.calls.map(([event]) => event)).toEqual([
      "video-download-progress",
      "video-download-complete",
      "video-queue-count",
      "video-queue-detail",
    ]);
    expect(listenerCount()).toBe(4);

    disposer();
    expect(listenerCount()).toBe(0);
  });

  it("decodes each Download event into a feature action without retaining DTO fields", async () => {
    const { bridge, emit } = createFakeBridge();
    const client = createDownloadQueueClient(bridge);
    const listener = vi.fn();
    await client.subscribe(listener);

    emit("video-download-progress", progressPayload({ percent: 50 }));
    expect(listener).toHaveBeenLastCalledWith({
      type: "progress",
      progress: { traceId: "trace-1", percent: 50, stage: "downloading", speed: "1.2 MB/s", eta: "10s" },
    });

    const wireResult = resultPayload({ success: false, file_path: "C:/out.mp4", title: "T", error: "boom" });
    emit("video-download-complete", wireResult);
    const terminalEvent = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(terminalEvent.type).toBe("terminal");
    expect(terminalEvent.payload).not.toHaveProperty("file_path");
    expect(terminalEvent.payload).not.toHaveProperty("title");
    expect(terminalEvent.payload).toMatchObject({ traceId: "trace-1", success: false, error: "boom" });

    emit("video-queue-count", { activeCount: 2, pendingCount: 1, totalCount: 3, maxConcurrent: 2 });
    expect(listener).toHaveBeenLastCalledWith({ type: "queueCount", maxConcurrent: 2 });

    emit("video-queue-detail", {
      tasks: [{
        traceId: "trace-1",
        label: "  Video 1  ",
        status: "pending",
        phase: "selecting_quality",
        qualityOptions: [{ id: "o1", label: "1080p" }],
      }],
    });
    expect(listener).toHaveBeenLastCalledWith({
      type: "queueDetail",
      tasks: [{
        traceId: "trace-1",
        label: "Video 1",
        status: "pending",
        phase: "selecting_quality",
        qualityOptions: [{ id: "o1", label: "1080p" }],
      }],
    });
  });

  it("keeps malformed queue payloads bounded by the existing normalizers", async () => {
    const { bridge, emit } = createFakeBridge();
    const client = createDownloadQueueClient(bridge);
    const listener = vi.fn();
    await client.subscribe(listener);

    emit("video-queue-count", { activeCount: -5, maxConcurrent: 0 });
    expect(listener).toHaveBeenLastCalledWith({ type: "queueCount", maxConcurrent: 1 });

    emit("video-queue-detail", { tasks: [{ traceId: 7 }, null, { traceId: "ok", label: "  " }] });
    expect(listener).toHaveBeenLastCalledWith({
      type: "queueDetail",
      tasks: [{ traceId: "ok", label: "ok", status: "active", phase: null }],
    });
  });

  it("preserves a valid authoritative Intake marker for renderer and extension-origin events", async () => {
    const { bridge, emit } = createFakeBridge();
    const client = createDownloadQueueClient(bridge);
    const listener = vi.fn();
    await client.subscribe(listener);

    emit("video-queue-detail", {
      acceptedTraceId: "accepted",
      tasks: [{ traceId: "accepted", label: "Extension download", status: "pending" }],
    });

    expect(listener).toHaveBeenLastCalledWith({
      type: "queueDetail",
      acceptedTraceId: "accepted",
      tasks: [{
        traceId: "accepted",
        label: "Extension download",
        status: "pending",
        phase: null,
        qualityOptions: undefined,
      }],
    });
  });

  it("returns a working disposer even when one channel fails to register", async () => {
    const { bridge, on } = createFakeBridge();
    on.mockImplementationOnce(() => Promise.reject(new Error("bridge down")));
    const client = createDownloadQueueClient(bridge);
    const listener = vi.fn();

    const disposer = await client.subscribe(listener);
    disposer();
    expect(() => disposer()).not.toThrow();
  });
});

describe("classifyDownloadTerminal", () => {
  it("classifies typed failure codes/classifications only", () => {
    expect(classifyDownloadTerminal(
      resultPayload({ success: false, failure: { classification: "cancelled", rawMessage: "x" } }),
      false,
    )).toMatchObject({ kind: "cancelled", traceId: "trace-1" });

    expect(classifyDownloadTerminal(
      resultPayload({ success: false, failure: { code: "E_ABORTED", rawMessage: "x" } }),
      false,
    )).toMatchObject({ kind: "cancelled" });

    expect(classifyDownloadTerminal(
      resultPayload({ success: false, failure: { code: "E_NETWORK", rawMessage: "x" } }),
      false,
    )).toMatchObject({ kind: "failure" });
  });

  it("never reinterprets raw text for payloads with a typed failure", () => {
    // Even if the raw message mentions cancellation, the typed failure wins.
    expect(classifyDownloadTerminal(
      resultPayload({
        success: false,
        error: "Download cancelled by user",
        failure: { code: "E_NETWORK", rawMessage: "Download cancelled by user" },
      }),
      true,
    )).toMatchObject({ kind: "failure" });
  });

  it("lets a typed success win over optimistic cancel intent", () => {
    expect(classifyDownloadTerminal(
      resultPayload({ success: true }),
      true,
    )).toMatchObject({ kind: "success", errorSummary: null });
  });

  it("keeps the bounded legacy text fallback for old payloads without typed failure", () => {
    expect(classifyDownloadTerminal(
      resultPayload({ success: false, error: "Task was cancelled" }),
      false,
    )).toMatchObject({ kind: "cancelled" });

    expect(classifyDownloadTerminal(
      resultPayload({ success: false, error: "Network timeout" }),
      true,
    )).toMatchObject({ kind: "cancelled" });

    expect(classifyDownloadTerminal(
      resultPayload({ success: false, error: "Network timeout" }),
      false,
    )).toMatchObject({ kind: "failure", errorSummary: "Network timeout" });
  });
});
