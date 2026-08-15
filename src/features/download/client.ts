import type {
  DownloadQueueAck,
  LocalIntakeOrigin,
} from "../../application/download-api";
import type {
  DownloadProgressPayload,
  DownloadResultPayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../../protocol/download/ipcTypes";
import { normalizeVideoQueueDetail, normalizeVideoQueueState } from "../../utils/downloadViewHelpers";
import {
  isCancelledDownloadError,
  summarizeDownloadError,
} from "../../utils/downloadEventReducers";
import type { RuntimeFailureDiagnostic } from "../../types/errorDiagnostics";
import type {
  DownloadProgress,
  DownloadTask,
  DownloadTerminalOutcome,
} from "./model";

/**
 * Narrow DownloadQueueClient: the only Download use cases this slice needs.
 * Feature components talk to this interface and never see generic command or
 * event vocabulary. The concrete adapter (`createDownloadQueueClient`) owns
 * command/event names and P3 DTO decoding; protocol DTOs stop at this
 * boundary and never become long-lived feature state.
 */

export type DownloadVideoCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
  mediaType?: "video" | "image";
};

export type DownloadQueueRequest = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates?: DownloadVideoCandidate[];
  siteHint?: string;
  /** Opaque Pinterest drag telemetry bag forwarded verbatim to the runtime;
   * the Application treats it as an untracked diagnostic container. */
  dragDiagnostic?: unknown;
  /** Renderer-only causal sidecar, kept separate from the canonical command. */
  intakeOrigin?: LocalIntakeOrigin;
};

/** Terminal wire payload as exposed to the feature (raw DTO is never kept). */
export type DownloadTerminalPayload = {
  traceId: string;
  success: boolean;
  error?: string | null;
  failure?: RuntimeFailureDiagnostic | null;
};

export type DownloadQueueEvent =
  | { type: "progress"; progress: DownloadProgress }
  | { type: "terminal"; payload: DownloadTerminalPayload }
  | { type: "queueCount"; maxConcurrent: number }
  | {
      type: "queueDetail";
      tasks: DownloadTask[];
      acceptedTraceId?: string;
      acceptedIntakeOrigin?: LocalIntakeOrigin;
    };

export interface DownloadQueueClient {
  queue(request: DownloadQueueRequest): Promise<DownloadQueueAck>;
  queuePasted(url: string, intakeOrigin?: LocalIntakeOrigin): Promise<DownloadQueueAck>;
  cancel(traceId: string): Promise<boolean>;
  selectQuality(traceId: string, optionId: string): Promise<boolean>;
  /** Registers all Download channels; resolves with a disposer. */
  subscribe(listener: (event: DownloadQueueEvent) => void): Promise<() => void>;
  /** Terminal classification policy lives here, never in the reducer. */
  classifyTerminal(
    payload: DownloadTerminalPayload,
    cancelRequested: boolean,
  ): DownloadTerminalOutcome;
}

/** Minimal structural view of the P3 desktop facade so the adapter is testable
 * without Electron and without importing the full bridge runtime. */
export type DownloadQueueBridge = {
  commands: {
    invoke<TResult>(command: string, payload?: Record<string, unknown>): Promise<TResult>;
  };
  events: {
    on<TPayload>(
      event: string,
      listener: (event: { payload: TPayload }) => void,
    ): Promise<() => void>;
  };
};

/**
 * Typed terminal classification. New payloads are classified only from the
 * typed `failure` code/classification; raw `cancelled`/`canceled` text parsing
 * is a bounded compatibility fallback for old payloads without typed failure,
 * where the optimistic cancel hint may assist. A typed success always wins
 * over local cancel intent.
 */
