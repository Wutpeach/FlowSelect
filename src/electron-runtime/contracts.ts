import type { FlowSelectAppEvent } from "../types/electronBridge.js";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";
import type {
  QueuedVideoDownloadAck,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../types/videoRuntime.js";
import type {
  DownloadEngine,
  EngineExecutionContext,
  RawDownloadInput,
  SiteProvider,
} from "../core/index.js";

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
  galleryDl: string;
  ffmpeg: string;
  ffprobe: string;
  deno: string;
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
  providers?: SiteProvider[];
  engines?: DownloadEngine[];
  buildExecutionContext?(
    context: EngineExecutionContext,
    input: RawDownloadInput,
  ): EngineExecutionContext;
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
    request: RawDownloadInput,
  ): Promise<QueuedVideoDownloadAck>;
  cancelDownload(traceId: string): Promise<boolean>;
  getQueueState(): VideoQueueStatePayload;
  getQueueDetail(): VideoQueueDetailPayload;
}
