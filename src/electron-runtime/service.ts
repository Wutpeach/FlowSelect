import type {
  ElectronDownloadRuntime,
  ElectronDownloadRuntimeOptions,
  RuntimeDownloadContext,
  RuntimeDownloadExecutors,
  RuntimeManagedComponent,
} from "./contracts";
import { inspectRuntimeDependencyStatus, resolveRuntimeBinaryPaths } from "./runtimePaths";
import { createRuntimeDependencyResolver } from "./runtimeDependencyGate";
import {
  buildOutputStem,
  nextDownloadTraceId,
  parseJsonObject,
  resolveOutputDir,
  summarizeError,
} from "./runtimeUtils";
import type {
  DownloadResultPayload,
  QueuedVideoDownloadAck,
  QueuedVideoDownloadRequest,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../types/videoRuntime";
import { runDirectVideoDownload } from "./directDownload";
import { runPinterestSidecarDownload } from "./pinterestSidecar";
import { runYtDlpDownload } from "./ytDlpDownload";

type PendingTask = {
  traceId: string;
  label: string;
  request: QueuedVideoDownloadRequest;
};

type ActiveTask = PendingTask & {
  abortController: AbortController;
};

const NOOP_LOGGER = {
  log(message: string): void {
    void message;
    // Intentionally empty.
  },
};

const isPinterestUrl = (value: string | undefined): boolean =>
  Boolean(value && /pinterest\./i.test(value));

const isDirectMediaUrl = (value: string): boolean => /\.(mp4|mov|m4v)(?:$|\?)/i.test(value);

const queueTaskLabel = (request: QueuedVideoDownloadRequest): string =>
  request.pageUrl?.trim()
  || request.videoUrl?.trim()
  || request.url.trim();

export class FlowSelectElectronDownloadRuntime implements ElectronDownloadRuntime {
  readonly maxConcurrent: number;

  private readonly options: ElectronDownloadRuntimeOptions;
  private readonly logger;
  private readonly executors: RuntimeDownloadExecutors;
  private readonly pending: PendingTask[] = [];
  private readonly active = new Map<string, ActiveTask>();
  private readonly resolver;

  constructor(options: ElectronDownloadRuntimeOptions) {
    this.options = options;
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.executors = {
      runDirectDownload: options.executors?.runDirectDownload ?? runDirectVideoDownload,
      runPinterestDownload: options.executors?.runPinterestDownload ?? runPinterestSidecarDownload,
      runYtDlpDownload: options.executors?.runYtDlpDownload ?? runYtDlpDownload,
    };
    this.resolver = createRuntimeDependencyResolver(
      inspectRuntimeDependencyStatus(options.environment),
      () => inspectRuntimeDependencyStatus(options.environment),
      async (reason) => {
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

  async queueVideoDownload(request: QueuedVideoDownloadRequest): Promise<QueuedVideoDownloadAck> {
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

    try {
      const config = parseJsonObject(await this.options.configStore.readConfigString());
      const outputDir = resolveOutputDir(this.options.environment, config);
      const binaries = resolveRuntimeBinaryPaths(this.options.environment);
      const context: RuntimeDownloadContext = {
        traceId,
        request: activeTask.request,
        outputDir,
        outputStem: buildOutputStem(traceId, activeTask.request.url, config),
        config,
        binaries,
        abortSignal: activeTask.abortController.signal,
        fetch: this.options.environment.fetch,
        onProgress: async (payload) => {
          await this.options.eventSink.emit("video-download-progress", payload);
        },
      };
      const result = await this.selectExecutor(context)(context);
      await this.options.eventSink.emit("video-download-complete", result);
    } catch (error) {
      this.logger.log(`>>> [ElectronRuntime] task ${traceId} failed: ${String(error)}`);
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        success: false,
        error: summarizeError(error),
      } satisfies DownloadResultPayload);
    } finally {
      this.active.delete(traceId);
      await this.emitQueueState();
      void this.pumpQueue();
    }
  }

  private selectExecutor(context: RuntimeDownloadContext) {
    const pinterestPageKey = context.request.pageUrl ?? context.request.url;
    const hasPinterestHint = Boolean(
      context.request.videoUrl
      || context.request.videoCandidates?.some((candidate) => candidate.url.trim().length > 0),
    );
    if (isPinterestUrl(pinterestPageKey) && hasPinterestHint) {
      return this.executors.runPinterestDownload;
    }
    if (isDirectMediaUrl(context.request.url)) {
      return this.executors.runDirectDownload;
    }
    return this.executors.runYtDlpDownload;
  }
}

export const createElectronDownloadRuntime = (
  options: ElectronDownloadRuntimeOptions,
): ElectronDownloadRuntime => new FlowSelectElectronDownloadRuntime(options);
