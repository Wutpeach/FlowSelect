import { existsSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DownloadRuntimeError,
  type DownloadEngine,
  type DownloadIntent,
  type DownloadResult,
  type RawDownloadInput,
  type ResolvedDownloadPlan,
  type SiteProvider,
} from "../core";
import type { EngineExecutionContextWithRuntime } from "./engineExecutionContext";
import type {
  DownloadDiagnosticEvent,
  DownloadDiagnosticSink,
} from "../application/download-diagnostics";
import type { DownloadTelemetryEvent } from "../download-capabilities/telemetry";
import type { NetworkRouteResolution } from "../config/networkRoute";
import { genericProvider } from "../sites/generic";
import { pinterestProvider } from "../sites/pinterest";
import { xiaohongshuProvider } from "../sites/xiaohongshu";
import { youtubeProvider } from "../sites/youtube";

/**
 * The runtime publishes protocol-neutral terminal outcomes
 * (`{ traceId, result, failure, userUrl }`); tests view them through this
 * flat shape so outcome semantics stay explicit without repeating the unwrap.
 */
const toCompletionView = (payload: unknown): {
  traceId: string;
  success: boolean;
  error?: string;
  file_path?: string;
  title?: string;
  failure?: unknown;
} => {
  const outcome = payload as {
    traceId: string;
    result: { success: boolean; error?: string; filePath?: string; title?: string };
    failure?: unknown;
  };
  return {
    traceId: outcome.traceId,
    success: outcome.result.success,
    error: outcome.result.error,
    file_path: outcome.result.filePath,
    title: outcome.result.title,
    failure: outcome.failure ?? undefined,
  };
};

const { probeGalleryDlMetadataTitleMock } = vi.hoisted(() => ({
  probeGalleryDlMetadataTitleMock: vi.fn<() => Promise<string | undefined>>(async () => undefined),
}));

const {
  resolveGalleryDlMetadataTitleFromSidecarsMock,
  cleanupGalleryDlMetadataSidecarsMock,
} = vi.hoisted(() => ({
  resolveGalleryDlMetadataTitleFromSidecarsMock: vi.fn<() => Promise<string | undefined>>(async () => undefined),
  cleanupGalleryDlMetadataSidecarsMock: vi.fn(async (
    outputDir: string,
    outputStem: string,
    filePath?: string,
  ) => {
    const candidates = [
      `${outputStem}.info.json`,
      `${outputStem}.json`,
      filePath ? `${path.parse(filePath).name}.info.json` : null,
      filePath ? `${path.parse(filePath).name}.json` : null,
      "info.json",
    ].filter((entry): entry is string => Boolean(entry));

    for (const entry of candidates) {
      try {
        unlinkSync(path.join(outputDir, entry));
      } catch {
        // Ignore missing sidecars in tests.
      }
    }
  }),
}));

const {
  prepareVideoTranscodeTaskFromDownloadMock,
  runPreparedVideoTranscodeTaskMock,
} = vi.hoisted(() => ({
  prepareVideoTranscodeTaskFromDownloadMock: vi.fn(),
  runPreparedVideoTranscodeTaskMock: vi.fn(),
}));

const {
  runYtDlpAdvancedQualityProbeMock,
} = vi.hoisted(() => ({
  runYtDlpAdvancedQualityProbeMock: vi.fn(),
}));

vi.mock("./galleryDlMetadata.js", () => ({
  probeGalleryDlMetadataTitle: probeGalleryDlMetadataTitleMock,
  resolveGalleryDlMetadataTitleFromSidecars: resolveGalleryDlMetadataTitleFromSidecarsMock,
  cleanupGalleryDlMetadataSidecars: cleanupGalleryDlMetadataSidecarsMock,
}));

vi.mock("./transcode.js", () => ({
  prepareVideoTranscodeTaskFromDownload: prepareVideoTranscodeTaskFromDownloadMock,
  runPreparedVideoTranscodeTask: runPreparedVideoTranscodeTaskMock,
}));

vi.mock("./advancedQualityProbe.js", () => ({
  runYtDlpAdvancedQualityProbe: runYtDlpAdvancedQualityProbeMock,
}));

import {
  FAILED_TRANSCODE_RETENTION_LIMIT,
  createElectronDownloadRuntime,
} from "./service";
import type {
  RuntimeAdvancedQualitySiteSessionRefreshContext,
  RuntimeAuthFailureRecoveryContext,
  RuntimeDownloadSiteSessionRefreshContext,
  RuntimeEmitterEvent,
  RuntimeSetConsumer,
} from "./contracts";
import type { RuntimeSetLease, YtDlpAttemptRuntimeBinding } from "./engineExecutionContext";
import { resetRenameSequenceState } from "./renameRules";
import { bilibiliProvider } from "../sites/bilibili";
import { galleryDlSupportedProvider } from "../sites/gallery-dl-supported";
import { weiboProvider } from "../sites/weibo";
import { buildDiagnosticsSnapshot } from "../../electron/diagnostics.mjs";

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
  id: "yt-dlp" | "gallery-dl",
  execute: (context: EngineExecutionContextWithRuntime) => Promise<DownloadResult>,
): DownloadEngine<EngineExecutionContextWithRuntime> => ({
  id,
  // Stubs mirror the real adapters' declared capabilities so plan
  // requirements (e.g. YouTube/Bilibili advancedQuality) filter as in prod.
  capabilities: id === "yt-dlp"
    ? { advancedQuality: true }
    : { advancedQuality: false },
  supports: () => ({ supported: true }),
  // Typed directly against the runtime per-job contract; no contract-hiding cast.
  execute,
});

const createRuntime = (options: {
  providers?: SiteProvider[];
  engines?: DownloadEngine<EngineExecutionContextWithRuntime>[];
  maxConcurrent?: number;
  configString?: string;
  ensureEngineRuntimeReady?: (engineId: "yt-dlp" | "gallery-dl", reason: string) => Promise<void>;
  acquireRuntimeSetLease?: (
    consumer: RuntimeSetConsumer,
    reason: string,
  ) => Promise<RuntimeSetLease>;
  acquireYtDlpRuntimeBinding?: (reason: string) => Promise<YtDlpAttemptRuntimeBinding>;
  buildExecutionContext?: (
    context: EngineExecutionContextWithRuntime,
    input: RawDownloadInput,
  ) => EngineExecutionContextWithRuntime;
  environment?: {
    repoRoot?: string;
    configDir?: string;
    platform?: "win32" | "darwin" | "linux";
    arch?: "x64" | "arm64";
    desktopDir?: string;
    fetch?: typeof fetch;
  };
  onEmit?(event: RuntimeEmitterEvent, payload: unknown): void;
  onTelemetry?(event: DownloadTelemetryEvent): void;
  telemetrySink?: { record(event: DownloadTelemetryEvent): Promise<void> };
  diagnosticSink?: DownloadDiagnosticSink;
  handleAuthRequiredFailure?(
    context: RuntimeAuthFailureRecoveryContext,
  ): Promise<{ shouldRetry: boolean } | void>;
  refreshSiteSessionBeforeAdvancedQualityProbe?(
    context: RuntimeAdvancedQualitySiteSessionRefreshContext,
  ): Promise<void>;
  refreshSiteSessionBeforeDownload?(
    context: RuntimeDownloadSiteSessionRefreshContext,
  ): Promise<void>;
  resolveNetworkRoute?: (context: {
    targetUrl: string;
    providerId: string | null;
    engineId: "yt-dlp" | "gallery-dl";
  }) => Promise<NetworkRouteResolution>;
  resolveNetworkConsumer?: (engineId: string | undefined) => string;
  logger?: { log(message: string): void };
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
  telemetrySink: options.telemetrySink ?? {
    async record(event) {
      options.onTelemetry?.(event);
    },
  },
  logger: options.logger,
  ensureEngineRuntimeReady: options.ensureEngineRuntimeReady,
  acquireRuntimeSetLease: options.acquireRuntimeSetLease,
  acquireYtDlpRuntimeBinding: options.acquireYtDlpRuntimeBinding,
  buildExecutionContext: options.buildExecutionContext,
  handleAuthRequiredFailure: options.handleAuthRequiredFailure,
  refreshSiteSessionBeforeAdvancedQualityProbe: options.refreshSiteSessionBeforeAdvancedQualityProbe,
  refreshSiteSessionBeforeDownload: options.refreshSiteSessionBeforeDownload,
  resolveNetworkRoute: options.resolveNetworkRoute,
  resolveNetworkConsumer: options.resolveNetworkConsumer,
  diagnosticSink: options.diagnosticSink,
  maxConcurrent: options.maxConcurrent,
  providers: options.providers,
  engines: options.engines,
});

const createSettlementHarness = (
  tempDir: string,
  engine: DownloadEngine<EngineExecutionContextWithRuntime>,
): {
  runtime: ReturnType<typeof createRuntime>;
  completions: Array<{
    traceId: string;
    success: boolean;
    error?: string;
    file_path?: string;
    title?: string;
    failure?: unknown;
  }>;
  terminals: () => DownloadDiagnosticEvent[];
} => {
  const diagnostics: DownloadDiagnosticEvent[] = [];
  const completions: Array<{
    traceId: string;
    success: boolean;
    error?: string;
    file_path?: string;
    title?: string;
    failure?: unknown;
  }> = [];
  return {
    runtime: createRuntime({
      configString: JSON.stringify({ outputPath: tempDir }),
      providers: [youtubeProvider, genericProvider],
      engines: [engine],
      diagnosticSink: { record: (event) => void diagnostics.push(event) },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    }),
    completions,
    terminals: () => diagnostics.filter(
      (event) => event.type === "download.succeeded"
        || event.type === "download.failed"
        || event.type === "download.cancelled",
    ),
  };
};