export const classifyDownloadTerminal = (
  payload: DownloadTerminalPayload,
  cancelRequested: boolean,
): DownloadTerminalOutcome => {
  const { traceId } = payload;
  if (payload.failure) {
    const typedCancelled = payload.failure.classification === "cancelled"
      || payload.failure.code === "E_ABORTED";
    return {
      kind: typedCancelled ? "cancelled" : "failure",
      traceId,
      errorSummary: summarizeDownloadError(payload.error),
      failure: payload.failure,
    };
  }
  if (payload.success === true) {
    return { kind: "success", traceId, errorSummary: null };
  }
  // Legacy compatibility path: old completion payloads carry no typed failure.
  const cancelled = cancelRequested || isCancelledDownloadError(payload.error);
  return {
    kind: cancelled ? "cancelled" : "failure",
    traceId,
    errorSummary: summarizeDownloadError(payload.error),
    failure: payload.failure ?? undefined,
  };
};

const toFeatureProgress = (payload: DownloadProgressPayload): DownloadProgress => ({
  traceId: payload.traceId,
  percent: payload.percent,
  stage: payload.stage,
  speed: payload.speed,
  eta: payload.eta,
});

const toFeatureTerminalPayload = (payload: DownloadResultPayload): DownloadTerminalPayload => ({
  traceId: payload.traceId,
  success: payload.success,
  error: payload.error,
  failure: payload.failure,
});

const registerDownloadSubscriptions = async (
  bridge: DownloadQueueBridge,
  listener: (event: DownloadQueueEvent) => void,
): Promise<() => void> => {
  const registrations = [
    bridge.events.on<DownloadProgressPayload>("video-download-progress", (event) => {
      listener({ type: "progress", progress: toFeatureProgress(event.payload) });
    }),
    bridge.events.on<DownloadResultPayload>("video-download-complete", (event) => {
      listener({ type: "terminal", payload: toFeatureTerminalPayload(event.payload) });
    }),
    bridge.events.on<VideoQueueStatePayload>("video-queue-count", (event) => {
      const { maxConcurrent } = normalizeVideoQueueState(event.payload);
      listener({ type: "queueCount", maxConcurrent });
    }),
    bridge.events.on<VideoQueueDetailPayload>("video-queue-detail", (event) => {
      const detail = normalizeVideoQueueDetail(event.payload);
      listener({
        type: "queueDetail",
        ...(detail.acceptedTraceId === undefined
          ? {}
          : { acceptedTraceId: detail.acceptedTraceId }),
        ...(detail.acceptedIntakeOrigin === undefined
          ? {}
          : { acceptedIntakeOrigin: detail.acceptedIntakeOrigin }),
        tasks: detail.tasks.map((task) => ({
          traceId: task.traceId,
          label: task.label,
          videoTitle: task.videoTitle,
          status: task.status,
          phase: task.phase ?? null,
          qualityOptions: task.qualityOptions,
        })),
      });
    }),
  ];
  const disposers = await Promise.all(registrations.map((registration) => (
    registration.catch((error) => {
      console.error("Failed to register download event subscription:", error);
      return null;
    })
  )));
  const activeDisposers = disposers.filter((disposer): disposer is () => void => disposer !== null);
  return () => {
    activeDisposers.forEach((disposer) => disposer());
  };
};

export const createDownloadQueueClient = (bridge: DownloadQueueBridge): DownloadQueueClient => ({
  queue: (request) => bridge.commands.invoke<DownloadQueueAck>("queue_video_download", request),
  queuePasted: (url, intakeOrigin) => bridge.commands.invoke<DownloadQueueAck>(
    "queue_pasted_video_download",
    { url, ...(intakeOrigin === undefined ? {} : { intakeOrigin }) },
  ),
  cancel: (traceId) => bridge.commands.invoke<boolean>("cancel_download", { traceId }),
  selectQuality: (traceId, optionId) => bridge.commands.invoke<boolean>(
    "select_advanced_quality_option",
    { traceId, optionId },
  ),
  subscribe: (listener) => registerDownloadSubscriptions(bridge, listener),
  classifyTerminal: classifyDownloadTerminal,
});
