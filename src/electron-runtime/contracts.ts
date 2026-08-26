import type { AmeowAppEvent } from "../types/electronBridge.js";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";
import type {
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../protocol/download/ipcTypes.js";
import type {
  DownloadApplicationApi,
  DownloadQueueAck,
  PastedSelectionPorts,
  QueueDownloadCommand,
  QueueDownloadPresentationCause,
} from "../application/download-api.js";
import type {
  DownloadRuntimeError,
  DownloadEngine,
  EngineId,
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
} from "../core/index.js";
import type {
  EngineExecutionContextWithRuntime,
  RuntimeSetLease,
} from "./engineExecutionContext.js";
import type { DownloadTelemetryEvent } from "../download-capabilities/telemetry.js";
import type { NetworkConsumer, NetworkRouteResolution } from "../config/networkRoute.js";
import type { DownloadDiagnosticSink } from "../application/download-diagnostics.js";

export type RuntimeManagedComponent = RuntimeDependencyManagedComponent;
export type RuntimeSetConsumer = "yt-dlp" | "gallery-dl" | "media-tools";

/**
 * One stable network execution context per queued Job. Created once at the
 * Job boundary and reused across engine retry, engine fallback, and auth
 * recovery. A future refresh must be an explicit rebuild with a new identity;
 * P0 exposes no implicit refresh path.
 */
export type DownloadExecutionContext = {
  identity: string;
  createdAtMs: number;
  network: Promise<NetworkRouteResolution>;
};

export type RuntimeEmitterEvent =
  | Extract<
      AmeowAppEvent,
      | "runtime-dependency-gate-state"
      | "video-download-complete"
      | "video-download-progress"
      | "video-queue-count"
      | "video-queue-detail"
      | "video-transcode-complete"
      | "video-transcode-failed"
      | "video-transcode-progress"
      | "video-transcode-queue-count"
      | "video-transcode-queue-detail"
      | "video-transcode-queued"
      | "video-transcode-removed"
      | "video-transcode-retried"
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

export interface DownloadTelemetrySink {
  record(event: DownloadTelemetryEvent): Promise<void>;
}

export type RuntimeAuthFailureRecoveryContext = {
  traceId: string;
  request: RawDownloadInput;
  plan: ResolvedDownloadPlan | null;
  chosenEngine: EngineId | null;
  error: DownloadRuntimeError;
};

export type RuntimeAuthFailureRecoveryResult = {
  shouldRetry: boolean;
};

export type RuntimeNetworkProxyContext = {
  targetUrl: string;
  providerId: string | null;
  engineId: EngineId;
};

export type RuntimeAdvancedQualitySiteSessionRefreshContext = {
  traceId: string;
  siteId: string;
  pageUrl?: string;
  url: string;
};

export type RuntimeDownloadSiteSessionRefreshContext = {
  traceId: string;
  siteId: string;
  pageUrl?: string;
  url: string;
};

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

/**
 * Infrastructure-owned resolved binary paths (the single path source of
 * truth, produced by `resolveRuntimeBinaryPaths`). Core/Application never
 * import this shape; concrete engines receive narrowed per-engine dependency
 * sets through their adapter constructors.
 */
export type RuntimeBinaryPaths = {
  ytDlp: string;
  galleryDl: string;
  ffmpeg: string;
  ffprobe: string;
  deno: string;
};

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
  telemetrySink?: DownloadTelemetrySink;
  diagnosticSink?: DownloadDiagnosticSink;
  maxConcurrent?: number;
  providers?: SiteProvider[];
  /**
   * Concrete engines registered by the outer composition. The declared
   * execution contract (the Electron runtime per-job context) is preserved
   * through the registry and orchestrator: the runtime always builds this
   * exact context for engine attempts.
   */
  engines?: DownloadEngine<EngineExecutionContextWithRuntime>[];
  buildExecutionContext?(
    context: EngineExecutionContextWithRuntime,
    input: RawDownloadInput,
  ): EngineExecutionContextWithRuntime;
  ensureEngineRuntimeReady?(
    engineId: EngineId,
    reason: string,
  ): Promise<void>;
  /** Atomically prepare and lease the mutable runtime set for one consumer. */
  acquireRuntimeSetLease?(
    consumer: RuntimeSetConsumer,
    reason: string,
  ): Promise<RuntimeSetLease>;
  bootstrapManagedComponents?(
    context: RuntimeBootstrapContext,
  ): Promise<RuntimeDependencyStatusSnapshot | void>;
  handleAuthRequiredFailure?(
    context: RuntimeAuthFailureRecoveryContext,
  ): Promise<RuntimeAuthFailureRecoveryResult | void>;
  refreshSiteSessionBeforeAdvancedQualityProbe?(
    context: RuntimeAdvancedQualitySiteSessionRefreshContext,
  ): Promise<void>;
  refreshSiteSessionBeforeDownload?(
    context: RuntimeDownloadSiteSessionRefreshContext,
  ): Promise<void>;
  /**
   * Resolves the single network route for a queued Job. Called once per Job;
   * the returned resolution is reused across retry/fallback/auth recovery.
   * The injected implementation must sanitize everything it logs.
   */
  resolveNetworkRoute?(
    context: RuntimeNetworkProxyContext,
  ): Promise<NetworkRouteResolution>;
  /**
   * Maps an engine id to its explicit NetworkConsumer for route resolution.
   * Without it the runtime falls back to the locally closed engine mapping,
   * which fails closed for unknown engines.
   */
  resolveNetworkConsumer?(engineId: EngineId | undefined): NetworkConsumer;
  reportNetworkProxyFailure?(
    context: RuntimeNetworkProxyContext & { error: unknown },
  ): Promise<void> | void;
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

export interface ElectronDownloadRuntime extends DownloadApplicationApi {
  readonly maxConcurrent: number;
  getRuntimeDependencyStatus(): RuntimeDependencyStatusSnapshot;
  getRuntimeDependencyGateState(): RuntimeDependencyGateStatePayload;
  refreshRuntimeDependencyGateState(): RuntimeDependencyGateStatePayload;
  startRuntimeDependencyBootstrap(
    reason?: string,
  ): Promise<RuntimeDependencyGateStatePayload>;
  queueDownload(
    command: QueueDownloadCommand,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck>;
  queuePastedDownload(
    command: QueueDownloadCommand,
    ports: PastedSelectionPorts,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck>;
  /** Internal raw-input queue path used by the Application API and advanced
   * quality continuation; transport adapters call `queueDownload`. */
  queueVideoDownload(
    request: RawDownloadInput,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck>;
  selectAdvancedQualityOption(traceId: string, optionId: string): Promise<boolean>;
  cancelDownload(traceId: string): Promise<boolean>;
  cancelTranscode(traceId: string): Promise<boolean>;
  retryTranscode(traceId: string): Promise<boolean>;
  removeTranscode(traceId: string): Promise<boolean>;
  getQueueState(): VideoQueueStatePayload;
  getQueueDetail(): VideoQueueDetailPayload;
  getTranscodeQueueState(): VideoTranscodeQueueStatePayload;
  getTranscodeQueueDetail(): VideoTranscodeQueueDetailPayload;
}
