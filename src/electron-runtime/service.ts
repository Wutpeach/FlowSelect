import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ElectronDownloadRuntime,
  ElectronDownloadRuntimeOptions,
  RuntimeLogger,
  RuntimeManagedComponent,
  RuntimeSetConsumer,
} from "./contracts.js";
import {
  inspectRuntimeDependencyStatus,
  resolveSharedMediaRuntimeTools,
  resolveYtDlpRuntimeDependencies,
} from "./runtimePaths.js";
import { createRuntimeDependencyResolver } from "./runtimeDependencyGate.js";
import {
  buildOutputStem,
  nextDownloadTraceId,
  parseJsonObject,
  resolveAvailableOutputStem,
  resolveOutputDir,
  summarizeError,
} from "./runtimeUtils.js";
import {
  allocateRenameStem,
  releaseRenameStem,
  resolveRenameEnabled,
} from "./renameRules.js";
import {
  cleanupGalleryDlMetadataSidecars,
  resolveGalleryDlMetadataTitleFromSidecars,
} from "./galleryDlMetadata.js";
import {
  runYtDlpAdvancedQualityProbe,
  type AdvancedQualityProbeResult,
} from "./advancedQualityProbe.js";
import type {
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeStage,
  VideoTranscodeTaskPayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
  VideoQueueTaskPhase,
} from "../protocol/download/ipcTypes.js";
import type {
  AdvancedQualityOption,
  DownloadQueueAck,
  DownloadTerminalOutcome,
  PastedSelectionPorts,
  QueueDownloadCommand,
  QueueDownloadPresentationCause,
} from "../application/download-api.js";
import { toRawDownloadInput } from "../application/download-api.js";
import type { RuntimeFailureDiagnostic } from "../types/errorDiagnostics.js";
import type {
  DownloadProgress,
  DownloadResult,
  EnginePlan,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../core/index.js";
import { createEngineRegistry, type EngineRegistry } from "../engines/engine-registry.js";
import { DownloadOrchestrator } from "../orchestration/download-orchestrator.js";
import { loadBuiltinProviders } from "../sites/provider-loader.js";
import { createSiteRegistry } from "../sites/site-registry.js";
import {
  prepareVideoTranscodeTaskFromDownload,
  runPreparedVideoTranscodeTask,
  type PreparedVideoTranscodeTask,
  type VideoCompatibilityAnalysis,
} from "./transcode.js";
import {
  createDownloadTelemetryEvent,
  createDownloadTelemetrySink,
  type DownloadTelemetrySink,
} from "./downloadTelemetry.js";
import { DownloadRuntimeError } from "../core/index.js";
import { resolveYtdlpFormatProfile } from "./engineManifest.js";
import {
  buildDirectRouteResolution,
  buildResolutionFailureFallbackRoute,
  toNetworkDiagnosticSnapshot,
  type NetworkDiagnosticSnapshot,
  type NetworkFailureClassification,
  type NetworkRouteResolution,
} from "../config/networkRoute.js";
import {
  classifyEngineDiagnosticCategory,
  classifyEngineFailure,
} from "./engineErrorClassifier.js";
import type { DownloadExecutionContext } from "./contracts.js";
import type {
  EngineExecutionContextWithRuntime,
  RuntimeSetLease,
} from "./engineExecutionContext.js";
import {
  resolveEngineNetworkConsumer,
  type NetworkApplicationOutcome,
} from "./engineNetworkAdapters.js";
import type { DownloadTelemetryProfile } from "../download-capabilities/telemetry.js";
import { DownloadJobService } from "../application/download-job-service.js";
import {
  createDownloadDiagnosticRecorder,
  getDownloadTerminalDiagnosticSummary,
  resolveDownloadDiagnosticCategory,
  type DownloadDiagnosticNetwork,
  type DownloadDiagnosticSink,
  type DownloadTerminalDiagnosticSummary,
} from "../application/download-diagnostics.js";
import { createRuntimeLogDownloadDiagnosticSink } from "./downloadDiagnosticSink.js";
import { sanitizeDiagnosticText, toSafeDiagnosticUrl } from "../core/index.js";

type PendingTask = {
  traceId: string;
  label: string;
  request: RawDownloadInput;
};

type ActiveTask = PendingTask & {
  abortController: AbortController;
};

type AdvancedQualityRuntimeOption = AdvancedQualityOption & {
  selector: string;
};

type AdvancedQualityTaskState = {
  traceId: string;
  label: string;
  videoTitle?: string;
  request: RawDownloadInput;
  dedupeKey: string;
  phase: Extract<VideoQueueTaskPhase, "probing_quality" | "selecting_quality">;
  abortController: AbortController | null;
  qualityOptions: AdvancedQualityRuntimeOption[];
};

type DownloadTelemetryContext = {
  request: RawDownloadInput;
  plan: ResolvedDownloadPlan | null;
  chosenEngine: EnginePlan["engine"] | null;
  network?: NetworkDiagnosticSnapshot | null;
  diagnosticSummary?: DownloadTerminalDiagnosticSummary;
};

const toDownloadDiagnosticNetwork = (
  snapshot: NetworkDiagnosticSnapshot | null,
): DownloadDiagnosticNetwork | undefined => snapshot
  ? {
      routeKind: snapshot.routeMode,
      source: snapshot.source,
      consumer: snapshot.consumer,
      appliedToEngine: snapshot.appliedToEngine,
      proxyProtocol: snapshot.proxyProtocol,
      failureClassification: snapshot.failureClassification,
    }
  : undefined;

const resolveCanonicalNetworkTarget = (
  request: RawDownloadInput,
  plan: ResolvedDownloadPlan | null,
): string => {
  const primaryEngine = plan?.engines
    .slice()
    .sort((left, right) => right.priority - left.priority)[0];
  return primaryEngine?.sourceUrl ?? request.pageUrl ?? request.url;
};

/**
 * Opaque per-Job application context. The runtime places the already-resolved
 * NetworkRoute, output/config values and diagnostic callbacks in it;
 * DownloadJobService treats it as a generic and never reaches into runtime or
 * Electron state. One object per Job, reused by fallback and auth retry.
 */
type RuntimeDownloadJobContext = {
  traceId: string;
  request: RawDownloadInput;
  network: NetworkRouteResolution;
  outputDir: string;
  outputStem: string;
  config: Record<string, unknown>;
  abortSignal: AbortSignal;
  canonicalNetworkTarget: string;
  reportNetworkProxyFailure?: ElectronDownloadRuntimeOptions["reportNetworkProxyFailure"];
  onNetworkApplication(application: NetworkApplicationOutcome): void | Promise<void>;
  onProgress(payload: DownloadProgress): void | Promise<void>;
};

type TranscodeTaskState = PreparedVideoTranscodeTask & {
  userUrl?: string;
  status: "pending" | "active" | "failed";
  stage: VideoTranscodeStage | null;
  progressPercent: number | null;
  etaSeconds: number | null;
  error: string | null;
  failure: RuntimeFailureDiagnostic | null;
  abortController?: AbortController;
};

const NOOP_LOGGER: RuntimeLogger = {
  log(message: string): void {
    void message;
  },
};

const createBestEffortRuntimeLogger = (logger: RuntimeLogger): RuntimeLogger => ({
  log(message) {
    try {
      logger.log(message);
    } catch {
      // Logging is observability only and must never alter runtime behavior.
    }
  },
});

const queueTaskLabel = (request: RawDownloadInput): string =>
  request.title?.trim()
  || request.pageUrl?.trim()
  || request.videoUrl?.trim()
  || request.url.trim();

const resolveDiagnosticUserUrl = (request: RawDownloadInput): string | undefined => (
  request.pageUrl?.trim()
  || request.url.trim()
  || undefined
);

const toTranscodeFailureDiagnostic = (
  errorMessage: string,
  task: TranscodeTaskState,
): RuntimeFailureDiagnostic => ({
  code: "E_EXECUTION_FAILED",
  rawMessage: errorMessage,
  userUrl: task.userUrl,
  context: {
    sourcePath: task.sourcePath,
    sourceFormat: task.sourceFormat,
    targetFormat: task.targetFormat,
    plan: task.plan,
  },
});

const EARLY_VIDEO_ACTIVITY_PAYLOAD = {
  percent: -1,
  stage: "preparing" as const,
  speed: "Resolving media...",
  eta: "",
};
export const FAILED_TRANSCODE_RETENTION_LIMIT = 20;

const formatElapsedMs = (startedAtMs: number): string => `${Date.now() - startedAtMs}ms`;

const hasYtDlpEngine = (plan: ResolvedDownloadPlan | null): boolean => (
  plan?.engines.some((enginePlan) => enginePlan.engine === "yt-dlp") ?? false
);

const resolveYtdlpTelemetryProfileKey = (
  plan: ResolvedDownloadPlan | null,
): string | null => {
  if (!hasYtDlpEngine(plan)) {
    return null;
  }
  return plan?.intent.siteId === "youtube" ? "youtube" : "default";
};

const resolveDownloadTelemetryProfile = (
  plan: ResolvedDownloadPlan | null,
): DownloadTelemetryProfile | null => {
  if (!hasYtDlpEngine(plan)) {
    return null;
  }

  const qualityPreference = plan?.intent.videoQuality ?? "best";
  const ytdlpProfileKey = resolveYtdlpTelemetryProfileKey(plan);
  const formatProfile = resolveYtdlpFormatProfile(
    qualityPreference,
    true,
    {
      isYouTube: ytdlpProfileKey === "youtube",
      siteId: plan?.intent.siteId,
    },
  );

  return {
    qualityPreference,
    ytdlpProfileKey,
    ytdlpMergeOutputFormat: formatProfile.mergeOutputFormat,
    ytdlpFormatSort: formatProfile.sort,
  };
};

export class AmeowElectronDownloadRuntime implements ElectronDownloadRuntime {
  readonly maxConcurrent: number;

  private readonly options: ElectronDownloadRuntimeOptions;
  private readonly logger: RuntimeLogger;
  private readonly pending: PendingTask[] = [];
  private readonly active = new Map<string, ActiveTask>();
  private readonly advancedQualityTasks = new Map<string, AdvancedQualityTaskState>();
  private readonly advancedQualityDedupe = new Map<string, string>();
  private readonly reservedOutputStems = new Map<string, string>();
  private outputStemReservationLock: Promise<void> = Promise.resolve();
  private readonly pendingTranscodes: TranscodeTaskState[] = [];
  private readonly failedTranscodes: TranscodeTaskState[] = [];
  private activeTranscode: TranscodeTaskState | null = null;
  private transcodePumpScheduled = false;
  private readonly resolver;
  private readonly orchestrator: DownloadOrchestrator<EngineExecutionContextWithRuntime>;
  private readonly engineRegistry: EngineRegistry<EngineExecutionContextWithRuntime>;
  private readonly siteRegistry;
  private readonly telemetrySink: DownloadTelemetrySink;
  private readonly diagnosticSink: DownloadDiagnosticSink;

  constructor(options: ElectronDownloadRuntimeOptions) {
    this.options = options;
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.logger = createBestEffortRuntimeLogger(options.logger ?? NOOP_LOGGER);
    const providers = options.providers ?? loadBuiltinProviders();
    // Concrete engines are registered by the outer Electron composition; the
    // runtime never constructs hidden built-in adapters.
    const engines = options.engines ?? [];
    this.siteRegistry = createSiteRegistry(providers);
    // One EngineRegistry for the whole runtime: the orchestrator executes
    // through it and the advanced-quality probe verifies capability
    // eligibility against the same instance.
    this.engineRegistry = createEngineRegistry(engines);
    this.orchestrator = new DownloadOrchestrator(
      this.siteRegistry,
      this.engineRegistry,
    );
    this.telemetrySink = options.telemetrySink
      ?? createDownloadTelemetrySink(options.environment, this.logger);
    this.diagnosticSink = options.diagnosticSink
      ?? createRuntimeLogDownloadDiagnosticSink(this.logger);
    this.resolver = createRuntimeDependencyResolver(
      inspectRuntimeDependencyStatus(options.environment),
      () => inspectRuntimeDependencyStatus(options.environment),
      async (reason: string) => {
        if (!this.options.bootstrapManagedComponents) {
          return this.resolver.refreshGateState();
        }
        await this.options.bootstrapManagedComponents({
          missingComponents: this.resolver.getGateState().missingComponents as RuntimeManagedComponent[],
          reason,
          environment: this.options.environment,
        });
        const nextState = this.resolver.refreshGateState();
        await this.options.eventSink.emit("runtime-dependency-gate-state", nextState);
        return nextState;
      },
    );
  }

  getRuntimeDependencyStatus() {
    return this.resolver.resolveStatus();
  }

  getRuntimeDependencyGateState() {
    return this.resolver.getGateState();
  }

  refreshRuntimeDependencyGateState() {
    const nextState = this.resolver.refreshGateState();
    void this.options.eventSink.emit("runtime-dependency-gate-state", nextState);
    return nextState;
  }

  async startRuntimeDependencyBootstrap(reason = "electron_runtime") {
    const nextState = await this.resolver.startBootstrap(reason);
    await this.options.eventSink.emit("runtime-dependency-gate-state", nextState);
    return nextState;
  }

  getQueueState(): VideoQueueStatePayload {
    const activeCount = this.active.size + this.advancedQualityTasks.size;
    const pendingCount = this.pending.length;
    return {
      activeCount,
      pendingCount,
      totalCount: activeCount + pendingCount,
      maxConcurrent: this.maxConcurrent,
    };
  }

  getQueueDetail(): VideoQueueDetailPayload {
    return {
      tasks: [
        ...Array.from(this.active.values()).map((task) => ({
          traceId: task.traceId,
          label: task.label,
          status: "active" as const,
          phase: "downloading" as const,
        })),
        ...Array.from(this.advancedQualityTasks.values()).map((task) => ({
          traceId: task.traceId,
          label: task.label,
          videoTitle: task.videoTitle,
          status: "active" as const,
          phase: task.phase,
          qualityOptions: task.phase === "selecting_quality"
            ? task.qualityOptions.map((option) => ({
                id: option.id,
                label: option.label,
                tags: option.tags,
                postProcessPlan: option.postProcessPlan,
              }))
            : undefined,
        })),
        ...this.pending.map((task) => ({
          traceId: task.traceId,
          label: task.label,
          status: "pending" as const,
        })),
      ],
    };
  }

  /**
   * Application API entry: canonical command -> runtime input. Runtime-owned
   * values (cookies, advanced-quality selectors) are added after this mapping
   * by the advanced-quality continuation path.
   */
  async queueDownload(
    command: QueueDownloadCommand,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck> {
    return this.queueVideoDownload(toRawDownloadInput(command), cause);
  }

  /**
   * Application API entry for pasted URLs: optional injected extension
   * selection-resolution port with direct-queue fallback. Eligibility and
   * resolution are transport-injected ports; fallback policy lives here.
   */
  async queuePastedDownload(
    command: QueueDownloadCommand,
    ports: PastedSelectionPorts,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck> {
    const siteHint = command.siteHint;
    if (!ports.isEligible(siteHint)) {
      return this.queueDownload(command, cause);
    }

    try {
      const resolved = await ports.resolveSelection({
        url: command.url,
        pageUrl: command.pageUrl ?? command.url,
        siteHint,
      });
      if (resolved) {
        this.logger.log(
          `>>> [PastedVideo] Using extension-assisted selection payload: ${JSON.stringify({
            url: toSafeDiagnosticUrl(resolved.url) ?? null,
            pageUrl: toSafeDiagnosticUrl(resolved.pageUrl) ?? null,
            videoUrl: toSafeDiagnosticUrl(resolved.videoUrl) ?? null,
            siteHint: resolved.siteHint ?? siteHint,
            videoCandidatesCount: resolved.videoCandidates?.length ?? 0,
            selectionScope: resolved.selectionScope ?? null,
            videoQuality: resolved.videoQuality ?? null,
          })}`,
        );
        // Config/preference quality precedence is preserved: the decoded
        // command quality wins over the extension-resolved quality.
        return this.queueDownload({
          ...command,
          ...resolved,
          videoQuality: command.videoQuality ?? resolved.videoQuality,
        }, cause);
      }
      this.logger.log(
        `>>> [PastedVideo] Extension-assisted selection was unavailable, falling back to direct queue: ${
          JSON.stringify({ siteHint })
        }`,
      );
    } catch (error) {
      this.logger.log(
        `>>> [PastedVideo] Extension-assisted selection failed, falling back to direct queue: ${
          summarizeError(error)
        }`,
      );
    }

    return this.queueDownload(command, cause);
  }

  async queueVideoDownload(
    request: RawDownloadInput,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck> {
    if (request.advancedQualityRequest === true) {
      return await this.queueAdvancedQualityDownload(request, cause);
    }

    const traceId = nextDownloadTraceId();
    await this.enqueuePendingDownloadTask(traceId, request, traceId, cause);
    return {
      accepted: true,
      traceId,
    };
  }

  async selectAdvancedQualityOption(traceId: string, optionId: string): Promise<boolean> {
    const task = this.advancedQualityTasks.get(traceId);
    if (!task || task.phase !== "selecting_quality") {
      return false;
    }

    const selectedOption = task.qualityOptions.find((option) => option.id === optionId);
    if (!selectedOption) {
      return false;
    }

    this.removeAdvancedQualityTask(traceId);
    await this.enqueuePendingDownloadTask(traceId, {
      ...task.request,
      advancedQualityRequest: false,
      advancedQualitySelector: selectedOption.selector,
      advancedQualityLabel: selectedOption.label,
    });
    return true;
  }

  async cancelDownload(traceId: string): Promise<boolean> {
    const advancedTask = this.advancedQualityTasks.get(traceId);
    if (advancedTask) {
      advancedTask.abortController?.abort();
      this.removeAdvancedQualityTask(traceId);
      await this.emitQueueState();
      return true;
    }

    const pendingIndex = this.pending.findIndex((task) => task.traceId === traceId);
    if (pendingIndex >= 0) {
      const [cancelledTask] = this.pending.splice(pendingIndex, 1);
      const cancelledPlan = this.siteRegistry.resolve(cancelledTask.request);
      await this.emitQueueState();
      const cancellationError = new DownloadRuntimeError(
        "E_ABORTED",
        "Download cancelled",
        {
          classification: "cancelled",
        },
      );
      const diagnosticSummary = createDownloadDiagnosticRecorder({
        traceId,
        sink: this.diagnosticSink,
      }).recordTerminal({
        outcome: "cancelled",
        errorCode: cancellationError.code,
        classification: cancellationError.classification,
        category: resolveDownloadDiagnosticCategory(cancellationError),
      });
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        result: {
          traceId,
          success: false,
          error: "Download cancelled",
        },
        failure: cancellationError,
        userUrl: resolveDiagnosticUserUrl(cancelledTask.request),
        presentationMessage: "Download cancelled",
        diagnosticSummary,
      } satisfies DownloadTerminalOutcome);
      this.recordDownloadTelemetry(
        traceId,
        {
          request: cancelledTask.request,
          plan: cancelledPlan,
          chosenEngine: null,
          diagnosticSummary,
        },
        cancellationError,
      );
      this.scheduleTranscodePump();
      return true;
    }

    const activeTask = this.active.get(traceId);
    if (!activeTask) {
      return false;
    }
    activeTask.abortController.abort();
    return true;
  }

  private async enqueuePendingDownloadTask(
    traceId: string,
    request: RawDownloadInput,
    acceptedTraceId?: string,
    cause?: QueueDownloadPresentationCause,
  ): Promise<void> {
    this.pending.push({
      traceId,
      label: queueTaskLabel(request),
      request,
    });
    await this.emitQueueState(acceptedTraceId, cause);
    void this.pumpQueue();
  }

  private buildAdvancedQualityDedupeKey(request: RawDownloadInput): string {
    return [
      request.siteHint?.trim() || "generic",
      request.pageUrl?.trim() || request.url.trim(),
      typeof request.clipStartSec === "number" ? request.clipStartSec : "",
      typeof request.clipEndSec === "number" ? request.clipEndSec : "",
    ].join("|");
  }

  private removeAdvancedQualityTask(traceId: string): AdvancedQualityTaskState | null {
    const task = this.advancedQualityTasks.get(traceId) ?? null;
    if (!task) {
      return null;
    }
    this.advancedQualityTasks.delete(traceId);
    const existingTraceId = this.advancedQualityDedupe.get(task.dedupeKey);
    if (existingTraceId === traceId) {
      this.advancedQualityDedupe.delete(task.dedupeKey);
    }
    return task;
  }

  private async queueAdvancedQualityDownload(
    request: RawDownloadInput,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck> {
    const dedupeKey = this.buildAdvancedQualityDedupeKey(request);
    const existingTraceId = this.advancedQualityDedupe.get(dedupeKey);
    if (existingTraceId && this.advancedQualityTasks.has(existingTraceId)) {
      return {
        accepted: true,
        traceId: existingTraceId,
      };
    }

    const traceId = nextDownloadTraceId();
    const task: AdvancedQualityTaskState = {
      traceId,
      label: queueTaskLabel(request),
      request,
      dedupeKey,
      phase: "probing_quality",
      abortController: new AbortController(),
      qualityOptions: [],
    };
    this.advancedQualityTasks.set(traceId, task);
    this.advancedQualityDedupe.set(dedupeKey, traceId);
    await this.emitQueueState(traceId, cause);
    void this.probeAdvancedQualityTask(traceId);
    return {
      accepted: true,
      traceId,
    };
  }

  private async probeAdvancedQualityTask(traceId: string): Promise<void> {
    const task = this.advancedQualityTasks.get(traceId);
    if (!task || !task.abortController) {
      return;
    }

    try {
      const { options, videoTitle } = await this.runAdvancedQualityProbeForTask(task);
      const latestTask = this.advancedQualityTasks.get(traceId);
      if (!latestTask) {
        return;
      }
      latestTask.phase = "selecting_quality";
      latestTask.abortController = null;
      latestTask.qualityOptions = options;
      latestTask.videoTitle = videoTitle;
      await this.emitQueueState();
    } catch (error) {
      const latestTask = this.advancedQualityTasks.get(traceId);
      const aborted = latestTask?.abortController?.signal.aborted === true
        || task.abortController.signal.aborted;
      this.removeAdvancedQualityTask(traceId);
      await this.emitQueueState();
      if (aborted) {
        return;
      }
      this.logger.log(`>>> [ElectronRuntime] advanced quality probe failed: ${summarizeError(error)}`);
      // Preserve typed rejection (E_ENGINE_NOT_FOUND / E_ENGINE_REJECTED_INTENT)
      // from the verification gate; only genuine probe crashes are wrapped.
      const probeFailure = error instanceof DownloadRuntimeError
        ? error
        : new DownloadRuntimeError("E_EXECUTION_FAILED", summarizeError(error), { cause: error });
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        result: {
          traceId,
          success: false,
          error: "更多画质探测失败",
        },
        failure: probeFailure,
        userUrl: resolveDiagnosticUserUrl(task.request),
        presentationMessage: "更多画质探测失败",
      } satisfies DownloadTerminalOutcome);
    }
  }

  private async runAdvancedQualityProbeForTask(
    task: AdvancedQualityTaskState,
  ): Promise<AdvancedQualityProbeResult> {
    const context = await this.buildAdvancedQualityProbeContext(task);
    // Explicit composition at the probe boundary: static binary paths are
    // supplied by the runtime, never smuggled through the execution contract.
    // The probe is a yt-dlp-only Infrastructure feature (no probe port).
    try {
      return await runYtDlpAdvancedQualityProbe({
        ...context,
        binaries: resolveYtDlpRuntimeDependencies(this.options.environment),
      });
    } finally {
      await context.runtimeSetLease?.release();
    }
  }

  private async acquireRuntimeSetLease(
    consumer: RuntimeSetConsumer,
    reason: string,
  ) {
    if (this.options.acquireRuntimeSetLease) {
      return await this.options.acquireRuntimeSetLease(consumer, reason);
    }
    if (consumer !== "media-tools" && this.options.ensureEngineRuntimeReady) {
      await this.options.ensureEngineRuntimeReady(consumer, reason);
    }
    return undefined;
  }

  /**
   * Creates one stable DownloadExecutionContext. The network route is
   * resolved once for the canonical entry target and the same resolution is
   * reused across engine retry, engine fallback, and auth recovery. A future
   * refresh must be an explicit rebuild with a new identity; P0 exposes no
   * implicit refresh path.
   */
  private createDownloadExecutionContext(
    traceId: string,
    targetUrl: string,
    providerId: string | null,
    engineId: EnginePlan["engine"] | undefined,
  ): DownloadExecutionContext {
    if (!engineId) {
      // Fail closed instead of defaulting to yt-dlp for an empty candidate
      // list; plans always carry at least one candidate in practice.
      throw new DownloadRuntimeError(
        "E_ENGINE_NOT_FOUND",
        "No engine candidates in the resolved download plan",
        {
          classification: "terminal_for_site",
        },
      );
    }
    const consumer = this.options.resolveNetworkConsumer?.(engineId)
      ?? resolveEngineNetworkConsumer(engineId);
    const network = this.options.resolveNetworkRoute
      ? this.options.resolveNetworkRoute({
          targetUrl,
          providerId,
          engineId,
        }).catch((error) => {
          this.logger.log(
            `>>> [ElectronRuntime] network route resolution failed for ${traceId}: ${sanitizeDiagnosticText(summarizeError(error))}`,
          );
          return buildResolutionFailureFallbackRoute(targetUrl, consumer, error);
        })
      : Promise.resolve(buildDirectRouteResolution(targetUrl, consumer, {
          source: "direct",
          reason: "no_proxy_source",
        }));

    return {
      identity: `download-ctx-${traceId}`,
      createdAtMs: Date.now(),
      network,
    };
  }

  private async buildAdvancedQualityProbeContext(
    task: AdvancedQualityTaskState,
  ): Promise<EngineExecutionContextWithRuntime> {
    const abortController = task.abortController;
    if (!abortController) {
      throw new DownloadRuntimeError(
        "E_ABORTED",
        "Advanced quality probe cancelled",
        {
          classification: "cancelled",
        },
      );
    }
    const config = parseJsonObject(await this.options.configStore.readConfigString());
    const resolvedOutputDir = resolveOutputDir(this.options.environment, config);
    const plan = this.siteRegistry.resolve(task.request);
    if (!plan) {
      throw new DownloadRuntimeError(
        "E_NO_PROVIDER_MATCH",
        "No site provider matched the advanced quality request",
      );
    }
    // The Site declares the need through the plan requirement; the runtime
    // never re-decides Site support from an allowlist.
    if (plan.requirements?.advancedQuality !== true) {
      throw new DownloadRuntimeError(
        "E_ENGINE_REJECTED_INTENT",
        "Advanced quality probing requires a plan that declares the advanced-quality requirement",
        {
          context: {
            traceId: task.traceId,
            providerId: plan.providerId,
          },
        },
      );
    }

    const enginePlan = plan.engines
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .find((candidate) => candidate.engine === "yt-dlp");
    if (!enginePlan) {
      throw new DownloadRuntimeError(
        "E_ENGINE_NOT_FOUND",
        "Advanced quality probing is only available for yt-dlp-backed downloads",
        {
          context: {
            traceId: task.traceId,
            providerId: plan.providerId,
          },
        },
      );
    }

    if (!this.engineRegistry.get("yt-dlp")) {
      throw new DownloadRuntimeError(
        "E_ENGINE_NOT_FOUND",
        "Advanced quality probing requires a registered yt-dlp engine",
        {
          context: {
            traceId: task.traceId,
            providerId: plan.providerId,
          },
        },
      );
    }

    // Capability eligibility against the same registry the orchestrator uses;
    // an unregistered or non-capable yt-dlp is rejected before any probe.
    if (!this.engineRegistry.isEligible("yt-dlp", plan.requirements)) {
      throw new DownloadRuntimeError(
        "E_ENGINE_REJECTED_INTENT",
        "Engine yt-dlp does not satisfy the plan capability requirements",
        {
          context: {
            traceId: task.traceId,
            providerId: plan.providerId,
            requirements: plan.requirements,
          },
        },
      );
    }

    if (this.options.refreshSiteSessionBeforeAdvancedQualityProbe) {
      await this.options.refreshSiteSessionBeforeAdvancedQualityProbe({
        traceId: task.traceId,
        siteId: plan.intent.siteId,
        pageUrl: task.request.pageUrl,
        url: task.request.url,
      }).catch((error) => {
        this.logger.log(
          `>>> [ElectronRuntime] advanced quality site-session refresh failed: ${summarizeError(error)}`,
        );
      });
    }

    const proxyTargetUrl = enginePlan.sourceUrl ?? task.request.pageUrl ?? task.request.url;
    // Probe-scoped execution context: one lazy route resolution for the
    // probe lifecycle; reuses the shared resolver but never a Job context.
    const executionContext = this.createDownloadExecutionContext(
      task.traceId,
      proxyTargetUrl,
      plan.providerId,
      enginePlan.engine,
    );
    const network = await executionContext.network;

    const reason = `runtime_probe_${task.traceId}_yt-dlp`;
    const runtimeSetLease = await this.acquireRuntimeSetLease("yt-dlp", reason);
    const context: EngineExecutionContextWithRuntime = {
      traceId: task.traceId,
      plan,
      enginePlan,
      intent: plan.intent,
      outputDir: resolvedOutputDir,
      outputStem: buildOutputStem(
        task.traceId,
        task.request.pageUrl ?? task.request.url,
        config,
        task.request.title,
        task.request.siteHint,
      ),
      config,
      cookies: task.request.cookies,
      network,
      abortSignal: abortController.signal,
      reportNetworkProxyFailure: this.options.reportNetworkProxyFailure
        ? (error) => this.options.reportNetworkProxyFailure?.({
            targetUrl: proxyTargetUrl,
            providerId: plan.providerId,
            engineId: enginePlan.engine,
            error,
          })
        : undefined,
      onProgress: async () => undefined,
      runtimeSetLease,
    };

    try {
      return this.options.buildExecutionContext
        ? await this.options.buildExecutionContext(context, task.request)
        : context;
    } catch (error) {
      await runtimeSetLease?.release();
      throw error;
    }
  }

  async cancelTranscode(traceId: string): Promise<boolean> {
    const pendingIndex = this.pendingTranscodes.findIndex((task) => task.traceId === traceId);
    if (pendingIndex >= 0) {
      const [removed] = this.pendingTranscodes.splice(pendingIndex, 1);
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit("video-transcode-removed", this.toTranscodeTaskPayload(removed));
      return true;
    }

    if (this.activeTranscode?.traceId !== traceId || !this.activeTranscode.abortController) {
      return false;
    }
    this.activeTranscode.abortController.abort();
    return true;
  }

  async retryTranscode(traceId: string): Promise<boolean> {
    const failedIndex = this.failedTranscodes.findIndex((task) => task.traceId === traceId);
    if (failedIndex < 0) {
      return false;
    }

    const [failedTask] = this.failedTranscodes.splice(failedIndex, 1);
    const retriedTask: TranscodeTaskState = {
      ...failedTask,
      status: "pending",
      stage: null,
      progressPercent: null,
      etaSeconds: null,
      error: null,
      failure: null,
      abortController: undefined,
    };
    this.pendingTranscodes.push(retriedTask);
    await this.emitTranscodeQueueState();
    await this.options.eventSink.emit("video-transcode-retried", this.toTranscodeTaskPayload(retriedTask));
    this.scheduleTranscodePump();
    return true;
  }

  async removeTranscode(traceId: string): Promise<boolean> {
    const failedIndex = this.failedTranscodes.findIndex((task) => task.traceId === traceId);
    if (failedIndex < 0) {
      return false;
    }

    const [removed] = this.failedTranscodes.splice(failedIndex, 1);
    await this.emitTranscodeQueueState();
    await this.options.eventSink.emit("video-transcode-removed", this.toTranscodeTaskPayload(removed));
    return true;
  }

  private async emitQueueState(
    acceptedTraceId?: string,
    cause?: QueueDownloadPresentationCause,
  ): Promise<void> {
    const state = this.getQueueState();
    const detail = this.getQueueDetail();
    await this.options.eventSink.emit("video-queue-count", state);
    await this.options.eventSink.emit(
      "video-queue-detail",
      acceptedTraceId === undefined
        ? detail
        : {
            ...detail,
            acceptedTraceId,
            ...(cause?.intakeOrigin === undefined
              ? {}
              : { acceptedIntakeOrigin: cause.intakeOrigin }),
          },
    );
  }

  getTranscodeQueueState(): VideoTranscodeQueueStatePayload {
    const activeCount = this.activeTranscode ? 1 : 0;
    const pendingCount = this.pendingTranscodes.length;
    const failedCount = this.failedTranscodes.length;
    return {
      activeCount,
      pendingCount,
      failedCount,
      totalCount: activeCount + pendingCount + failedCount,
      maxConcurrent: 1,
    };
  }

  getTranscodeQueueDetail(): VideoTranscodeQueueDetailPayload {
    return {
      tasks: [
        ...(this.activeTranscode ? [this.toTranscodeTaskPayload(this.activeTranscode)] : []),
        ...this.pendingTranscodes.map((task) => this.toTranscodeTaskPayload(task)),
        ...this.failedTranscodes.map((task) => this.toTranscodeTaskPayload(task)),
      ],
    };
  }

  private async emitTranscodeQueueState(): Promise<void> {
    await this.options.eventSink.emit("video-transcode-queue-count", this.getTranscodeQueueState());
    await this.options.eventSink.emit("video-transcode-queue-detail", this.getTranscodeQueueDetail());
  }

  private retainNewestFailedTranscodes(): void {
    if (this.failedTranscodes.length <= FAILED_TRANSCODE_RETENTION_LIMIT) {
      return;
    }
    this.failedTranscodes.splice(
      0,
      this.failedTranscodes.length - FAILED_TRANSCODE_RETENTION_LIMIT,
    );
  }

  private toTranscodeTaskPayload(task: TranscodeTaskState): VideoTranscodeTaskPayload {
    return {
      traceId: task.traceId,
      label: task.label,
      status: task.status,
      stage: task.stage,
      progressPercent: task.progressPercent,
      etaSeconds: task.etaSeconds,
      sourcePath: task.sourcePath,
      sourceFormat: task.sourceFormat,
      targetFormat: task.targetFormat,
      error: task.error,
      failure: task.failure,
    };
  }

  private toTranscodeCompletePayload(task: TranscodeTaskState, filePath: string): VideoTranscodeCompletePayload {
    return {
      traceId: task.traceId,
      label: task.label,
      sourcePath: task.sourcePath,
      filePath,
      sourceFormat: task.sourceFormat,
      targetFormat: task.targetFormat,
    };
  }

  private hasBlockingDownloads(): boolean {
    return this.active.size > 0 || this.pending.length > 0 || this.advancedQualityTasks.size > 0;
  }

  private scheduleTranscodePump(): void {
    if (this.transcodePumpScheduled) {
      return;
    }
    this.transcodePumpScheduled = true;
    void this.pumpTranscodeQueue();
  }

  private async pumpTranscodeQueue(): Promise<void> {
    try {
      if (this.activeTranscode || this.pendingTranscodes.length === 0 || this.hasBlockingDownloads()) {
        return;
      }

      const nextTask = this.pendingTranscodes.shift();
      if (!nextTask) {
        return;
      }

      this.activeTranscode = {
        ...nextTask,
        status: "active",
        stage: "analyzing",
        progressPercent: null,
        etaSeconds: null,
        error: null,
        failure: null,
        abortController: new AbortController(),
      };
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit(
        "video-transcode-progress",
        this.toTranscodeTaskPayload(this.activeTranscode),
      );
      await this.runActiveTranscode();
    } finally {
      this.transcodePumpScheduled = false;
      if (!this.activeTranscode && this.pendingTranscodes.length > 0 && !this.hasBlockingDownloads()) {
        this.scheduleTranscodePump();
      }
    }
  }

  private async enqueuePreparedTranscodeTask(task: PreparedVideoTranscodeTask, userUrl?: string): Promise<void> {
    const alreadyPresent = this.pendingTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.failedTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.activeTranscode?.traceId === task.traceId;
    if (alreadyPresent) {
      return;
    }

    const pendingTask: TranscodeTaskState = {
      ...task,
      userUrl,
      status: "pending",
      stage: null,
      progressPercent: null,
      etaSeconds: null,
      error: null,
      failure: null,
    };
    this.pendingTranscodes.push(pendingTask);
    await this.emitTranscodeQueueState();
    await this.options.eventSink.emit("video-transcode-queued", this.toTranscodeTaskPayload(pendingTask));
    this.scheduleTranscodePump();
  }

  private async handleCompletedVideoSource(
    traceId: string,
    label: string,
    sourcePath: string,
    telemetry?: DownloadTelemetryContext,
  ): Promise<void> {
    let compatibility: VideoCompatibilityAnalysis | null = null;
    let runtimeSetLease: RuntimeSetLease | undefined;
    try {
      runtimeSetLease = await this.acquireRuntimeSetLease(
        "media-tools",
        `runtime_probe_media_${traceId}`,
      );
      const binaries = resolveSharedMediaRuntimeTools(this.options.environment);
      const prepared = await prepareVideoTranscodeTaskFromDownload({
        traceId,
        label,
        sourcePath,
        ffprobePath: binaries.ffprobe,
        ffmpegPath: binaries.ffmpeg,
        onCompatibilityAnalysis(analysis) {
          compatibility = analysis;
        },
      });
      if (!prepared) {
        return;
      }
      await this.enqueuePreparedTranscodeTask(
        prepared,
        telemetry?.request ? resolveDiagnosticUserUrl(telemetry.request) : undefined,
      );
    } catch (error) {
      this.logger.log(
        `>>> [ElectronRuntime] transcode follow-up for ${traceId} failed: ${summarizeError(error)}`,
      );
    } finally {
      await runtimeSetLease?.release();
      if (telemetry) {
        this.recordDownloadTelemetry(
          traceId,
          telemetry,
          null,
          compatibility,
        );
      }
    }
  }

  private async runActiveTranscode(): Promise<void> {
    const activeTask = this.activeTranscode;
    if (!activeTask || !activeTask.abortController) {
      return;
    }

    try {
      const runtimeSetLease = await this.acquireRuntimeSetLease(
        "media-tools",
        `runtime_transcode_${activeTask.traceId}`,
      );
      const result = await runPreparedVideoTranscodeTask(activeTask, {
        ffmpegPath: resolveSharedMediaRuntimeTools(this.options.environment).ffmpeg,
        signal: activeTask.abortController.signal,
        onProgress: async (progress) => {
          if (!this.activeTranscode || this.activeTranscode.traceId !== activeTask.traceId) {
            return;
          }

          this.activeTranscode = {
            ...this.activeTranscode,
            stage: progress.stage,
            progressPercent: progress.progressPercent,
            etaSeconds: progress.etaSeconds,
          };
          await this.emitTranscodeQueueState();
          await this.options.eventSink.emit(
            "video-transcode-progress",
            this.toTranscodeTaskPayload(this.activeTranscode),
          );
        },
      }).finally(() => runtimeSetLease?.release());

      const completedTask = this.activeTranscode;
      if (!completedTask) {
        return;
      }
      this.activeTranscode = null;
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit(
        "video-transcode-complete",
        this.toTranscodeCompletePayload(completedTask, result.filePath),
      );
    } catch (error) {
      const failedTask = this.activeTranscode;
      if (!failedTask) {
        return;
      }

      this.activeTranscode = null;
      if (failedTask.abortController?.signal.aborted) {
        await this.emitTranscodeQueueState();
        await this.options.eventSink.emit("video-transcode-removed", this.toTranscodeTaskPayload(failedTask));
        return;
      }

      const errorMessage = summarizeError(error);
      const failure = toTranscodeFailureDiagnostic(errorMessage, failedTask);
      const nextFailedTask: TranscodeTaskState = {
        ...failedTask,
        status: "failed",
        stage: "failed",
        progressPercent: null,
        etaSeconds: null,
        error: errorMessage,
        failure,
        abortController: undefined,
      };
      this.failedTranscodes.push(nextFailedTask);
      this.retainNewestFailedTranscodes();
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit("video-transcode-failed", this.toTranscodeTaskPayload(nextFailedTask));
    }
  }

  private async reserveOutputStem(
    traceId: string,
    outputDir: string,
    preferredOutputStem: string,
    config: Record<string, unknown>,
  ): Promise<string> {
    const previousLock = this.outputStemReservationLock;
    let releaseLock = (): void => undefined;
    this.outputStemReservationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    try {
      if (resolveRenameEnabled(config)) {
        const outputStem = await allocateRenameStem(outputDir, config);
        this.reservedOutputStems.set(traceId, outputStem);
        return outputStem;
      }

      const outputStem = await resolveAvailableOutputStem(
        outputDir,
        preferredOutputStem,
        this.reservedOutputStems.values(),
      );
      this.reservedOutputStems.set(traceId, outputStem);
      return outputStem;
    } finally {
      releaseLock();
    }
  }

  private async applyResolvedTitleToCompletedDownload({
    traceId,
    outputDir,
    outputStem,
    filePath,
    title,
    request,
    config,
  }: {
    traceId: string;
    outputDir: string;
    outputStem: string;
    filePath: string;
    title: string;
    request: RawDownloadInput;
    config: Record<string, unknown>;
  }): Promise<{ filePath: string; title: string } | null> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return null;
    }

    const preferredTitleStem = buildOutputStem(
      traceId,
      request.pageUrl ?? request.url,
      config,
      normalizedTitle,
      request.siteHint,
    );
    if (preferredTitleStem === outputStem) {
      return {
        filePath,
        title: normalizedTitle,
      };
    }

    const renamedOutputStem = await resolveAvailableOutputStem(
      outputDir,
      preferredTitleStem,
      Array.from(this.reservedOutputStems.values()).filter((stem) => stem !== outputStem),
    );
    const renamedFilePath = path.join(
      path.dirname(filePath),
      `${renamedOutputStem}${path.extname(filePath)}`,
    );
    if (renamedFilePath !== filePath) {
      await fs.rename(filePath, renamedFilePath);
    }
    this.reservedOutputStems.set(traceId, renamedOutputStem);
    return {
      filePath: renamedFilePath,
      title: normalizedTitle,
    };
  }

  /**
   * Applies a resolved title rename to a completed download, updates the
   * queue label/state, and returns the settled result (unchanged when no
   * rename applies). Shared by the yt-dlp and gallery-dl settlement branches.
   */
  private async settleTitleRename({
    traceId,
    outputDir,
    outputStem,
    result,
    title,
    activeTask,
    config,
  }: {
    traceId: string;
    outputDir: string;
    outputStem: string;
    result: DownloadResult;
    title: string;
    activeTask: ActiveTask;
    config: Record<string, unknown>;
  }): Promise<DownloadResult> {
    if (!result.filePath) {
      return result;
    }
    const renamed = await this.applyResolvedTitleToCompletedDownload({
      traceId,
      outputDir,
      outputStem,
      filePath: result.filePath,
      title,
      request: activeTask.request,
      config,
    });
    if (!renamed) {
      return result;
    }
    activeTask.request.title = renamed.title;
    activeTask.label = queueTaskLabel(activeTask.request);
    await this.emitQueueState();
    return {
      ...result,
      filePath: renamed.filePath,
      title: renamed.title,
    };
  }

  private async pumpQueue(): Promise<void> {
    while (this.active.size < this.maxConcurrent && this.pending.length > 0) {
      const nextTask = this.pending.shift();
      if (!nextTask) {
        return;
      }
      const abortController = new AbortController();
      this.active.set(nextTask.traceId, {
        ...nextTask,
        abortController,
      });
      await this.emitQueueState();
      void this.runTask(nextTask.traceId);
    }
  }

  private async runTask(traceId: string): Promise<void> {
    const activeTask = this.active.get(traceId);
    if (!activeTask) {
      return;
    }
    const taskStartedAtMs = Date.now();
    this.logger.log(`>>> [ElectronRuntimeTiming] task start: ${JSON.stringify({
      traceId,
      url: toSafeDiagnosticUrl(activeTask.request.url) ?? null,
      pageUrl: toSafeDiagnosticUrl(activeTask.request.pageUrl) ?? null,
      siteHint: activeTask.request.siteHint ?? null,
      quality: activeTask.request.ytdlpQuality ?? "best",
    })}`);

    let outputDir: string | null = null;
    let telemetryPlan: ResolvedDownloadPlan | null = null;
    let executedEngineId: EnginePlan["engine"] | null = null;
    // Diagnostics state updated by the per-attempt Job callbacks (closures)
    // and read by the catch/terminal block. A property holder avoids the
    // `let`-closure narrowing trap: closure assignments would otherwise leave
    // the initializer's `null` narrowing in force at later reads.
    const networkDiagnostics: { snapshot: NetworkDiagnosticSnapshot | null } = { snapshot: null };
    // The single terminal protocol-neutral outcome: success is the application
    // outcome, failure is the typed error. Exactly one is produced and emitted
    // per Job; the outer adapter maps it to the protocol payload and no other
    // branch decides the terminal.
    let terminalOutcome: DownloadTerminalOutcome;
    let terminalRuntimeError: DownloadRuntimeError | null = null;
    let terminalDiagnosticSummary: DownloadTerminalDiagnosticSummary | undefined;
    try {
      const config = parseJsonObject(await this.options.configStore.readConfigString());
      const resolvedOutputDir = resolveOutputDir(this.options.environment, config);
      outputDir = resolvedOutputDir;
      await this.options.eventSink.emit("video-download-progress", {
        traceId,
        ...EARLY_VIDEO_ACTIVITY_PAYLOAD,
      } satisfies DownloadProgress);
      // The ordinary Job lifecycle is delegated to the Electron-neutral
      // application service: prepare exactly once, one opaque Job context,
      // per-attempt contexts, at-most-one auth recovery and the single
      // terminal outcome. Route resolution and output reservation stay here
      // in the outer adapter (createJobContext) and happen once per Job.
      const execution = await new DownloadJobService<
        RuntimeDownloadJobContext,
        EngineExecutionContextWithRuntime
      >({
        orchestrator: this.orchestrator,
        onPrepared: (prepared) => {
          telemetryPlan = prepared.plan;
          this.logger.log(`>>> [ElectronRuntimeTiming] task pre-engine complete: ${JSON.stringify({
            traceId,
            elapsedMs: formatElapsedMs(taskStartedAtMs),
            providerId: prepared.plan.providerId,
            engineCandidates: prepared.plan.engines.map((plan) => plan.engine),
          })}`);
        },
        refreshSiteSessionBeforeDownload: async (prepared) => {
          if (this.options.refreshSiteSessionBeforeDownload) {
            await this.options.refreshSiteSessionBeforeDownload({
              traceId,
              siteId: prepared.plan.intent.siteId,
              pageUrl: activeTask.request.pageUrl,
              url: activeTask.request.url,
            });
          }
        },
        createJobContext: async (prepared) => {
          const preferredOutputStem = buildOutputStem(
            traceId,
            activeTask.request.pageUrl ?? activeTask.request.url,
            config,
            activeTask.request.title,
            activeTask.request.siteHint,
          );
          const outputStem = await this.reserveOutputStem(
            traceId,
            resolvedOutputDir,
            preferredOutputStem,
            config,
          );
          // One stable network route per Job: resolved here, then reused by
          // every engine attempt, fallback and auth retry through the opaque
          // Job context. A future refresh is an explicit rebuild with a new
          // identity; P0 exposes no implicit refresh path.
          const canonicalNetworkTarget = resolveCanonicalNetworkTarget(
            activeTask.request,
            prepared.plan,
          );
          const executionContext = this.createDownloadExecutionContext(
            traceId,
            canonicalNetworkTarget,
            prepared.plan.providerId,
            prepared.plan.engines.slice().sort((left, right) => right.priority - left.priority)[0]?.engine,
          );
          const network = await executionContext.network;
          const baseNetworkSnapshot = toNetworkDiagnosticSnapshot(network);
          networkDiagnostics.snapshot = baseNetworkSnapshot;
          return {
            traceId,
            request: activeTask.request,
            network,
            outputDir: resolvedOutputDir,
            outputStem,
            config,
            abortSignal: activeTask.abortController.signal,
            canonicalNetworkTarget,
            reportNetworkProxyFailure: this.options.reportNetworkProxyFailure,
            // Per-attempt application outcome: the engine that actually
            // applied (or rejected) the stable route wins the diagnostic;
            // never re-resolves.
            onNetworkApplication(application: NetworkApplicationOutcome): void {
              networkDiagnostics.snapshot = {
                ...baseNetworkSnapshot,
                engine: application.engine,
                appliedToEngine: application.appliedToEngine,
                reason: application.reason,
                failureClassification: application.failureClassification,
              };
            },
            onProgress: async (payload: DownloadProgress) => {
              await this.options.eventSink.emit("video-download-progress", payload);
            },
          };
        },
        buildAttemptContext: async (
          jobContext,
          plan: ResolvedDownloadPlan,
          enginePlan: EnginePlan,
        ) => {
          executedEngineId = enginePlan.engine;
          const reason = `runtime_execute_${traceId}_${enginePlan.engine}`;
          const runtimeSetLease = await this.acquireRuntimeSetLease(
            enginePlan.engine === "gallery-dl" ? "gallery-dl" : "yt-dlp",
            reason,
          );
          this.logger.log(`>>> [ElectronRuntime] engine dispatch: ${JSON.stringify({
            traceId,
            providerId: plan.providerId,
            engine: enginePlan.engine,
            source: toSafeDiagnosticUrl(enginePlan.sourceUrl) ?? null,
            reason: enginePlan.reason,
            when: enginePlan.when,
          })}`);
          const context: EngineExecutionContextWithRuntime = {
            traceId: jobContext.traceId,
            plan,
            enginePlan,
            intent: plan.intent,
            outputDir: jobContext.outputDir,
            outputStem: jobContext.outputStem,
            config: jobContext.config,
            // Attempt auth material and engine-specific execution data come
            // from the raw request, not the Domain intent; the outer
            // composition may enrich them per attempt.
            cookies: jobContext.request.cookies,
            advancedQualitySelector: jobContext.request.advancedQualitySelector,
            advancedQualityLabel: jobContext.request.advancedQualityLabel,
            network: jobContext.network,
            abortSignal: jobContext.abortSignal,
            onNetworkApplication: jobContext.onNetworkApplication,
            reportNetworkProxyFailure: jobContext.reportNetworkProxyFailure
              ? (error) => jobContext.reportNetworkProxyFailure?.({
                  targetUrl: jobContext.canonicalNetworkTarget,
                  providerId: plan.providerId,
                  engineId: enginePlan.engine,
                  error,
                })
              : undefined,
            onProgress: jobContext.onProgress,
            runtimeSetLease,
          };
          try {
            return this.options.buildExecutionContext
              ? await this.options.buildExecutionContext(context, jobContext.request)
              : context;
          } catch (error) {
            await runtimeSetLease?.release();
            throw error;
          }
        },
        handleAuthRequiredFailure: async ({ plan, chosenEngine, error }) => {
          return this.options.handleAuthRequiredFailure?.({
            traceId,
            request: activeTask.request,
            plan,
            chosenEngine,
            error,
          });
        },
        classifyFailure: (error) => this.toTaskRuntimeError(
          error,
          activeTask.abortController.signal.aborted,
        ),
        // Fallible output settlement (title/metadata resolution, filesystem
        // rename/cleanup, queue-label updates) runs inside the application
        // Job, at most once, before the diagnostic success terminal and the
        // product event; a settlement failure becomes the single typed failed
        // terminal instead of contradicting an earlier success.
        settleSuccessfulResult: async ({ result, chosenEngine, jobContext }) => {
          let settled = result;
          const outputStem = jobContext.outputStem;
          if (
            settled.success
            && settled.filePath
            && chosenEngine === "yt-dlp"
            && !activeTask.request.title?.trim()
            && settled.title?.trim()
          ) {
            settled = await this.settleTitleRename({
              traceId,
              outputDir: jobContext.outputDir,
              outputStem,
              result: settled,
              title: settled.title,
              activeTask,
              config: jobContext.config,
            });
          }
          if (settled.success && settled.filePath && chosenEngine === "gallery-dl") {
            const originalFilePath = settled.filePath;
            const metadataTitle = await resolveGalleryDlMetadataTitleFromSidecars(
              jobContext.outputDir,
              outputStem,
              originalFilePath,
            );
            if (metadataTitle) {
              settled = await this.settleTitleRename({
                traceId,
                outputDir: jobContext.outputDir,
                outputStem,
                result: settled,
                title: metadataTitle,
                activeTask,
                config: jobContext.config,
              });
            }
            await cleanupGalleryDlMetadataSidecars(
              jobContext.outputDir,
              outputStem,
              originalFilePath,
            );
          }
          return settled;
        },
        diagnostics: {
          traceId,
          sink: this.diagnosticSink,
          resolveNetworkMetadata: () => toDownloadDiagnosticNetwork(networkDiagnostics.snapshot),
        },
      }).executeJob(activeTask.request, activeTask.abortController.signal);
      // Core result stays protocol-neutral; the outer adapter maps the
      // terminal outcome to the protocol payload exactly once below. The
      // result is already settled by the injected hook inside the Job.
      const result = execution.result;
      const chosenEngine = execution.chosenEngine;
      terminalDiagnosticSummary = execution.diagnosticSummary;
      this.logger.log(`>>> [ElectronRuntimeTiming] task engine complete: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        providerId: execution.plan.providerId,
        engineId: chosenEngine ?? null,
        success: result.success,
        filePathPresent: Boolean(result.filePath),
      })}`);
      terminalOutcome = {
        traceId,
        result,
        failure: null,
        diagnosticSummary: terminalDiagnosticSummary,
      };
    } catch (error) {
      const runtimeError = this.toTaskRuntimeError(error, activeTask.abortController.signal.aborted);
      const errorClassification = runtimeError.context?.networkFailureClassification;
      if (networkDiagnostics.snapshot && typeof errorClassification === "string") {
        networkDiagnostics.snapshot = {
          ...networkDiagnostics.snapshot,
          failureClassification: errorClassification as NetworkFailureClassification,
        };
      }
      terminalDiagnosticSummary = getDownloadTerminalDiagnosticSummary(runtimeError);
      this.logger.log(`>>> [ElectronRuntime] task ${traceId} failed: ${sanitizeDiagnosticText(runtimeError.message)}`);
      this.logger.log(`>>> [ElectronRuntimeTiming] task failed: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        errorCode: runtimeError.code,
        category: resolveDownloadDiagnosticCategory(runtimeError),
      })}`);
      terminalRuntimeError = runtimeError;
      terminalOutcome = {
        traceId,
        result: {
          traceId,
          success: false,
          error: runtimeError.message,
        },
        failure: runtimeError,
        userUrl: resolveDiagnosticUserUrl(activeTask.request),
        diagnosticSummary: terminalDiagnosticSummary,
      } satisfies DownloadTerminalOutcome;
    } finally {
      const reservedOutputStem = this.reservedOutputStems.get(traceId);
      if (outputDir && reservedOutputStem) {
        releaseRenameStem(outputDir, reservedOutputStem);
      }
      this.reservedOutputStems.delete(traceId);
      this.active.delete(traceId);
      await this.emitQueueState();
      void this.pumpQueue();
      this.scheduleTranscodePump();
    }

    // Exactly one terminal completion per Job. The terminal outcome was
    // decided by DownloadJobService (a resolved success outcome or a typed
    // failure, including cancellation and auth recovery/retry) and is mapped
    // to the protocol payload exactly once by the outer adapter; the facade
    // only emits, telemetries and settles it and never re-decides the
    // terminal state.
    await this.options.eventSink.emit("video-download-complete", terminalOutcome);
    this.logger.log(`>>> [ElectronRuntimeTiming] task complete event emitted: ${JSON.stringify({
      traceId,
      elapsedMs: formatElapsedMs(taskStartedAtMs),
      success: terminalOutcome.result.success,
    })}`);
    if (terminalOutcome.result.success && terminalOutcome.result.filePath) {
      void this.handleCompletedVideoSource(
        traceId,
        activeTask.label,
        terminalOutcome.result.filePath,
        {
          request: activeTask.request,
          plan: telemetryPlan,
          chosenEngine: executedEngineId,
          network: networkDiagnostics.snapshot,
          diagnosticSummary: terminalDiagnosticSummary,
        },
      );
    } else {
      this.recordDownloadTelemetry(
        traceId,
        {
          request: activeTask.request,
          plan: telemetryPlan,
          chosenEngine: executedEngineId,
          network: networkDiagnostics.snapshot,
          diagnosticSummary: terminalDiagnosticSummary,
        },
        terminalRuntimeError,
      );
    }
  }

  private toTaskRuntimeError(
    error: unknown,
    aborted: boolean,
  ): DownloadRuntimeError {
    if (error instanceof DownloadRuntimeError) {
      // Engine adapters classify raw evidence and supply the classification
      // explicitly before throwing; those must never be re-derived from
      // message text. Only unstamped execution failures (an unclassified
      // E_EXECUTION_FAILED from a legacy or injected source) are refined at
      // this Infrastructure boundary, preserving cause and context.
      if (
        error.code === "E_EXECUTION_FAILED"
        && !error.classificationExplicit
      ) {
        const classification = classifyEngineFailure({
          message: error.message,
          context: error.context,
        });
        if (classification !== error.classification) {
          return new DownloadRuntimeError(
            error.code,
            error.message,
            {
              cause: error.cause,
              classification,
              diagnosticCategory: error.diagnosticCategory
                ?? classifyEngineDiagnosticCategory({
                  message: error.message,
                  context: error.context,
                }),
              context: error.context,
            },
          );
        }
      }
      return error;
    }

    if (aborted) {
      return new DownloadRuntimeError(
        "E_ABORTED",
        "Download cancelled",
        {
          cause: error,
          classification: "cancelled",
        },
      );
    }

    const message = summarizeError(error);
    const classification = classifyEngineFailure({ message });
    return new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      message,
      {
        cause: error,
        classification,
        diagnosticCategory: classifyEngineDiagnosticCategory({ message }),
      },
    );
  }

  private recordDownloadTelemetry(
    traceId: string,
    telemetry: DownloadTelemetryContext,
    error: DownloadRuntimeError | null,
    compatibility?: VideoCompatibilityAnalysis | null,
  ): void {
    try {
      const event = createDownloadTelemetryEvent({
        traceId,
        request: telemetry.request,
        plan: telemetry.plan,
        chosenEngine: telemetry.chosenEngine,
        error,
        diagnosticSummary: telemetry.diagnosticSummary,
        downloadProfile: resolveDownloadTelemetryProfile(telemetry.plan),
        compatibility,
        network: telemetry.network ?? null,
      });
      void Promise.resolve(this.telemetrySink.record(event)).catch((sinkError) => {
        this.logObservabilityFailure("telemetry", sinkError);
      });
    } catch (sinkError) {
      this.logObservabilityFailure("telemetry", sinkError);
    }
  }

  private logObservabilityFailure(kind: string, error: unknown): void {
    try {
      this.logger.log(
        `>>> [Observability] ${kind} sink failed: ${sanitizeDiagnosticText(summarizeError(error))}`,
      );
    } catch {
      // Deliberately stop here: never recurse through the failed adapter.
    }
  }
}

export const createElectronDownloadRuntime = (
  options: ElectronDownloadRuntimeOptions,
): ElectronDownloadRuntime => new AmeowElectronDownloadRuntime(options);
