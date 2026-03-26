import type { FlowSelectAppEvent } from "../types/electronBridge";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies";
import type {
  DownloadResultPayload,
  DownloadProgressPayload,
  QueuedVideoDownloadAck,
  QueuedVideoDownloadRequest,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../types/videoRuntime";

export type RuntimeManagedComponent = RuntimeDependencyManagedComponent;

export type RuntimeEmitterEvent =
  | Extract<
      FlowSelectAppEvent,
      | "runtime-dependency-gate-state"
      | "video-download-complete"
      | "video-download-progress"
      | "video-queue-count"
      | "video-queue-detail"
    >;

export interface RuntimeEventSink {
  emit<TPayload>(event: RuntimeEmitterEvent, payload: TPayload): void | Promise<void>;
}

export interface RuntimeConfigStore {
  readConfigString(): Promise<string>;
}

export interface RuntimeLogger {
  log(message: string): void;
}

export interface ElectronRuntimeEnvironment {
  repoRoot: string;
  configDir: string;
  resourceDir?: string | null;
  executableDir?: string | null;
  desktopDir?: string | null;
  tempDir?: string | null;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  fetch?: typeof fetch;
}

export interface RuntimeBinaryPaths {
  ytDlp: string;
  ffmpeg: string;
  ffprobe: string;
  deno: string;
  pinterestDownloader: string;
}

export interface RuntimeDownloadContext {
  traceId: string;
  request: QueuedVideoDownloadRequest;
  outputDir: string;
  outputStem: string;
  config: Record<string, unknown>;
  binaries: RuntimeBinaryPaths;
  abortSignal: AbortSignal;
  fetch?: typeof fetch;
  onProgress(payload: DownloadProgressPayload): void | Promise<void>;
}

export interface RuntimeDownloadExecutors {
  runYtDlpDownload(context: RuntimeDownloadContext): Promise<DownloadResultPayload>;
  runDirectDownload(context: RuntimeDownloadContext): Promise<DownloadResultPayload>;
  runPinterestDownload(context: RuntimeDownloadContext): Promise<DownloadResultPayload>;
}

export interface RuntimeBootstrapContext {
  missingComponents: RuntimeManagedComponent[];
  reason: string;
  environment: ElectronRuntimeEnvironment;
}

export interface ElectronDownloadRuntimeOptions {
  environment: ElectronRuntimeEnvironment;
  configStore: RuntimeConfigStore;
  eventSink: RuntimeEventSink;
  logger?: RuntimeLogger;
  maxConcurrent?: number;
  executors?: Partial<RuntimeDownloadExecutors>;
  bootstrapManagedComponents?(
    context: RuntimeBootstrapContext,
  ): Promise<RuntimeDependencyStatusSnapshot | void>;
}

export interface RuntimeDependencyResolver {
  resolveStatus(): RuntimeDependencyStatusSnapshot;
  getGateState(): RuntimeDependencyGateStatePayload;
  refreshGateState(): RuntimeDependencyGateStatePayload;
  startBootstrap(reason: string): Promise<RuntimeDependencyGateStatePayload>;
  setManagedComponentStatus(
    component: RuntimeManagedComponent,
    status: RuntimeDependencyStatusEntry,
  ): void;
}

export interface ElectronDownloadRuntime {
  readonly maxConcurrent: number;
  getRuntimeDependencyStatus(): RuntimeDependencyStatusSnapshot;
  getRuntimeDependencyGateState(): RuntimeDependencyGateStatePayload;
  refreshRuntimeDependencyGateState(): RuntimeDependencyGateStatePayload;
  startRuntimeDependencyBootstrap(
    reason?: string,
  ): Promise<RuntimeDependencyGateStatePayload>;
  queueVideoDownload(
    request: QueuedVideoDownloadRequest,
  ): Promise<QueuedVideoDownloadAck>;
  cancelDownload(traceId: string): Promise<boolean>;
  getQueueState(): VideoQueueStatePayload;
  getQueueDetail(): VideoQueueDetailPayload;
}
