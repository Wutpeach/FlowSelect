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

type PendingTask = {
  traceId: string;
  label: string;
  request: RawDownloadInput;
};

type ActiveTask = PendingTask & {
  abortController: AbortController;
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
      return true;
    }

    const activeTask = this.active.get(traceId);
    if (!activeTask) {
      return false;
    }
    activeTask.abortController.abort();
    return true;
  }

  private async emitQueueState(): Promise<void> {
    await this.options.eventSink.emit("video-queue-count", this.getQueueState());
    await this.options.eventSink.emit("video-queue-detail", this.getQueueDetail());
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
    }
  }
}

export const createElectronDownloadRuntime = (
  options: ElectronDownloadRuntimeOptions,
): ElectronDownloadRuntime => new FlowSelectElectronDownloadRuntime(options);
