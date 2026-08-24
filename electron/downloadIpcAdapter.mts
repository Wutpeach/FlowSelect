import {
  resolveYtdlpQualityPreferenceFromConfig,
} from "../src/core/index.js";
import {
  decodeCaptureEvidence,
  decodeQueueDownloadCommand,
} from "../src/protocol/download/ipcMappers.js";
import type {
  DownloadApplicationApi,
  DownloadQueueAck,
  PastedSelectionPorts,
  PastedSelectionResolution,
  QueueDownloadPresentationCause,
  QueueDownloadCommand,
} from "../src/application/download-api.js";
import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import type { ExtensionRequestBridge } from "./extensionRequestBridge.mjs";

/**
 * Renderer IPC download adapter. Owns the download command allowlist, outer
 * payload decode/validate, Application invocation and response behavior.
 * Non-download commands stay on the existing controller/switch path.
 */

type CommandPayload = Record<string, unknown> | undefined;

export type DownloadIpcAdapter = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type DownloadIpcAdapterOptions = {
  runtime: DownloadApplicationApi;
  extensionBridge: ExtensionRequestBridge;
  readConfigObject(): Promise<Record<string, unknown>>;
  logInjectedDebug?(
    config: Record<string, unknown>,
    message: string,
    payload: unknown,
  ): void;
};

const supportedCommands = new Set<AmeowRendererCommand>([
  "cancel_download",
  "queue_pasted_video_download",
  "queue_video_download",
  "select_advanced_quality_option",
]);

const EXTENSION_ASSISTED_PASTED_VIDEO_SITE_HINTS = new Set([
  "bilibili",
  "youtube",
  "twitter-x",
  "pinterest",
]);

const asObject = (payload: CommandPayload): Record<string, unknown> => (
  payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {}
);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

// The canonical command decoder deliberately never sees this transient UI
// cause. Renderer IPC is untrusted, so only finite normalized coordinates are
// allowed to accompany the same accepted-membership emission.
const decodePresentationCause = (
  payload: Record<string, unknown>,
): QueueDownloadPresentationCause | undefined => {
  const value = payload.intakeOrigin;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const { x, y } = value as Record<string, unknown>;
  if (
    typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1
    || typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > 1
  ) {
    return undefined;
  }
  return { intakeOrigin: { x, y } };
};

/**
 * Reads a required identifier (traceId / optionId) accepting the documented
 * camelCase alias then snake_case. Missing, blank and wrong-type values are
 * rejected before any DownloadApplicationApi invocation.
 */
const readRequiredIdentifier = (
  request: Record<string, unknown>,
  ...keys: string[]
): string => {
  for (const key of keys) {
    const value = request[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`Invalid command payload field: ${keys[0]}`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`Missing required command payload field: ${keys[0]}`);
    }
    return trimmed;
  }
  throw new Error(`Missing required command payload field: ${keys[0]}`);
};

const summarizeQueuePayload = (payload: Record<string, unknown>) => ({
  url: payload.url ?? null,
  pageUrl: payload.pageUrl ?? payload.page_url ?? null,
  videoUrl: payload.videoUrl ?? payload.video_url ?? null,
  siteHint: payload.siteHint ?? payload.site_hint ?? null,
  titlePresent: Boolean(normalizeOptionalString(payload.title)),
  cookiesPresent: Boolean(normalizeOptionalString(payload.cookies)),
  videoCandidateCount: Array.isArray(payload.videoCandidates)
    ? payload.videoCandidates.length
    : Array.isArray(payload.video_candidates)
      ? payload.video_candidates.length
      : 0,
  selectedVideoVariantPresent: Boolean(
    payload.selectedVideoVariant
    && typeof payload.selectedVideoVariant === "object",
  ),
  videoQuality:
    payload.videoQuality
    ?? payload.ytdlpQuality
    ?? payload.defaultVideoDownloadQuality
    ?? null,
  clipStartSec: Number.isFinite(payload.clipStartSec) ? payload.clipStartSec : null,
  clipEndSec: Number.isFinite(payload.clipEndSec) ? payload.clipEndSec : null,
});