describe("AmeowElectronDownloadRuntime", () => {
  afterEach(() => {
    resetRenameSequenceState();
    probeGalleryDlMetadataTitleMock.mockReset();
    probeGalleryDlMetadataTitleMock.mockResolvedValue(undefined);
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockReset();
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockResolvedValue(undefined);
    cleanupGalleryDlMetadataSidecarsMock.mockClear();
    prepareVideoTranscodeTaskFromDownloadMock.mockReset();
    prepareVideoTranscodeTaskFromDownloadMock.mockResolvedValue(null);
    runPreparedVideoTranscodeTaskMock.mockReset();
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { finalPath: string }) => ({
      filePath: task.finalPath,
    }));
    runYtDlpAdvancedQualityProbeMock.mockReset();
    runYtDlpAdvancedQualityProbeMock.mockResolvedValue({
      options: [],
    });
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
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
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

  it("atomically marks each authoritative snapshot across concurrent new memberships", async () => {
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => new Promise(() => undefined)),
      ],
      onEmit(event, payload) {
        events.push({ event, payload });
      },
    });

    const [first, second] = await Promise.all([
      runtime.queueVideoDownload({ url: "https://example.com/intake-a" }),
      runtime.queueVideoDownload({ url: "https://example.com/intake-b" }),
    ]);
    const markedDetails = events
      .filter((entry) => entry.event === "video-queue-detail")
      .map((entry) => entry.payload as {
        acceptedTraceId?: string;
        tasks: Array<{ traceId: string }>;
      })
      .filter((detail) => detail.acceptedTraceId !== undefined);

    expect(markedDetails).toEqual([
      expect.objectContaining({
        acceptedTraceId: first.traceId,
        tasks: [expect.objectContaining({ traceId: first.traceId })],
      }),
      expect.objectContaining({
        acceptedTraceId: second.traceId,
        tasks: [
          expect.objectContaining({ traceId: first.traceId }),
          expect.objectContaining({ traceId: second.traceId }),
        ],
      }),
    ]);
    expect(runtime.getQueueDetail()).not.toHaveProperty("acceptedTraceId");
  });

  it("emits a local Intake origin only on the same new-membership marker", async () => {
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [createEngineStub("yt-dlp", async () => new Promise(() => undefined))],
      onEmit(event, payload) {
        events.push({ event, payload });
      },
    });
    const ack = await runtime.queueDownload(
      { url: "https://example.com/origin" },
      { intakeOrigin: { x: 0.2, y: 0.7 } },
    );
    const marked = events.find((entry) => entry.event === "video-queue-detail"
      && (entry.payload as { acceptedTraceId?: string }).acceptedTraceId === ack.traceId)?.payload;
    expect(marked).toMatchObject({
      acceptedTraceId: ack.traceId,
      acceptedIntakeOrigin: { x: 0.2, y: 0.7 },
    });
    expect(runtime.getQueueDetail()).not.toHaveProperty("acceptedIntakeOrigin");
  });

  it("cancels pending work immediately", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          await new Promise<void>(() => undefined);
          return {
            traceId: context.traceId,
            success: true,
            filePath: "ignored",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/active" });
    const pending = await runtime.queueVideoDownload({ url: "https://example.com/pending" });

    const cancelled = await runtime.cancelDownload(pending.traceId);

    expect(cancelled).toBe(true);
    expect(completed.some((entry) => entry.traceId === pending.traceId)).toBe(true);
    // Pending cancellation serializes the typed E_ABORTED failure in the
    // protocol-neutral outcome (P3: no raw-message parsing needed downstream).
    expect(completed.find((entry) => entry.traceId === pending.traceId)).toMatchObject({
      success: false,
      failure: expect.objectContaining({
        code: "E_ABORTED",
        classification: "cancelled",
      }),
    });
    await waitFor(() => telemetry.some((entry) => entry.traceId === pending.traceId));
    expect(telemetry.find((entry) => entry.traceId === pending.traceId)).toMatchObject({
      siteId: "generic",
      providerId: "generic",
      engineChain: ["yt-dlp"],
      chosenEngine: null,
      errorCode: "E_ABORTED",
      diagnosticCategory: "cancelled",
      attemptCount: 0,
    });
  });

  it("keeps download lifecycle correct when every runtime log write throws", async () => {
    const completed: Array<{ traceId: string; success: boolean }> = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      logger: {
        log() {
          throw new Error("logger unavailable");
        },
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    const ack = await runtime.queueVideoDownload({ url: "https://example.com/video" });
    await waitFor(() => completed.some((entry) => entry.traceId === ack.traceId));

    expect(completed.find((entry) => entry.traceId === ack.traceId)).toMatchObject({
      success: true,
    });
    expect(runtime.getQueueState().totalCount).toBe(0);
  });

  it("still emits the terminal event for a pending cancellation when every log write throws", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => (
          await new Promise<never>(() => undefined)
        )),
      ],
      logger: {
        log() {
          throw new Error("logger unavailable");
        },
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/active" });
    const pending = await runtime.queueVideoDownload({ url: "https://example.com/pending" });

    const cancelled = await runtime.cancelDownload(pending.traceId);

    expect(cancelled).toBe(true);
    expect(completed.find((entry) => entry.traceId === pending.traceId)).toMatchObject({
      success: false,
      failure: expect.objectContaining({ code: "E_ABORTED" }),
    });
  });

  it("settles a completed task when the telemetry sink throws synchronously", async () => {
    const completed: Array<{ traceId: string; success: boolean }> = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      telemetrySink: {
        record() {
          throw new Error("telemetry unavailable");
        },
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    const ack = await runtime.queueVideoDownload({ url: "https://example.com/video" });
    await waitFor(() => completed.some((entry) => entry.traceId === ack.traceId));

    expect(completed.find((entry) => entry.traceId === ack.traceId)).toMatchObject({
      success: true,
    });
    expect(runtime.getQueueState().totalCount).toBe(0);
  });

  it("still emits the terminal event for a pending cancellation when the telemetry sink rejects", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => (
          await new Promise<never>(() => undefined)
        )),
      ],
      telemetrySink: {
        record() {
          return Promise.reject(new Error("telemetry unavailable"));
        },
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/active" });
    const pending = await runtime.queueVideoDownload({ url: "https://example.com/pending" });

    const cancelled = await runtime.cancelDownload(pending.traceId);

    expect(cancelled).toBe(true);
    expect(completed.find((entry) => entry.traceId === pending.traceId)).toMatchObject({
      success: false,
      failure: expect.objectContaining({ code: "E_ABORTED" }),
    });
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
          completed.push(toCompletionView(payload));
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

  it("does not disturb membership, cancellation, or settlement of a deferred active job", async () => {
    const activeJob: {
      release: (() => void) | null;
      abortSignal: AbortSignal | null;
    } = { release: null, abortSignal: null };
    const completions: Array<{ traceId: string; success: boolean }> = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => new Promise<DownloadResult>((resolve) => {
          activeJob.abortSignal = context.abortSignal;
          activeJob.release = () => resolve({
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          });
        })),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          const completion = toCompletionView(payload);
          completions.push({ traceId: completion.traceId, success: completion.success });
        }
      },
    });

    const accepted = await runtime.queueVideoDownload({ url: "https://example.com/active" });
    await waitFor(() => runtime.getQueueState().activeCount === 1 && activeJob.release !== null);
    const taskBeforeDiagnostics = runtime.getQueueDetail().tasks.find(
      (task) => task.traceId === accepted.traceId,
    );
    expect(taskBeforeDiagnostics).toMatchObject({
      traceId: accepted.traceId,
      status: "active",
    });

    const diagnostics = await buildDiagnosticsSnapshot({
      appVersion: "0.3.1",
      platform: "win32",
      arch: "x64",
      isPackaged: false,
      runtimeTarget: "x86_64-pc-windows-msvc",
      runtimeStatus: {
        python: { state: "missing", source: null, expectedSource: "bundled", path: null, error: "missing" },
        ytDlp: { state: "missing", source: null, expectedSource: "managed", path: null, error: "missing" },
        galleryDl: { state: "missing", source: null, expectedSource: "managed", path: null, error: "missing" },
        ffmpeg: { state: "missing", source: null, expectedSource: "managed", path: null, error: "missing" },
        deno: { state: "missing", source: null, expectedSource: "managed", path: null, error: "missing" },
      },
      runtimePaths: {
        ytDlp: "missing",
        galleryDl: "missing",
        ffmpeg: "missing",
        ffprobe: "missing",
        deno: "missing",
      },
      runtimeGate: {
        phase: "idle",
        missingComponents: [],
        lastError: null,
        updatedAtMs: 0,
        currentComponent: null,
        currentStage: null,
        progressPercent: null,
        downloadedBytes: null,
        totalBytes: null,
        nextComponent: null,
      },
      inspectOutputDirectory: async () => ({
        configured: false,
        exists: false,
        accessible: false,
        writable: false,
      }),
      inspectBrowserBridge: () => ({ listenerActive: false, connectedClientCount: 0, pendingRequestCount: 0 }),
      inspectDownloads: () => runtime.getQueueState(),
      readRecentRuntimeLogLines: async () => [],
      isPathPresent: () => false,
      probeVersion: vi.fn(),
    });

    expect(diagnostics.downloads.active.value).toBe(1);
    expect(diagnostics.downloads.pending.value).toBe(0);
    expect(runtime.getQueueDetail().tasks.find((task) => task.traceId === accepted.traceId))
      .toEqual(taskBeforeDiagnostics);
    expect(activeJob.abortSignal?.aborted).toBe(false);
    expect(completions).toEqual([]);

    activeJob.release?.();
    await waitFor(() => runtime.getQueueState().totalCount === 0);

    expect(completions.filter((completion) => completion.traceId === accepted.traceId)).toEqual([
      { traceId: accepted.traceId, success: true },
    ]);
    expect(runtime.getQueueDetail().tasks).not.toContainEqual(
      expect.objectContaining({ traceId: accepted.traceId }),
    );
  });

  it("creates a probing advanced-quality task instead of starting a normal download immediately", async () => {
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event, payload) {
        events.push({ event, payload });
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockResolvedValueOnce({
      options: [
        { id: "height_1080", label: "1080p", selector: "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/bv*[height=1080]+ba" },
      ],
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    expect(ack.accepted).toBe(true);
    expect(runtime.getQueueDetail().tasks).toEqual([
      expect.objectContaining({
        traceId: ack.traceId,
        status: "active",
        phase: "probing_quality",
      }),
    ]);

    await waitFor(() => {
      const task = runtime.getQueueDetail().tasks[0];
      return task?.phase === "selecting_quality";
    });

    expect(runYtDlpAdvancedQualityProbeMock).toHaveBeenCalledTimes(1);
    expect(events.some((entry) => entry.event === "video-download-progress")).toBe(false);
    const markedDetails = events
      .filter((entry) => entry.event === "video-queue-detail")
      .map((entry) => entry.payload as { acceptedTraceId?: string })
      .filter((detail) => detail.acceptedTraceId !== undefined);
    expect(markedDetails).toEqual([
      expect.objectContaining({ acceptedTraceId: ack.traceId }),
    ]);
  });

  it("probes advanced quality for an opaque fake Site declaring the requirement, without any Site allowlist", async () => {
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const opaqueFakeProvider: SiteProvider = {
      id: "opaque-fake",
      matches() {
        return true;
      },
      resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
        const intent: DownloadIntent = {
          type: "video",
          siteId: "opaque-fake",
          originalUrl: input.url,
          pageUrl: input.pageUrl,
          title: input.title,
          priority: 10,
          candidates: input.videoCandidates ?? [],
          preferredFormat: "best",
        };
        return {
          providerId: "opaque-fake",
          label: "opaque",
          intent,
          engines: [
            { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
          ],
          // The Site itself declares the advanced-quality requirement; the
          // runtime must not consult any generic Site allowlist.
          requirements: { advancedQuality: true },
        };
      },
    };
    const runtime = createRuntime({
      providers: [opaqueFakeProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockResolvedValueOnce({
      options: [
        { id: "height_1080", label: "1080p", selector: "bv*[height=1080]+ba" },
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://opaque.example/watch/1",
      pageUrl: "https://opaque.example/watch/1",
      advancedQualityRequest: true,
    });

    await waitFor(() => runYtDlpAdvancedQualityProbeMock.mock.calls.length === 1);
    expect(runYtDlpAdvancedQualityProbeMock).toHaveBeenCalledTimes(1);
    expect(completions).toHaveLength(0);
  });

  it("does not probe when the plan does not declare the advanced-quality requirement", async () => {
    const completions: Array<{ traceId: string; success: boolean; error?: string; failure?: unknown }> = [];
    const plainProvider: SiteProvider = {
      id: "plain-fake",
      matches() {
        return true;
      },
      resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
        const intent: DownloadIntent = {
          type: "video",
          siteId: "plain-fake",
          originalUrl: input.url,
          pageUrl: input.pageUrl,
          title: input.title,
          priority: 10,
          candidates: input.videoCandidates ?? [],
          preferredFormat: "best",
        };
        return {
          providerId: "plain-fake",
          label: "plain",
          intent,
          engines: [
            { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
          ],
          // No requirements declared: probing must not start.
        };
      },
    };
    const runtime = createRuntime({
      providers: [plainProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockClear();

    const ack = await runtime.queueVideoDownload({
      url: "https://plain.example/watch/1",
      pageUrl: "https://plain.example/watch/1",
      advancedQualityRequest: true,
    });

    await waitFor(() => completions.some((entry) => entry.traceId === ack.traceId));
    expect(runYtDlpAdvancedQualityProbeMock).not.toHaveBeenCalled();
    expect(completions.find((entry) => entry.traceId === ack.traceId)).toMatchObject({
      success: false,
      error: "更多画质探测失败",
    });
    // A plan that omits the requirement is a rejected intent, not a missing
    // engine: yt-dlp may well be registered, but probing is refused.
    const failure = completions.find((entry) => entry.traceId === ack.traceId)?.failure as
      | { code?: string }
      | undefined;
    expect(failure?.code).toBe("E_ENGINE_REJECTED_INTENT");
  });

  it("does not probe when yt-dlp is not registered", async () => {
    const completions: Array<{ traceId: string; success: boolean; error?: string; failure?: unknown }> = [];
    const fakeProvider: SiteProvider = {
      id: "fake",
      matches() {
        return true;
      },
      resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
        const intent: DownloadIntent = {
          type: "video",
          siteId: "fake",
          originalUrl: input.url,
          pageUrl: input.pageUrl,
          title: input.title,
          priority: 10,
          candidates: input.videoCandidates ?? [],
          preferredFormat: "best",
        };
        return {
          providerId: "fake",
          label: "fake",
          intent,
          engines: [
            { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
          ],
          requirements: { advancedQuality: true },
        };
      },
    };
    const runtime = createRuntime({
      providers: [fakeProvider],
      engines: [],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockClear();

    const ack = await runtime.queueVideoDownload({
      url: "https://fake.example/watch/1",
      pageUrl: "https://fake.example/watch/1",
      advancedQualityRequest: true,
    });

    await waitFor(() => completions.some((entry) => entry.traceId === ack.traceId));
    expect(runYtDlpAdvancedQualityProbeMock).not.toHaveBeenCalled();
    const failure = completions.find((entry) => entry.traceId === ack.traceId)?.failure as
      | { code?: string }
      | undefined;
    expect(failure?.code).toBe("E_ENGINE_NOT_FOUND");
  });

  it("does not probe when the registered yt-dlp engine lacks the advanced-quality capability", async () => {
    const completions: Array<{ traceId: string; success: boolean; error?: string; failure?: unknown }> = [];
    const fakeProvider: SiteProvider = {
      id: "fake",
      matches() {
        return true;
      },
      resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
        const intent: DownloadIntent = {
          type: "video",
          siteId: "fake",
          originalUrl: input.url,
          pageUrl: input.pageUrl,
          title: input.title,
          priority: 10,
          candidates: input.videoCandidates ?? [],
          preferredFormat: "best",
        };
        return {
          providerId: "fake",
          label: "fake",
          intent,
          engines: [
            { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
          ],
          requirements: { advancedQuality: true },
        };
      },
    };
    const incapableYtDlpStub: DownloadEngine<EngineExecutionContextWithRuntime> = {
      id: "yt-dlp",
      capabilities: { advancedQuality: false },
      supports: () => ({ supported: true }),
      execute: async (context) => ({
        traceId: context.traceId,
        success: true,
        filePath: `${context.outputDir}/${context.outputStem}.mp4`,
      }),
    };
    const runtime = createRuntime({
      providers: [fakeProvider],
      engines: [incapableYtDlpStub],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockClear();

    const ack = await runtime.queueVideoDownload({
      url: "https://fake.example/watch/1",
      pageUrl: "https://fake.example/watch/1",
      advancedQualityRequest: true,
    });

    await waitFor(() => completions.some((entry) => entry.traceId === ack.traceId));
    expect(runYtDlpAdvancedQualityProbeMock).not.toHaveBeenCalled();
    const failure = completions.find((entry) => entry.traceId === ack.traceId)?.failure as
      | { code?: string }
      | undefined;
    expect(failure?.code).toBe("E_ENGINE_REJECTED_INTENT");
  });

  it("dismisses an advanced-quality task without emitting a cancelled completion", async () => {
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockImplementationOnce(async (context: EngineExecutionContextWithRuntime) => {
      await new Promise<never>((_resolve, reject) => {
        if (context.abortSignal.aborted) {
          reject(new Error("probe aborted"));
          return;
        }
        context.abortSignal.addEventListener(
          "abort",
          () => reject(new Error("probe aborted")),
          { once: true },
        );
      });
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    await waitFor(() => runYtDlpAdvancedQualityProbeMock.mock.calls.length === 1);

    await expect(runtime.cancelDownload(ack.traceId)).resolves.toBe(true);
    await waitFor(() => runtime.getQueueState().totalCount === 0);

    expect(runtime.getQueueDetail().tasks).toEqual([]);
    expect(completions.some((entry) => entry.traceId === ack.traceId)).toBe(false);
  });

  it("keeps the advanced-quality probe lease until cancellation settles its runner", async () => {
    let acquiredLease: RuntimeSetLease | undefined;
    let probeLease: RuntimeSetLease | undefined;
    const release = vi.fn();
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      acquireRuntimeSetLease: async (consumer) => {
        expect(consumer).toBe("yt-dlp");
        acquiredLease = { release };
        return acquiredLease;
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockImplementationOnce(async (context: EngineExecutionContextWithRuntime) => {
      probeLease = context.runtimeSetLease;
      await new Promise<never>((_resolve, reject) => {
        context.abortSignal.addEventListener("abort", () => reject(new Error("probe aborted")), { once: true });
      });
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=lease-probe",
      pageUrl: "https://www.youtube.com/watch?v=lease-probe",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    await waitFor(() => probeLease !== undefined);
    expect(probeLease).toBe(acquiredLease);
    expect(release).not.toHaveBeenCalled();

    await expect(runtime.cancelDownload(ack.traceId)).resolves.toBe(true);
    await waitFor(() => release.mock.calls.length === 1);
    expect(release).toHaveBeenCalledOnce();
    expect(runtime.getQueueState().totalCount).toBe(0);
  });

  it("exposes advanced quality video title and post-process metadata in queue detail", async () => {
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
    });

    runYtDlpAdvancedQualityProbeMock.mockResolvedValueOnce({
      videoTitle: "Runtime resolved title",
      options: [
        {
          id: "height_1080",
          label: "1080p",
          postProcessPlan: "full_transcode",
          selector: "bv*[height=1080]+ba",
        },
        {
          id: "height_720",
          label: "720p",
          postProcessPlan: "remux_only",
          selector: "b[height=720]",
        },
      ],
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    await waitFor(() => runtime.getQueueDetail().tasks[0]?.phase === "selecting_quality");

    expect(runtime.getQueueDetail().tasks).toEqual([
      expect.objectContaining({
        traceId: ack.traceId,
        label: "https://www.youtube.com/watch?v=abc123",
        videoTitle: "Runtime resolved title",
        phase: "selecting_quality",
        qualityOptions: [
          {
            id: "height_1080",
            label: "1080p",
            tags: undefined,
            postProcessPlan: "full_transcode",
          },
          {
            id: "height_720",
            label: "720p",
            tags: undefined,
            postProcessPlan: "remux_only",
          },
        ],
      }),
    ]);
  });

  it("dedupes repeated advanced-quality requests for the same video", async () => {
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event, payload) {
        events.push({ event, payload });
      },
    });

    let releaseProbe: (() => void) | undefined;
    runYtDlpAdvancedQualityProbeMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseProbe = () => resolve();
      });
      return {
        options: [
          { id: "height_1080", label: "1080p", selector: "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/bv*[height=1080]+ba" },
        ],
      };
    });

    const first = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });
    const second = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    expect(second.traceId).toBe(first.traceId);
    expect(runtime.getQueueState().activeCount).toBe(1);
    expect(events
      .filter((entry) => entry.event === "video-queue-detail")
      .map((entry) => entry.payload as { acceptedTraceId?: string })
      .filter((detail) => detail.acceptedTraceId !== undefined))
      .toEqual([expect.objectContaining({ acceptedTraceId: first.traceId })]);

    if (releaseProbe) {
      releaseProbe();
    }
    await waitFor(() => runtime.getQueueDetail().tasks[0]?.phase === "selecting_quality");
  });

  it("refreshes site session before building the advanced-quality execution context", async () => {
    const calls: string[] = [];
    let savedCookies = "old-cookies";
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      async refreshSiteSessionBeforeAdvancedQualityProbe(context) {
        calls.push(`refresh:${context.siteId}:${context.url}`);
        savedCookies = "fresh-cookies";
      },
      buildExecutionContext(context) {
        calls.push(`build:${savedCookies}`);
        return {
          ...context,
          cookies: savedCookies,
        };
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockResolvedValueOnce({
      options: [
        { id: "height_1080", label: "1080p", selector: "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/bv*[height=1080]+ba" },
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    await waitFor(() => runYtDlpAdvancedQualityProbeMock.mock.calls.length === 1);
    expect(calls).toEqual([
      "refresh:youtube:https://www.youtube.com/watch?v=abc123",
      "build:fresh-cookies",
    ]);
    expect(runYtDlpAdvancedQualityProbeMock.mock.calls[0]?.[0].cookies).toBe("fresh-cookies");
  });

  it("continues advanced-quality probing when pre-probe site-session refresh fails", async () => {
    const refreshSiteSessionBeforeAdvancedQualityProbe = vi.fn(async () => {
      throw new Error("extension unavailable");
    });
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      refreshSiteSessionBeforeAdvancedQualityProbe,
    });

    runYtDlpAdvancedQualityProbeMock.mockResolvedValueOnce({
      options: [
        { id: "height_720", label: "720p", selector: "bv*[height=720]+ba" },
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    await waitFor(() => runtime.getQueueDetail().tasks[0]?.phase === "selecting_quality");
    expect(refreshSiteSessionBeforeAdvancedQualityProbe).toHaveBeenCalledTimes(1);
    expect(runYtDlpAdvancedQualityProbeMock).toHaveBeenCalledTimes(1);
  });

  it("does not refresh site session before normal non-advanced downloads", async () => {
    const refreshSiteSessionBeforeAdvancedQualityProbe = vi.fn(async () => undefined);
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      refreshSiteSessionBeforeAdvancedQualityProbe,
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });

    await waitFor(() => runtime.getQueueState().totalCount === 0);
    expect(refreshSiteSessionBeforeAdvancedQualityProbe).not.toHaveBeenCalled();
  });

  it("refreshes site session once before building a normal download execution context", async () => {
    const calls: string[] = [];
    let savedCookies = "old-cookies";
    const refreshSiteSessionBeforeDownload = vi.fn(async (context: RuntimeDownloadSiteSessionRefreshContext) => {
      calls.push(`refresh:${context.siteId}:${context.url}`);
      savedCookies = "fresh-cookies";
    });
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          calls.push(`execute:${context.cookies ?? "none"}`);
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      refreshSiteSessionBeforeDownload,
      buildExecutionContext(context) {
        calls.push(`build:${savedCookies}`);
        return {
          ...context,
          cookies: savedCookies,
        };
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });

    await waitFor(() => runtime.getQueueState().totalCount === 0);
    expect(refreshSiteSessionBeforeDownload).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "refresh:youtube:https://www.youtube.com/watch?v=abc123",
      "build:fresh-cookies",
      "execute:fresh-cookies",
    ]);
  });

  it("continues normal downloads when download-start site-session refresh fails", async () => {
    const refreshSiteSessionBeforeDownload = vi.fn(async () => {
      throw new Error("extension unavailable");
    });
    const engineExecute = vi.fn(async (context: EngineExecutionContextWithRuntime) => ({
      traceId: context.traceId,
      success: true,
      filePath: `${context.outputDir}/${context.outputStem}.mp4`,
    }));
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", engineExecute),
      ],
      refreshSiteSessionBeforeDownload,
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });

    await waitFor(() => runtime.getQueueState().totalCount === 0);
    expect(refreshSiteSessionBeforeDownload).toHaveBeenCalledTimes(1);
    expect(engineExecute).toHaveBeenCalledTimes(1);
  });

  it("continues the same advanced-quality task into a normal download after selection", async () => {
    const seenTraceIds: string[] = [];
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          seenTraceIds.push(context.traceId);
          expect(context.advancedQualitySelector).toBe("bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/bv*[height=1080]+ba");
          expect(context.advancedQualityLabel).toBe("1080p");
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      onEmit(event, payload) {
        events.push({ event, payload });
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockResolvedValueOnce({
      options: [
        { id: "height_1080", label: "1080p", selector: "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/bv*[height=1080]+ba" },
      ],
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    await waitFor(() => runtime.getQueueDetail().tasks[0]?.phase === "selecting_quality");

    await expect(
      runtime.selectAdvancedQualityOption(ack.traceId, "height_1080"),
    ).resolves.toBe(true);

    await waitFor(() => seenTraceIds.includes(ack.traceId));
    expect(seenTraceIds).toEqual([ack.traceId]);
    expect(events
      .filter((entry) => entry.event === "video-queue-detail")
      .map((entry) => entry.payload as { acceptedTraceId?: string })
      .filter((detail) => detail.acceptedTraceId !== undefined))
      .toEqual([expect.objectContaining({ acceptedTraceId: ack.traceId })]);
  });

  it("emits a failure completion and removes the task when advanced-quality probing fails", async () => {
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    runYtDlpAdvancedQualityProbeMock.mockRejectedValueOnce(new Error("probe failed"));

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });

    await waitFor(() => completions.some((entry) => entry.traceId === ack.traceId));
    expect(completions.find((entry) => entry.traceId === ack.traceId)).toMatchObject({
      success: false,
      error: "更多画质探测失败",
    });
    expect(runtime.getQueueState().totalCount).toBe(0);
  });

  it("records success telemetry with site, interaction mode, engine chain, and chosen engine", async () => {
    const telemetry: DownloadTelemetryEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mp4",
        containerNames: ["mov", "mp4"],
        videoCodec: "h264",
        audioCodec: "aac",
        decision: "skip_compatible",
        probeFailed: false,
        probeErrorSummary: null,
      });
      return null;
    });
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => telemetry.length === 1);
    expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetry[0]).toMatchObject({
      eventType: "download_outcome",
      outcome: "success",
      siteId: "youtube",
      providerId: "youtube",
      interactionMode: "paste",
      engineChain: ["yt-dlp"],
      chosenEngine: "yt-dlp",
      errorCode: null,
      errorClassification: null,
      downloadProfile: {
        qualityPreference: "best",
        ytdlpProfileKey: "youtube",
        ytdlpMergeOutputFormat: "mp4/mkv",
        ytdlpFormatSort: "res,codec:h264,acodec:aac,ext",
      },
      compatibility: {
        sourceExtension: "mp4",
        containerNames: ["mov", "mp4"],
        videoCodec: "h264",
        audioCodec: "aac",
        decision: "skip_compatible",
        probeFailed: false,
        probeErrorSummary: null,
      },
    });
  });

  it("ensures the selected engine runtime before executing the download", async () => {
    const ensured: Array<{ engineId: string; reason: string }> = [];
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      ensureEngineRuntimeReady: vi.fn(async (engineId, reason) => {
        ensured.push({ engineId, reason });
      }),
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => ensured.length === 1);
    expect(ensured[0]?.engineId).toBe("yt-dlp");
    expect(ensured[0]?.reason).toMatch(/^runtime_execute_.*_yt-dlp$/);
  });

  it("attaches a direct default route to yt-dlp execution contexts without a resolver hook", async () => {
    let receivedNetwork: unknown = undefined;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          receivedNetwork = context.network;
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => receivedNetwork !== undefined);
    expect(receivedNetwork).toMatchObject({
      route: {
        mode: "direct",
        source: "direct",
        reason: "no_proxy_source",
      },
    });
  });

  it("resolves one network route per Job and attaches it to every engine context", async () => {
    let receivedRoute: unknown = undefined;
    const resolveNetworkRoute = vi.fn(async (context) => {
      expect(context).toMatchObject({
        targetUrl: "https://www.youtube.com/watch?v=abc123",
        providerId: "youtube",
        engineId: "yt-dlp",
      });
      return {
        preference: "system" as const,
        effectivePolicyReason: null,
        consumer: "yt-dlp" as const,
        targetUrl: "https://www.youtube.com/watch?v=abc123",
        route: {
          mode: "proxy" as const,
          source: "system" as const,
          protocol: "http" as const,
          proxyUrl: "http://127.0.0.1:7897",
          resolvedFor: "https://www.youtube.com/watch?v=abc123",
        },
        status: "resolved" as const,
        trace: [],
      };
    });
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      resolveNetworkRoute,
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          receivedRoute = context.network?.route;
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => receivedRoute !== undefined);
    expect(resolveNetworkRoute).toHaveBeenCalledTimes(1);
    expect(receivedRoute).toMatchObject({
      mode: "proxy",
      proxyUrl: "http://127.0.0.1:7897",
    });
  });

  it("accepts an opaque fake engine through the injected network consumer resolver", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const fakeEngineProvider: SiteProvider = {
      id: "fake-engine-test",
      matches() {
        return true;
      },
      resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
        const intent: DownloadIntent = {
          type: "video",
          siteId: "fake",
          originalUrl: input.url,
          pageUrl: input.pageUrl,
          title: input.title,
          priority: 10,
          candidates: input.videoCandidates ?? [],
          preferredFormat: "best",
        };
        return {
          providerId: "fake-engine-test",
          label: "fake",
          intent,
          engines: [
            { engine: "fake-engine", priority: 100, when: "primary", reason: "fake primary" },
          ],
        };
      },
    };
    const runtime = createRuntime({
      providers: [fakeEngineProvider],
      resolveNetworkConsumer: (engineId) => `consumer:${engineId ?? "unknown"}`,
      engines: [
        {
          id: "fake-engine",
          capabilities: { advancedQuality: false },
          supports: () => ({ supported: true }),
          execute: async (context) => ({
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          }),
        },
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://example.com/fake/1",
      pageUrl: "https://example.com/fake/1",
    });

    await waitFor(() => completed.some((entry) => entry.traceId === ack.traceId));
    expect(completed.find((entry) => entry.traceId === ack.traceId)).toMatchObject({
      success: true,
    });
  });

  it("fails closed for an opaque fake engine when no consumer resolver is injected", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const fakeEngineProvider: SiteProvider = {
      id: "fake-engine-test",
      matches() {
        return true;
      },
      resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
        const intent: DownloadIntent = {
          type: "video",
          siteId: "fake",
          originalUrl: input.url,
          pageUrl: input.pageUrl,
          title: input.title,
          priority: 10,
          candidates: input.videoCandidates ?? [],
          preferredFormat: "best",
        };
        return {
          providerId: "fake-engine-test",
          label: "fake",
          intent,
          engines: [
            { engine: "fake-engine", priority: 100, when: "primary", reason: "fake primary" },
          ],
        };
      },
    };
    const runtime = createRuntime({
      providers: [fakeEngineProvider],
      engines: [
        {
          id: "fake-engine",
          capabilities: { advancedQuality: false },
          supports: () => ({ supported: true }),
          execute: async (context) => ({
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          }),
        },
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://example.com/fake/1",
      pageUrl: "https://example.com/fake/1",
    });

    await waitFor(() => completed.some((entry) => entry.traceId === ack.traceId));
    expect(completed.find((entry) => entry.traceId === ack.traceId)).toMatchObject({
      success: false,
      error: expect.stringContaining("No network consumer binding for engine fake-engine"),
    });
  });

  it("continues yt-dlp downloads with a direct fallback route when route resolution fails", async () => {
    let executed = false;
    let receivedNetwork: unknown = undefined;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      resolveNetworkRoute: vi.fn(async () => {
        throw new Error("resolveProxy failed");
      }),
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          executed = true;
          receivedNetwork = context.network;
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => executed);
    expect(receivedNetwork).toMatchObject({
      status: "failed",
      route: {
        mode: "direct",
        source: "fallback",
        reason: "resolution_fallback",
      },
      failure: {
        classification: "NETWORK_PROXY_RESOLUTION_FAILED",
      },
    });
  });

  it("waits for the selected engine runtime before executing the download", async () => {
    const runtimeEnsure = {
      release: null as (() => void) | null,
    };
    let engineExecuted = false;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      ensureEngineRuntimeReady: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          runtimeEnsure.release = resolve;
        });
      }),
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          engineExecuted = true;
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => runtimeEnsure.release !== null);
    expect(engineExecuted).toBe(false);
    const resolveRuntimeEnsure = runtimeEnsure.release;
    if (!resolveRuntimeEnsure) {
      throw new Error("Runtime ensure resolver was not captured");
    }
    resolveRuntimeEnsure();
    await waitFor(() => engineExecuted);
  });

  it("records failure telemetry with classified errors", async () => {
    const telemetry: DownloadTelemetryEvent[] = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => {
          throw new Error("cookies required for this resource");
        }),
      ],
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://example.com/protected",
      diagnostics: {
        source: "context_menu",
      },
    });

    await waitFor(() => telemetry.length === 1);
    expect(telemetry[0]).toMatchObject({
      outcome: "failure",
      siteId: "generic",
      providerId: "generic",
      interactionMode: "context_menu",
      engineChain: ["yt-dlp"],
      chosenEngine: "yt-dlp",
      errorCode: "E_EXECUTION_FAILED",
      errorClassification: "auth_required",
    });
  });

  it("reclassifies unstamped execution failures at the runtime boundary", async () => {
    // Legacy/unstamped E_EXECUTION_FAILED errors keep the compat behavior:
    // raw evidence is classified once at the Infrastructure boundary.
    const cases = [
      { message: "cookies required for this resource", expected: "auth_required" },
      { message: "connection timed out while downloading webpage", expected: "retry_same_engine" },
    ];

    for (const testCase of cases) {
      const telemetry: DownloadTelemetryEvent[] = [];
      const runtime = createRuntime({
        providers: [genericProvider],
        engines: [
          createEngineStub("yt-dlp", async () => {
            throw new DownloadRuntimeError("E_EXECUTION_FAILED", testCase.message);
          }),
        ],
        onTelemetry(event) {
          telemetry.push(event);
        },
      });

      await runtime.queueVideoDownload({ url: "https://example.com/protected" });
      await waitFor(() => telemetry.length === 1);
      expect(telemetry[0]).toMatchObject({
        outcome: "failure",
        errorCode: "E_EXECUTION_FAILED",
        errorClassification: testCase.expected,
      });
    }
  });

  it("keeps an explicitly classified fallback failure unchanged at the runtime boundary", async () => {
    const completed: Array<{ success: boolean; failure?: unknown }> = [];
    const explicitContext = { probe: "explicit-context" };
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => {
          throw new DownloadRuntimeError(
            "E_EXECUTION_FAILED",
            "network auth 403 requires login",
            {
              classification: "fallback_to_other_engine",
              context: explicitContext,
              cause: new Error("original cause"),
            },
          );
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/protected" });

    await waitFor(() => completed.length === 1);
    expect(completed[0]).toMatchObject({
      success: false,
      failure: {
        code: "E_EXECUTION_FAILED",
        classification: "fallback_to_other_engine",
        context: explicitContext,
      },
    });
  });

  it("does not retry auth-required failures through app-owned credential refresh", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    let attempts = 0;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => {
          attempts += 1;
          throw new Error("cookies required for this resource");
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(attempts).toBe(1);
    expect(completed[0]).toMatchObject({
      success: false,
      error: "cookies required for this resource",
    });
  });

  it("retries an auth-required failure once when extension site-session recovery succeeds", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    const recoveryContexts: RuntimeAuthFailureRecoveryContext[] = [];
    let attempts = 0;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("cookies required for this resource");
          }
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      async handleAuthRequiredFailure(context) {
        recoveryContexts.push(context);
        return { shouldRetry: true };
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(attempts).toBe(2);
    expect(recoveryContexts).toHaveLength(1);
    expect(recoveryContexts[0]).toMatchObject({
      plan: {
        providerId: "youtube",
        intent: {
          siteId: "youtube",
        },
      },
      chosenEngine: "yt-dlp",
      error: {
        classification: "auth_required",
      },
    });
    expect(completed[0]).toMatchObject({
      success: true,
    });
  });

  it("reuses one stable network route across auth recovery and engine fallback", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    let attempts = 0;
    let firstAttemptRoute: unknown = undefined;
    let retryAttemptRoute: unknown = undefined;
    const resolveNetworkRoute = vi.fn(async () => ({
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "yt-dlp" as const,
      targetUrl: "https://www.youtube.com/watch?v=abc123",
      route: {
        mode: "proxy" as const,
        source: "system" as const,
        protocol: "http" as const,
        proxyUrl: "http://127.0.0.1:7897",
        resolvedFor: "https://www.youtube.com/watch?v=abc123",
      },
      status: "resolved" as const,
      trace: [],
    }));
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      resolveNetworkRoute,
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          if (attempts === 1) {
            firstAttemptRoute = context.network;
            throw new Error("cookies required for this resource");
          }
          retryAttemptRoute = context.network;
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      async handleAuthRequiredFailure() {
        return { shouldRetry: true };
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(resolveNetworkRoute).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
    // The exact same resolution object is reused across the retry.
    expect(retryAttemptRoute).toBe(firstAttemptRoute);
  });

  it("reuses the exact resolved plan object across auth recovery while cookies refresh", async () => {
    const completed: Array<{ success: boolean }> = [];
    const attemptPlans: unknown[] = [];
    const attemptCookies: Array<string | undefined> = [];
    let savedCookies = "stale-cookies";
    let attempts = 0;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          attemptPlans.push(context.plan);
          attemptCookies.push(context.cookies);
          if (attempts === 1) {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "cookies required for this resource",
              { classification: "auth_required" },
            );
          }
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      buildExecutionContext(context) {
        // Mirrors the app composition: enriches per-attempt auth material
        // from the app-owned site session, never the shared plan.
        return {
          ...context,
          cookies: savedCookies,
        };
      },
      async handleAuthRequiredFailure() {
        savedCookies = "refreshed-cookies";
        return { shouldRetry: true };
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(attempts).toBe(2);
    // The exact same ResolvedDownloadPlan object survives auth recovery; only
    // the attempt auth material is refreshed.
    expect(attemptPlans[1]).toBe(attemptPlans[0]);
    expect(attemptCookies[0]).toBe("stale-cookies");
    expect(attemptCookies[1]).toBe("refreshed-cookies");
  });

  it("resolves a fresh network route for the next Job", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    const resolveNetworkRoute = vi.fn(async () => ({
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "yt-dlp" as const,
      targetUrl: "https://example.com/video",
      route: {
        mode: "direct" as const,
        source: "system" as const,
        reason: "resolved_direct" as const,
        resolvedFor: "https://example.com/video",
      },
      status: "resolved" as const,
      trace: [],
    }));
    const runtime = createRuntime({
      providers: [genericProvider],
      resolveNetworkRoute,
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          void context.network;
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/1" });
    await runtime.queueVideoDownload({ url: "https://example.com/2" });

    await waitFor(() => completed.length === 2);
    expect(resolveNetworkRoute).toHaveBeenCalledTimes(2);
  });

  it("records the actual applied engine outcome in success telemetry", async () => {
    const completed: Array<{ success: boolean }> = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          await context.onNetworkApplication?.({
            engine: "yt-dlp",
            appliedToEngine: true,
            reason: "system:http",
            failureClassification: null,
          });
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/1" });

    await waitFor(() => completed.length === 1);
    const event = telemetry.find((entry) => entry.outcome === "success");
    expect(event?.network).toMatchObject({
      engine: "yt-dlp",
      appliedToEngine: true,
      routeMode: "direct",
    });
  });

  it("shows the fallback engine that actually handled the download without re-resolving", async () => {
    const completed: Array<{ success: boolean }> = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    const dualEngineProvider: SiteProvider = {
      id: "dual-engine-test",
      matches() {
        return true;
      },
      resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
        const intent: DownloadIntent = {
          type: "video",
          siteId: "dual",
          originalUrl: input.url,
          pageUrl: input.pageUrl,
          title: input.title,
          priority: 10,
          candidates: input.videoCandidates ?? [],
          preferredFormat: "best",
        };
        return {
          providerId: "dual-engine-test",
          label: "dual",
          intent,
          engines: [
            { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
            { engine: "gallery-dl", priority: 50, when: "fallback", reason: "fallback" },
          ],
        };
      },
    };
    const resolveNetworkRoute = vi.fn(async () => ({
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "yt-dlp" as const,
      targetUrl: "https://example.com/video",
      route: {
        mode: "proxy" as const,
        source: "system" as const,
        protocol: "http" as const,
        proxyUrl: "http://127.0.0.1:7897",
        resolvedFor: "https://example.com/video",
      },
      status: "resolved" as const,
      trace: [],
    }));
    const runtime = createRuntime({
      providers: [dualEngineProvider],
      resolveNetworkRoute,
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          await context.onNetworkApplication?.({
            engine: "yt-dlp",
            appliedToEngine: true,
            reason: "system:http",
            failureClassification: null,
          });
          throw new Error("yt-dlp attempt failed");
        }),
        createEngineStub("gallery-dl", async (context) => {
          await context.onNetworkApplication?.({
            engine: "gallery-dl",
            appliedToEngine: true,
            reason: "system:http",
            failureClassification: null,
          });
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/1" });

    await waitFor(() => completed.length === 1);
    expect(resolveNetworkRoute).toHaveBeenCalledTimes(1);
    const event = telemetry.find((entry) => entry.outcome === "success");
    expect(event?.network).toMatchObject({
      engine: "gallery-dl",
      appliedToEngine: true,
    });
  });

  it("records a rejected complex route with NETWORK_PROXY_UNSUPPORTED in failure telemetry", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      resolveNetworkRoute: vi.fn(async () => ({
        preference: "system" as const,
        effectivePolicyReason: null,
        consumer: "yt-dlp" as const,
        targetUrl: "https://example.com/1",
        route: {
          mode: "complex" as const,
          source: "system" as const,
          reason: "multiple_candidates" as const,
          candidates: [],
          resolvedFor: "https://example.com/1",
        },
        status: "resolved" as const,
        trace: [],
      })),
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          await context.onNetworkApplication?.({
            engine: "yt-dlp",
            appliedToEngine: false,
            reason: "multiple_candidates",
            failureClassification: "NETWORK_PROXY_UNSUPPORTED",
          });
          throw new DownloadRuntimeError(
            "E_EXECUTION_FAILED",
            "Unsupported network route (multiple_candidates) for yt-dlp; the route is not applied.",
            {
              context: {
                networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
              },
            },
          );
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/1" });

    await waitFor(() => completed.length === 1);
    const event = telemetry.find((entry) => entry.outcome === "failure");
    expect(event?.network).toMatchObject({
      engine: "yt-dlp",
      appliedToEngine: false,
      routeMode: "complex",
      failureClassification: "NETWORK_PROXY_UNSUPPORTED",
    });
  });

  it("does not retry an auth-required failure when extension recovery declines", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    let attempts = 0;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => {
          attempts += 1;
          throw new Error("cookies required for this resource");
        }),
      ],
      async handleAuthRequiredFailure() {
        return { shouldRetry: false };
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(toCompletionView(payload));
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(attempts).toBe(1);
    expect(completed[0]).toMatchObject({
      success: false,
      error: "cookies required for this resource",
    });
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
            filePath: "yt.mp4",
          };
        }),
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            filePath: "gallery.mp4",
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

  it("does not block gallery-dl downloads on a pre-download metadata probe", async () => {
    const outputStems: string[] = [];

    const runtime = createRuntime({
      providers: [galleryDlSupportedProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          outputStems.push(context.outputStem);
          return {
            traceId: context.traceId,
            success: true,
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.instagram.com/p/C7example/",
      pageUrl: "https://www.instagram.com/p/C7example/",
      title: "Instagram",
    });

    await waitFor(() => outputStems.length === 1);
    expect(probeGalleryDlMetadataTitleMock).not.toHaveBeenCalled();
    expect(outputStems).toEqual(["Instagram"]);
  });

  it("renames gallery-dl downloads from info-json metadata after completion", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-gallerydl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const completions: Array<{ file_path?: string; success: boolean }> = [];
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockResolvedValue("alice - Sunset over the lake");

    const runtime = createRuntime({
      configString: JSON.stringify({ outputPath: tempDir }),
      providers: [galleryDlSupportedProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          const filePath = path.join(context.outputDir, `${context.outputStem}.mp4`);
          writeFileSync(filePath, "video");
          writeFileSync(
            path.join(context.outputDir, `${context.outputStem}.info.json`),
            JSON.stringify({
              title: "Instagram",
              user: { username: "alice" },
              content: "Sunset over the lake",
            }),
          );
          return {
            traceId: context.traceId,
            success: true,
            filePath: filePath,
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.instagram.com/p/C7example/",
        pageUrl: "https://www.instagram.com/p/C7example/",
        title: "Instagram",
      });

      await waitFor(() => completions.length === 1);
      expect(completions[0]).toMatchObject({
        success: true,
        file_path: expect.stringMatching(/alice - Sunset over the lake\.mp4$/),
      });
      expect(existsSync(path.join(tempDir, "Instagram.info.json"))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("removes generic gallery-dl info.json sidecars after completion", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-gallerydl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const completions: Array<{ file_path?: string; success: boolean }> = [];
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockResolvedValue("karl_shakur - DW1rwBtlnR9");

    const runtime = createRuntime({
      configString: JSON.stringify({ outputPath: tempDir }),
      providers: [galleryDlSupportedProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          const filePath = path.join(context.outputDir, `${context.outputStem}.mp4`);
          writeFileSync(filePath, "video");
          writeFileSync(
            path.join(context.outputDir, "info.json"),
            JSON.stringify({
              post_shortcode: "DW1rwBtlnR9",
              username: "karl_shakur",
              description: "Long caption that should not become the final filename.",
            }),
          );
          return {
            traceId: context.traceId,
            success: true,
            filePath: filePath,
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.instagram.com/reel/DW1rwBtlnR9/",
        pageUrl: "https://www.instagram.com/reel/DW1rwBtlnR9/",
        title: "Instagram",
      });

      await waitFor(() => completions.length === 1);
      expect(completions[0]).toMatchObject({
        success: true,
        file_path: expect.stringMatching(/karl_shakur - DW1rwBtlnR9\.mp4$/),
      });
      expect(existsSync(path.join(tempDir, "info.json"))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses gallery-dl for Pinterest even when a verified direct asset is present", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          expect(context.enginePlan.sourceUrl).toBe("https://www.pinterest.com/pin/1234567890/");
          expect(context.intent.candidates).toEqual([]);
          return {
            traceId: context.traceId,
            success: true,
            filePath: "gallery.mp4",
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
    expect(routes[0]?.startsWith("gallery:")).toBe(true);
  });

  it("hydrates Xiaohongshu page requests but still routes through yt-dlp", async () => {
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
          expect(context.enginePlan.sourceUrl).toBe(
            "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
          );
          expect(context.intent.candidates).toEqual([
            {
              url: "https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4",
              type: "direct_cdn",
              source: "page_html",
              confidence: "high",
              mediaType: "video",
            },
          ]);
          return {
            traceId: context.traceId,
            success: true,
            filePath: "yt.mp4",
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
    expect(routes[0]?.startsWith("yt:")).toBe(true);
  });

  it("lets downloader engines receive short links without runtime expansion", async () => {
    const routes: string[] = [];
    const fetchImpl = vi.fn(async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", {
        configurable: true,
        value: "https://weibo.com/tv/show/1034:5284278758473738",
      });
      return response;
    });
    const runtime = createRuntime({
      providers: [weiboProvider, genericProvider],
      environment: {
        fetch: fetchImpl as unknown as typeof fetch,
      },
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          expect(context.plan.providerId).toBe("generic");
          expect(context.enginePlan.sourceUrl).toBe("https://t.cn/AXIDyEZb");
          expect(context.intent.siteId).toBe("generic");
          return {
            traceId: context.traceId,
            success: true,
            filePath: "yt.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://t.cn/AXIDyEZb",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lets downloader engines receive Weibo visitor wrappers without runtime unwrapping", async () => {
    const routes: string[] = [];
    const wrapperUrl = "https://passport.weibo.com/visitor/visitor?entry=krvideo&a=enter&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677%3Ffrom%3Dold_pc_videoshow&domain=.weibo.com";
    const runtime = createRuntime({
      providers: [weiboProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          expect(context.plan.providerId).toBe("weibo");
          expect(context.enginePlan.sourceUrl).toBe(wrapperUrl);
          expect(context.intent.siteId).toBe("weibo");
          return {
            traceId: context.traceId,
            success: true,
            filePath: "yt.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: wrapperUrl,
      siteHint: "weibo",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
  });

  it("uses yt-dlp for Xiaohongshu even when a verified direct asset is present", async () => {
    const routes: string[] = [];
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          expect(context.enginePlan.sourceUrl).toBe(
            "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
          );
          return {
            traceId: context.traceId,
            success: true,
            filePath: "yt.mp4",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
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
    expect(routes).toEqual([expect.stringMatching(/^yt:/)]);
    expect(completions[0]).toMatchObject({
      success: true,
    });
  });

  it("queues downstream transcode for Xiaohongshu yt-dlp downloads", async () => {
    const events: RuntimeEmitterEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockResolvedValue({
      traceId: "transcode-trace",
      label: "Xiaohongshu",
      sourcePath: "source.mp4",
      sourceFormat: "mp4",
      targetFormat: "mp4",
      plan: "remux_only",
      durationSeconds: null,
      finalPath: "/tmp/source.mp4",
    });
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `${context.outputDir}/${context.outputStem}.mp4`,
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
    expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalled();
    expect(events).toContain("video-transcode-queued");
  });

  it("records probe-failure compatibility telemetry while preserving full-transcode fallback", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        traceId: string;
        label: string;
        sourcePath: string;
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mp4",
        containerNames: [],
        videoCodec: null,
        audioCodec: null,
        decision: "probe_failure_full_transcode",
        probeFailed: true,
        probeErrorSummary: "ffprobe failed before fallback",
      });
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mp4",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: null,
        finalPath: "D:/downloads/Probe Failure.mp4",
      };
    });
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: "D:/downloads/Probe Failure Source.mp4",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=probe-failure",
      pageUrl: "https://www.youtube.com/watch?v=probe-failure",
      siteHint: "youtube",
      title: "Probe Failure",
    });

    await waitFor(() => runtime.getTranscodeQueueState().totalCount === 1);
    await waitFor(() => events.includes("video-transcode-queued"));
    await waitFor(() => telemetry.length === 1);
    expect(telemetry[0]?.compatibility).toMatchObject({
      sourceExtension: "mp4",
      decision: "probe_failure_full_transcode",
      probeFailed: true,
      probeErrorSummary: "ffprobe failed before fallback",
    });
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
          completions.push(toCompletionView(payload));
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
            filePath: "gallery.mp4",
          };
        }),
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            filePath: "yt.mp4",
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
    const outputDir = path.join(os.tmpdir(), `ameow-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
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
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
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
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
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
    const outputDir = path.join(os.tmpdir(), `ameow-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
            filePath: `${context.outputDir}/${context.outputStem}.mp4`,
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

  it("uses a youtube id stem immediately and renames to the resolved title after yt-dlp completes", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-ytdlp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const outputStems: string[] = [];
    const completions: Array<{ file_path?: string; success: boolean; title?: string }> = [];

    const runtime = createRuntime({
      configString: JSON.stringify({ outputPath: tempDir }),
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          outputStems.push(context.outputStem);
          const filePath = path.join(context.outputDir, `${context.outputStem}.mp4`);
          writeFileSync(filePath, "video");
          return {
            traceId: context.traceId,
            success: true,
            filePath: filePath,
            title: "Recovered YouTube Title",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(toCompletionView(payload));
        }
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.youtube.com/watch?v=abc123",
      });

      await waitFor(() => completions.length === 1);
      expect(outputStems).toEqual(["youtube_abc123"]);
      expect(completions[0]).toMatchObject({
        success: true,
        title: "Recovered YouTube Title",
        file_path: expect.stringMatching(/Recovered YouTube Title\.mp4$/),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("records one diagnostic success and one product success with the settled path when rename succeeds", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-settle-ok-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const harness = createSettlementHarness(
      tempDir,
      createEngineStub("yt-dlp", async (context) => {
        const filePath = path.join(context.outputDir, `${context.outputStem}.mp4`);
        writeFileSync(filePath, "video");
        return {
          traceId: context.traceId,
          success: true,
          filePath,
          title: "Recovered YouTube Title",
        };
      }),
    );

    try {
      await harness.runtime.queueVideoDownload({
        url: "https://www.youtube.com/watch?v=abc123",
      });

      await waitFor(() => harness.completions.length === 1);
      // Exactly one diagnostic terminal, a success, and the product event
      // carries the settled path/title.
      expect(harness.terminals()).toEqual([
        expect.objectContaining({
          type: "download.succeeded",
          traceId: harness.completions[0]?.traceId,
        }),
      ]);
      expect(harness.completions[0]).toMatchObject({
        success: true,
        title: "Recovered YouTube Title",
        file_path: expect.stringMatching(/Recovered YouTube Title\.mp4$/),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("records one failed diagnostic terminal and one failed product terminal when rename settlement fails", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-settle-fail-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const harness = createSettlementHarness(
      tempDir,
      createEngineStub("yt-dlp", async (context) => ({
        traceId: context.traceId,
        success: true,
        // The output file is never written: the title rename must fail.
        filePath: path.join(context.outputDir, `${context.outputStem}.mp4`),
        title: "Recovered YouTube Title",
      })),
    );

    try {
      await harness.runtime.queueVideoDownload({
        url: "https://www.youtube.com/watch?v=abc123",
      });

      await waitFor(() => harness.completions.length === 1);
      // No success terminal; exactly one failed diagnostic terminal whose
      // typed semantics match the single failed product terminal.
      expect(harness.terminals()).toEqual([
        expect.objectContaining({
          type: "download.failed",
          errorCode: "E_EXECUTION_FAILED",
          classification: "fallback_to_other_engine",
        }),
      ]);
      expect(harness.completions[0]).toMatchObject({
        success: false,
        failure: {
          code: "E_EXECUTION_FAILED",
          classification: "fallback_to_other_engine",
        },
      } satisfies { success: boolean; failure: unknown });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("emits an early downloading activity before the engine reports yt-dlp progress", async () => {
    const progressEvents: Array<{ stage?: string; speed?: string }> = [];

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: "D:/downloads/youtube_abc123.mp4",
        })),
      ],
      onEmit(event, payload) {
        if (event === "video-download-progress") {
          progressEvents.push(payload as { stage?: string; speed?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => progressEvents.length >= 1);
    expect(progressEvents[0]).toMatchObject({
      stage: "preparing",
      speed: "Resolving media...",
    });
  });

  it("queues downstream transcode after a highest-quality YouTube download completes with MKV output", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    const transcodeCompletions: Array<() => void> = [];

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        traceId: string;
        label: string;
        sourcePath: string;
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mkv",
        containerNames: ["matroska", "webm"],
        videoCodec: "vp9",
        audioCodec: "opus",
        decision: "full_transcode",
        probeFailed: false,
        probeErrorSummary: null,
      });
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
          filePath: "D:/downloads/Recovered YouTube Title.mkv",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
      onTelemetry(event) {
        telemetry.push(event);
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
      await waitFor(() => telemetry.length === 1);
      expect(telemetry[0]?.compatibility).toMatchObject({
        sourceExtension: "mkv",
        decision: "full_transcode",
        probeFailed: false,
      });
      expect(telemetry[0]?.downloadProfile).toMatchObject({
        qualityPreference: "best",
        ytdlpProfileKey: "youtube",
        ytdlpMergeOutputFormat: "mp4/mkv",
      });
    } finally {
      transcodeCompletions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getTranscodeQueueState().totalCount === 0);
    }
  });

  it("holds each media-tools lease through probe and transcode runner settlement", async () => {
    const leases: Array<{ consumer: RuntimeSetConsumer; release: ReturnType<typeof vi.fn> }> = [];
    let finishTranscode: ((value: { filePath: string }) => void) | undefined;

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
        finalPath: "D:/downloads/lease-proof.mp4",
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async () => new Promise<{ filePath: string }>((resolve) => {
      finishTranscode = resolve;
    }));

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      acquireRuntimeSetLease: async (consumer) => {
        const lease = { consumer, release: vi.fn() };
        leases.push(lease);
        return lease;
      },
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          await context.runtimeSetLease?.release();
          return {
            traceId: context.traceId,
            success: true,
            filePath: "D:/downloads/lease-proof.mkv",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=lease-transcode",
      pageUrl: "https://www.youtube.com/watch?v=lease-transcode",
      siteHint: "youtube",
      ytdlpQuality: "best",
    });

    await waitFor(() => runPreparedVideoTranscodeTaskMock.mock.calls.length === 1);
    expect(leases.map((lease) => lease.consumer)).toEqual([
      "yt-dlp",
      "media-tools",
      "media-tools",
    ]);
    expect(leases[0]?.release).toHaveBeenCalledOnce();
    expect(leases[1]?.release).toHaveBeenCalledOnce();
    expect(leases[2]?.release).not.toHaveBeenCalled();

    finishTranscode?.({ filePath: "D:/downloads/lease-proof.mp4" });
    await waitFor(() => leases[2]?.release.mock.calls.length === 1);
    expect(leases[2]?.release).toHaveBeenCalledOnce();
    expect(runtime.getTranscodeQueueState().totalCount).toBe(0);
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
          filePath: "D:/downloads/Bilibili Archive.mkv",
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
    const telemetry: DownloadTelemetryEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mp4",
        containerNames: ["mov", "mp4"],
        videoCodec: "h264",
        audioCodec: "aac",
        decision: "skip_compatible",
        probeFailed: false,
        probeErrorSummary: null,
      });
      return null;
    });

    const runtime = createRuntime({
      providers: [bilibiliProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: "D:/downloads/Bilibili Preview[1920x1080][highest].mp4",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
      onTelemetry(event) {
        telemetry.push(event);
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
    await waitFor(() => telemetry.length === 1);
    expect(telemetry[0]?.compatibility).toMatchObject({
      sourceExtension: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      decision: "skip_compatible",
      probeFailed: false,
    });
    expect(telemetry[0]?.downloadProfile).toMatchObject({
      qualityPreference: "best",
      ytdlpProfileKey: "default",
      ytdlpMergeOutputFormat: "mp4/mkv",
    });
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
          filePath: "D:/downloads/Failure Case.mkv",
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

  it("caps failed transcode retention to the newest operational rows", async () => {
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          filePath: `D:/downloads/${context.traceId}.mkv`,
        })),
      ],
    });

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { traceId: string; label: string; sourcePath: string };
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 30,
        finalPath: `D:/downloads/${input.traceId}.mp4`,
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async () => {
      throw new Error("ffmpeg failed");
    });

    const queuedAcks: Array<{ traceId: string }> = [];
    for (let index = 0; index < FAILED_TRANSCODE_RETENTION_LIMIT + 5; index += 1) {
      const ack = await runtime.queueVideoDownload({
        url: `https://www.youtube.com/watch?v=failure${index}`,
        pageUrl: `https://www.youtube.com/watch?v=failure${index}`,
        title: `Failure ${index}`,
        siteHint: "youtube",
        ytdlpQuality: "best",
      });
      queuedAcks.push(ack);
    }

    await waitFor(() => runtime.getQueueState().totalCount === 0);
    await waitFor(() => runtime.getTranscodeQueueState().failedCount === FAILED_TRANSCODE_RETENTION_LIMIT);

    const transcodeState = runtime.getTranscodeQueueState();
    const transcodeDetail = runtime.getTranscodeQueueDetail();

    expect(transcodeState.failedCount).toBe(FAILED_TRANSCODE_RETENTION_LIMIT);
    expect(transcodeState.totalCount).toBe(FAILED_TRANSCODE_RETENTION_LIMIT);
    expect(transcodeDetail.tasks).toHaveLength(FAILED_TRANSCODE_RETENTION_LIMIT);
    expect(transcodeDetail.tasks.every((task) => task.status === "failed")).toBe(true);

    expect(transcodeDetail.tasks.some((task) => task.traceId === queuedAcks[0]?.traceId)).toBe(false);
    expect(transcodeDetail.tasks.some((task) => task.traceId === queuedAcks[4]?.traceId)).toBe(false);
    expect(
      transcodeDetail.tasks.some(
        (task) => task.traceId === queuedAcks[queuedAcks.length - 1]?.traceId,
      ),
    ).toBe(true);
    expect(transcodeDetail.tasks[0]?.traceId).toBe(queuedAcks[5]?.traceId);
    expect(transcodeDetail.tasks[transcodeDetail.tasks.length - 1]?.traceId)
      .toBe(queuedAcks[queuedAcks.length - 1]?.traceId);
  });

  it("acquires one bundled binding at the attempt boundary and records only its sanitized identity", async () => {
    const release = vi.fn();
    const acquireYtDlpRuntimeBinding = vi.fn(async () => ({
      lease: { release },
      binaries: {
        ytDlp: "D:/task-userdata/runtimes/yt-dlp/x64/baseline/venv/Scripts/yt-dlp.exe",
        ffmpeg: "D:/task-userdata/runtimes/ffmpeg/x64/real/ffmpeg.exe",
        deno: "D:/task-userdata/runtimes/deno/x64/real/deno.exe",
      },
      identity: { candidate: "bundled" as const, runtimeSetId: "stable-runtime-set" },
    }));
    const observedContexts: EngineExecutionContextWithRuntime[] = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      acquireYtDlpRuntimeBinding,
      engines: [createEngineStub("yt-dlp", async (context) => {
        observedContexts.push(context);
        await context.runtimeSetLease?.release();
        return { traceId: context.traceId, success: true, filePath: "D:/downloads/pinned.mp4" };
      })],
    });

    await runtime.queueVideoDownload({ url: "https://example.com/pinned" });
    await waitFor(() => runtime.getQueueState().totalCount === 0);

    expect(acquireYtDlpRuntimeBinding).toHaveBeenCalledOnce();
    expect(observedContexts[0]?.ytDlpRuntimeBinding?.binaries.ytDlp).toContain("baseline");
    expect(runtime.getRecentYtDlpRuntimeAttempts()).toEqual([
      { runtimeCandidate: "bundled", runtimeSetId: "stable-runtime-set" },
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("uses the same binding port for advanced-quality probing and releases after the probe settles", async () => {
    const release = vi.fn();
    const acquireYtDlpRuntimeBinding = vi.fn(async () => ({
      lease: { release },
      binaries: {
        ytDlp: "D:/task-userdata/runtimes/yt-dlp/x64/baseline/venv/Scripts/yt-dlp.exe",
        ffmpeg: "D:/task-userdata/runtimes/ffmpeg/x64/real/ffmpeg.exe",
        deno: "D:/task-userdata/runtimes/deno/x64/real/deno.exe",
      },
      identity: { candidate: "bundled" as const, runtimeSetId: "probe-runtime-set" },
    }));
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      acquireYtDlpRuntimeBinding,
      engines: [createEngineStub("yt-dlp", async (context) => ({
        traceId: context.traceId,
        success: true,
        filePath: "D:/downloads/probe.mp4",
      }))],
    });
    runYtDlpAdvancedQualityProbeMock.mockResolvedValueOnce({
      options: [{ id: "height_1080", label: "1080p", selector: "best" }],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=pinned",
      pageUrl: "https://www.youtube.com/watch?v=pinned",
      siteHint: "youtube",
      advancedQualityRequest: true,
    });
    await waitFor(() => runYtDlpAdvancedQualityProbeMock.mock.calls.length === 1);

    expect(acquireYtDlpRuntimeBinding).toHaveBeenCalledOnce();
    expect(runYtDlpAdvancedQualityProbeMock.mock.calls[0]?.[0]).toMatchObject({
      binaries: { ytDlp: expect.stringContaining("baseline") },
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it("re-resolves a bundled binding for the existing auth-recovery attempt", async () => {
    const releases = [vi.fn(), vi.fn()];
    const acquireYtDlpRuntimeBinding = vi.fn(async () => {
      const index = acquireYtDlpRuntimeBinding.mock.calls.length - 1;
      return {
        lease: { release: releases[index] ?? vi.fn() },
        binaries: {
          ytDlp: `D:/userdata/baseline-${index}/yt-dlp.exe`,
          ffmpeg: "D:/userdata/ffmpeg/real/ffmpeg.exe",
          deno: "D:/userdata/deno/real/deno.exe",
        },
        identity: { candidate: "bundled" as const, runtimeSetId: `auth-runtime-${index}` },
      };
    });
    let attempts = 0;
    const runtime = createRuntime({
      providers: [genericProvider],
      acquireYtDlpRuntimeBinding,
      handleAuthRequiredFailure: async () => ({ shouldRetry: true }),
      engines: [createEngineStub("yt-dlp", async (context) => {
        attempts += 1;
        try {
          if (attempts === 1) {
            throw new DownloadRuntimeError("E_EXECUTION_FAILED", "authentication required", {
              classification: "auth_required",
            });
          }
          return { traceId: context.traceId, success: true, filePath: "D:/downloads/auth-retry.mp4" };
        } finally {
          await context.runtimeSetLease?.release();
        }
      })],
    });

    await runtime.queueVideoDownload({ url: "https://example.com/auth-retry" });
    await waitFor(() => runtime.getQueueState().totalCount === 0);

    expect(attempts).toBe(2);
    expect(acquireYtDlpRuntimeBinding).toHaveBeenCalledTimes(2);
    expect(runtime.getRecentYtDlpRuntimeAttempts()).toEqual([
      { runtimeCandidate: "bundled", runtimeSetId: "auth-runtime-0" },
      { runtimeCandidate: "bundled", runtimeSetId: "auth-runtime-1" },
    ]);
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).toHaveBeenCalledOnce();
  });
});
