import type {
  ElectronDownloadRuntime,
  ElectronDownloadRuntimeOptions,
  RuntimeManagedComponent,
} from "./contracts.js";
import { inspectRuntimeDependencyStatus, resolveRuntimeBinaryPaths } from "./runtimePaths.js";
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
import { probeYtDlpMetadataTitle } from "./ytDlpMetadata.js";
import type {
  DownloadResultPayload,
  DownloadProgressPayload,
  QueuedVideoDownloadAck,
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeStage,
  VideoTranscodeTaskPayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../types/videoRuntime.js";
import type {
  KnownSiteHint,
  EngineExecutionContext,
  EnginePlan,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../core/index.js";
import { resolveSiteHint } from "../core/index.js";
import { builtinEngines, createEngineRegistry } from "../engines/index.js";
import { DownloadOrchestrator } from "../orchestration/download-orchestrator.js";
import { loadBuiltinProviders } from "../sites/provider-loader.js";
import { createSiteRegistry } from "../sites/site-registry.js";
import {
  prepareVideoTranscodeTaskFromDownload,
  runPreparedVideoTranscodeTask,
  type PreparedVideoTranscodeTask,
} from "./transcode.js";

type PendingTask = {
  traceId: string;
  label: string;
  request: RawDownloadInput;
};

type ActiveTask = PendingTask & {
  abortController: AbortController;
};

type TranscodeTaskState = PreparedVideoTranscodeTask & {
  status: "pending" | "active" | "failed";
  stage: VideoTranscodeStage | null;
  progressPercent: number | null;
  etaSeconds: number | null;
  error: string | null;
  abortController?: AbortController;
};

const NOOP_LOGGER = {
  log(message: string): void {
    void message;
  },
};

const queueTaskLabel = (request: RawDownloadInput): string =>
  request.title?.trim()
  || request.pageUrl?.trim()
  || request.videoUrl?.trim()
  || request.url.trim();

const shouldProbeMissingYtDlpTitle = (
  request: RawDownloadInput,
  resolvedSiteHint: KnownSiteHint | undefined,
): boolean => {
  if (request.title?.trim() || request.selectionScope === "playlist") {
    return false;
  }

  return resolvedSiteHint === "youtube" || resolvedSiteHint === "bilibili";
};

export class FlowSelectElectronDownloadRuntime implements ElectronDownloadRuntime {
  readonly maxConcurrent: number;

  private readonly options: ElectronDownloadRuntimeOptions;
  private readonly logger;
  private readonly pending: PendingTask[] = [];
  private readonly active = new Map<string, ActiveTask>();
  private readonly reservedOutputStems = new Map<string, string>();
  private outputStemReservationLock: Promise<void> = Promise.resolve();
  private readonly pendingTranscodes: TranscodeTaskState[] = [];
  private readonly failedTranscodes: TranscodeTaskState[] = [];
  private activeTranscode: TranscodeTaskState | null = null;
  private transcodePumpScheduled = false;
  private readonly resolver;
  private readonly orchestrator: DownloadOrchestrator;

  constructor(options: ElectronDownloadRuntimeOptions) {
    this.options = options;
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.logger = options.logger ?? NOOP_LOGGER;
    const providers = options.providers ?? loadBuiltinProviders();
    const engines = options.engines ?? builtinEngines();
    this.orchestrator = new DownloadOrchestrator(
      createSiteRegistry(providers),
      createEngineRegistry(engines),
    );
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
    const activeCount = this.active.size;
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
        })),
        ...this.pending.map((task) => ({
          traceId: task.traceId,
          label: task.label,
          status: "pending" as const,
        })),
      ],
    };
  }

  async queueVideoDownload(request: RawDownloadInput): Promise<QueuedVideoDownloadAck> {
    const traceId = nextDownloadTraceId();
    this.pending.push({
      traceId,
      label: queueTaskLabel(request),
      request,
    });
    await this.emitQueueState();
    void this.pumpQueue();
    return {
      accepted: true,
      traceId,
    };
  }

  async cancelDownload(traceId: string): Promise<boolean> {
    const pendingIndex = this.pending.findIndex((task) => task.traceId === traceId);
    if (pendingIndex >= 0) {
      this.pending.splice(pendingIndex, 1);
      await this.emitQueueState();
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        success: false,
        error: "Download cancelled",
      } satisfies DownloadResultPayload);
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

  private async emitQueueState(): Promise<void> {
    await this.options.eventSink.emit("video-queue-count", this.getQueueState());
    await this.options.eventSink.emit("video-queue-detail", this.getQueueDetail());
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
    return this.active.size > 0 || this.pending.length > 0;
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

  private async enqueuePreparedTranscodeTask(task: PreparedVideoTranscodeTask): Promise<void> {
    const alreadyPresent = this.pendingTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.failedTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.activeTranscode?.traceId === task.traceId;
    if (alreadyPresent) {
      return;
    }

    const pendingTask: TranscodeTaskState = {
      ...task,
      status: "pending",
      stage: null,
      progressPercent: null,
      etaSeconds: null,
      error: null,
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
    binaries: ReturnType<typeof resolveRuntimeBinaryPaths>,
  ): Promise<void> {
    try {
      const prepared = await prepareVideoTranscodeTaskFromDownload({
        traceId,
        label,
        sourcePath,
        ffprobePath: binaries.ffprobe,
        ffmpegPath: binaries.ffmpeg,
      });
      if (!prepared) {
        return;
      }
      await this.enqueuePreparedTranscodeTask(prepared);
    } catch (error) {
      this.logger.log(
        `>>> [ElectronRuntime] transcode follow-up for ${traceId} failed: ${summarizeError(error)}`,
      );
    }
  }

  private async runActiveTranscode(): Promise<void> {
    const activeTask = this.activeTranscode;
    if (!activeTask || !activeTask.abortController) {
      return;
    }

    try {
      const result = await runPreparedVideoTranscodeTask(activeTask, {
        ffmpegPath: resolveRuntimeBinaryPaths(this.options.environment).ffmpeg,
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
      });

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
      const nextFailedTask: TranscodeTaskState = {
        ...failedTask,
        status: "failed",
        stage: "failed",
        progressPercent: null,
        etaSeconds: null,
        error: errorMessage,
        abortController: undefined,
      };
      this.failedTranscodes.push(nextFailedTask);
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

    let outputDir: string | null = null;
    try {
      const config = parseJsonObject(await this.options.configStore.readConfigString());
      const resolvedOutputDir = resolveOutputDir(this.options.environment, config);
      outputDir = resolvedOutputDir;
      const binaries = resolveRuntimeBinaryPaths(this.options.environment);
      const resolvedSiteHint = resolveSiteHint(
        activeTask.request.siteHint,
        activeTask.request.pageUrl,
        activeTask.request.url,
      );
      if (shouldProbeMissingYtDlpTitle(activeTask.request, resolvedSiteHint)) {
        const probedTitle = await probeYtDlpMetadataTitle({
          sourceUrl: activeTask.request.url,
          pageUrl: activeTask.request.pageUrl,
          cookies: activeTask.request.cookies,
          selectionScope: activeTask.request.selectionScope,
          binaries,
          signal: activeTask.abortController.signal,
        });
        if (probedTitle && probedTitle !== activeTask.request.title) {
          activeTask.request.title = probedTitle;
          activeTask.label = queueTaskLabel(activeTask.request);
          await this.emitQueueState();
        }
      }
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
      const result = await this.orchestrator.execute(
        activeTask.request,
        (plan: ResolvedDownloadPlan, enginePlan: EnginePlan) => {
          const context: EngineExecutionContext = {
            traceId,
            plan,
            enginePlan,
            intent: plan.intent,
            outputDir: resolvedOutputDir,
            outputStem,
            config,
            binaries,
            abortSignal: activeTask.abortController.signal,
            fetch: this.options.environment.fetch,
            onProgress: async (payload: DownloadProgressPayload) => {
              await this.options.eventSink.emit("video-download-progress", payload);
            },
          };
          return this.options.buildExecutionContext
            ? this.options.buildExecutionContext(context, activeTask.request)
            : context;
        },
      );
      await this.options.eventSink.emit("video-download-complete", result);
      if (result.success && result.file_path) {
        void this.handleCompletedVideoSource(traceId, activeTask.label, result.file_path, binaries);
      }
    } catch (error) {
      this.logger.log(`>>> [ElectronRuntime] task ${traceId} failed: ${String(error)}`);
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        success: false,
        error: summarizeError(error),
      } satisfies DownloadResultPayload);
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
  }
}

export const createElectronDownloadRuntime = (
  options: ElectronDownloadRuntimeOptions,
): ElectronDownloadRuntime => new FlowSelectElectronDownloadRuntime(options);