const toPastedSelectionResolution = (
  resolution: Awaited<ReturnType<ExtensionRequestBridge["requestPastedVideoSelectionResolution"]>>,
): PastedSelectionResolution => ({
  url: resolution.url!,
  pageUrl: resolution.pageUrl,
  videoUrl: resolution.videoUrl,
  videoCandidates: resolution.videoCandidates,
  siteHint: resolution.siteHint,
  title: resolution.title,
  selectionScope: resolution.selectionScope,
  clipStartSec: resolution.clipStartSec,
  clipEndSec: resolution.clipEndSec,
  videoQuality: resolution.videoQuality,
  captureEvidence: decodeCaptureEvidence(resolution.extensionData),
});

export const createDownloadIpcAdapter = (
  options: DownloadIpcAdapterOptions,
): DownloadIpcAdapter => {
  const buildPastedSelectionPorts = (): PastedSelectionPorts => ({
    isEligible(siteHint) {
      return Boolean(siteHint && EXTENSION_ASSISTED_PASTED_VIDEO_SITE_HINTS.has(siteHint));
    },
    async resolveSelection({ url, pageUrl, siteHint }) {
      const resolved = await options.extensionBridge.requestPastedVideoSelectionResolution({
        url,
        pageUrl: pageUrl ?? url,
        siteHint,
      });
      if (!resolved.success || !resolved.url) {
        return null;
      }
      return toPastedSelectionResolution(resolved);
    },
  });

  const decodeQueueCommand = async (
    payload: CommandPayload,
  ): Promise<{ command: QueueDownloadCommand; config: Record<string, unknown> }> => {
    const config = await options.readConfigObject();
    const mergedPreferences = {
      videoQuality: resolveYtdlpQualityPreferenceFromConfig(config),
    };
    const command = decodeQueueDownloadCommand(payload, {
      videoQuality: mergedPreferences.videoQuality,
    });
    return { command, config };
  };

  return {
    supports(command) {
      return supportedCommands.has(command);
    },

    async invoke<TResult>(
      command: AmeowRendererCommand,
      payload?: Record<string, unknown>,
    ): Promise<TResult> {
      switch (command) {
        case "queue_video_download": {
          const request = asObject(payload);
          const { command: decoded, config } = await decodeQueueCommand(request);
          const cause = decodePresentationCause(request);
          options.logInjectedDebug?.(
            config,
            "Normalized injected download request",
            summarizeQueuePayload(request),
          );
          const ack = await (cause === undefined
            ? options.runtime.queueDownload(decoded)
            : options.runtime.queueDownload(decoded, cause)) as DownloadQueueAck;
          options.logInjectedDebug?.(config, "Queued injected download request", {
            traceId: ack.traceId,
            accepted: ack.accepted,
            ...summarizeQueuePayload(request),
          });
          return ack as TResult;
        }
        case "queue_pasted_video_download": {
          const request = asObject(payload);
          const { command: decoded, config } = await decodeQueueCommand(request);
          const cause = decodePresentationCause(request);
          const ports = buildPastedSelectionPorts();
          const ack = await (cause === undefined
            ? options.runtime.queuePastedDownload(decoded, ports)
            : options.runtime.queuePastedDownload(decoded, ports, cause)) as DownloadQueueAck;
          options.logInjectedDebug?.(config, "Queued pasted download request", {
            traceId: ack.traceId,
            accepted: ack.accepted,
            ...summarizeQueuePayload(request),
          });
          return ack as TResult;
        }
        case "cancel_download":
          return await options.runtime.cancelDownload(
            readRequiredIdentifier(asObject(payload), "traceId", "trace_id"),
          ) as TResult;
        case "select_advanced_quality_option": {
          const request = asObject(payload);
          return await options.runtime.selectAdvancedQualityOption(
            readRequiredIdentifier(request, "traceId", "trace_id"),
            readRequiredIdentifier(request, "optionId", "option_id"),
          ) as TResult;
        }
        default:
          throw new Error(`Unsupported download IPC command: ${command}`);
      }
    },
  };
};
