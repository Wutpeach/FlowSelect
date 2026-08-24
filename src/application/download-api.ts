import type {
  AmeowCaptureEvidenceV1,
  DownloadProgress,
  DownloadResult,
  DownloadRuntimeError,
  DownloadSelectionScope,
  MediaCandidate,
  RawDownloadInput,
  YtdlpQualityPreference,
} from "../core/index.js";
import type { DownloadTerminalDiagnosticSummary } from "./download-diagnostics.js";

/**
 * Canonical protocol-neutral download Application API. One narrow use-case
 * vocabulary shared by the Renderer IPC and Browser Extension WS adapters.
 *
 * Ownership rules:
 * - Commands/results/events carry no IPC channel names, WS action names,
 *   request IDs, Electron types, renderer/extension DTOs, or wire casing.
 * - Transport-specific containers (`extensionData`, `ytdlpQualityPreference`
 *   and friends) are consumed by the transport compatibility decoders and
 *   never reach this layer; only canonical fields are accepted.
 * - Raw advanced-quality selectors and attempt cookies stay runtime-owned and
 *   are added after command decoding.
 */

/** Canonical queue command. `advancedQualityRequested` expresses user intent;
 * the internal selector chosen later stays runtime-owned. */
export type QueueDownloadCommand = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  selectedVideoVariant?: MediaCandidate;
  videoCandidates?: MediaCandidate[];
  title?: string;
  selectionScope?: DownloadSelectionScope;
  clipStartSec?: number;
  clipEndSec?: number;
  videoQuality?: YtdlpQualityPreference;
  siteHint?: string;
  advancedQualityRequested?: boolean;
  /** Transport-neutral capture evidence, mapped from the Extension
   * `extensionData.ameowCapture` container at the compatibility decoder. */
  captureEvidence?: AmeowCaptureEvidenceV1;
  /**
   * Renderer-origin Pinterest drag diagnostic bag. Preserved verbatim for
   * runtime telemetry classification; the concrete wire shape is refined by
   * the protocol decoder.
   * ponytail: kept as an unknown bag until telemetry gains a canonical model.
   */
  dragDiagnostic?: unknown;
  diagnostics?: Record<string, unknown>;
};

export type DownloadQueueAck = {
  accepted: boolean;
  traceId: string;
};

/**
 * A normalized point captured synchronously at a renderer submission boundary.
 * It is transient Presentation cause metadata, never Download input or state.
 */
export type LocalIntakeOrigin = Readonly<{ x: number; y: number }>;

export type QueueDownloadPresentationCause = Readonly<{
  intakeOrigin?: LocalIntakeOrigin;
}>;

export type AdvancedQualityPostProcessPlan =
  | "none"
  | "remux_only"
  | "audio_transcode"
  | "full_transcode"
  | "unknown";

/** Public advanced-quality option model. Selectors are never exposed. */
export type AdvancedQualityOption = {
  id: string;
  label: string;
  tags?: string[];
  postProcessPlan?: AdvancedQualityPostProcessPlan;
};

/**
 * Protocol-neutral terminal download outcome. Exactly one is published per
 * Job by the runtime; adapters map it to their own terminal payloads. A typed
 * `failure` carries stable code/classification so Renderer cancellation and
 * error handling do not depend on raw-message parsing for new payloads.
 */
export type DownloadTerminalOutcome = {
  traceId: string;
  result: DownloadResult;
  failure: DownloadRuntimeError | null;
  /** User-facing URL for failure diagnostics (derived from the request). */
  userUrl?: string;
  /** Explicit safe user-facing text for special pre-Job compatibility paths. */
  presentationMessage?: string;
  /** Safe bounded summary; optional for legacy/pre-Job terminal producers. */
  diagnosticSummary?: DownloadTerminalDiagnosticSummary;
};

/** Pasted-selection resolution injected by the transport adapter. */
export type PastedSelectionResolution = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates?: MediaCandidate[];
  siteHint?: string;
  title?: string;
  selectionScope?: DownloadSelectionScope;
  clipStartSec?: number;
  clipEndSec?: number;
  videoQuality?: YtdlpQualityPreference;
  captureEvidence?: AmeowCaptureEvidenceV1;
};

/** Injected selection-resolution port and eligibility policy. */
export type PastedSelectionPorts = {
  isEligible(siteHint: string | undefined): boolean;
  resolveSelection(input: {
    url: string;
    pageUrl?: string;
    siteHint?: string;
  }): Promise<PastedSelectionResolution | null>;
};

export interface DownloadApplicationApi {
  queueDownload(
    command: QueueDownloadCommand,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck>;
  queuePastedDownload(
    command: QueueDownloadCommand,
    ports: PastedSelectionPorts,
    cause?: QueueDownloadPresentationCause,
  ): Promise<DownloadQueueAck>;
  cancelDownload(traceId: string): Promise<boolean>;
  selectAdvancedQualityOption(traceId: string, optionId: string): Promise<boolean>;
}

/**
 * Canonical command -> runtime input adapter. The runtime adds runtime-owned
 * values (cookies, advanced-quality selectors) after this mapping. The
 * Pinterest drag diagnostic is preserved as an untracked property for
 * telemetry classification until it gains a canonical model.
 */
export const toRawDownloadInput = (
  command: QueueDownloadCommand,
): RawDownloadInput => {
  const input: RawDownloadInput = {
    url: command.url,
    pageUrl: command.pageUrl,
    videoUrl: command.videoUrl,
    selectedVideoVariant: command.selectedVideoVariant,
    videoCandidates: command.videoCandidates,
    title: command.title,
    selectionScope: command.selectionScope,
    clipStartSec: command.clipStartSec,
    clipEndSec: command.clipEndSec,
    videoQuality: command.videoQuality,
    siteHint: command.siteHint,
    advancedQualityRequest: command.advancedQualityRequested,
    captureEvidence: command.captureEvidence,
    diagnostics: command.diagnostics,
  };
  if (command.dragDiagnostic !== undefined) {
    (input as RawDownloadInput & { dragDiagnostic?: unknown }).dragDiagnostic =
      command.dragDiagnostic;
  }
  return input;
};

/** Convenience re-export so protocol mappers can speak in progress values. */
export type { DownloadProgress, DownloadResult };
