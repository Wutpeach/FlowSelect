import type { FlowSelectRendererCommand } from "../types/electronBridge.js";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";
import type {
  PinterestDragDiagnostic,
  PinterestDragDiagnosticFlags,
  PinterestVideoCandidate,
  QueuedVideoDownloadAck,
  QueuedVideoDownloadRequest,
} from "../types/videoRuntime.js";
import type { ElectronDownloadRuntime } from "./contracts.js";
import { resolveSiteHint } from "../core/site-hints.js";

export type ElectronRuntimeCommand = Extract<
  FlowSelectRendererCommand,
  | "cancel_download"
  | "get_runtime_dependency_gate_state"
  | "get_runtime_dependency_status"
  | "queue_video_download"
  | "refresh_runtime_dependency_gate_state"
  | "start_runtime_dependency_bootstrap"
>;

export type ElectronRuntimeCommandResultMap = {
  cancel_download: boolean;
  get_runtime_dependency_gate_state: RuntimeDependencyGateStatePayload;
  get_runtime_dependency_status: RuntimeDependencyStatusSnapshot;
  queue_video_download: QueuedVideoDownloadAck;
  refresh_runtime_dependency_gate_state: RuntimeDependencyGateStatePayload;
  start_runtime_dependency_bootstrap: RuntimeDependencyGateStatePayload;
};

type CommandPayload = Record<string, unknown> | undefined;

type CommandFallback = (
  command: FlowSelectRendererCommand,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

export interface ElectronRuntimeCommandRouter {
  supports(command: FlowSelectRendererCommand): command is ElectronRuntimeCommand;
  invoke<TResult>(
    command: FlowSelectRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
}

export interface ElectronRuntimeCommandRouterOptions {
  runtime: ElectronDownloadRuntime;
  fallback?: CommandFallback;
}

const supportedCommands = new Set<ElectronRuntimeCommand>([
  "cancel_download",
  "get_runtime_dependency_gate_state",
  "get_runtime_dependency_status",
  "queue_video_download",
  "refresh_runtime_dependency_gate_state",
  "start_runtime_dependency_bootstrap",
]);

const asObject = (payload: CommandPayload): Record<string, unknown> => (
  payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {}
);

const normalizeHttpUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (/^(?:blob|data|file):/i.test(value)) {
    return undefined;
  }

  try {
    const normalized = new URL(value).toString();
    return /^https?:\/\//i.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
};

const readOptionalTrimmedString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
};

const readOptionalHttpUrlString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined => normalizeHttpUrl(readOptionalTrimmedString(payload, ...keys));

const readRequiredHttpUrlString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string => {
  const rawValue = readOptionalTrimmedString(payload, ...keys);
  if (!rawValue) {
    throw new Error(`Missing required command payload field: ${keys[0]}`);
  }

  const normalized = normalizeHttpUrl(rawValue);
  if (normalized) {
    return normalized;
  }

  throw new Error(`Invalid command payload field: ${keys[0]}`);
};

const readRequiredTrimmedString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string => {
  const value = readOptionalTrimmedString(payload, ...keys);
  if (value) {
    return value;
  }
  throw new Error(`Missing required command payload field: ${keys[0]}`);
};

const normalizeOptionalLabel = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const isDirectPinterestMp4Url = (value: string): boolean => (
  /\.mp4(?:[?#]|$)/i.test(value) || /\/videos\/iht\/expmp4\//i.test(value)
);

const isPinterestManifestLikeUrl = (value: string): boolean => (
  /\.m3u8(?:[?#]|$)/i.test(value)
  || /\.cmfv(?:[?#]|$)/i.test(value)
  || /\/videos\/iht\/hls\//i.test(value)
);

const isPinterestVideoHintUrl = (value: string): boolean => (
  isDirectPinterestMp4Url(value) || isPinterestManifestLikeUrl(value)
);

const normalizeMediaType = (value: unknown): "video" | "image" | undefined => (
  value === "video" || value === "image" ? value : undefined
);

const resolvePayloadSiteHint = (payload: Record<string, unknown>): string | undefined => resolveSiteHint(
  readOptionalTrimmedString(payload, "siteHint", "site_hint"),
  readOptionalTrimmedString(payload, "pageUrl", "page_url"),
  readOptionalTrimmedString(payload, "url"),
  readOptionalTrimmedString(payload, "videoUrl", "video_url"),
);

const readOptionalVideoHintUrlString = (
  payload: Record<string, unknown>,
  siteHint: string | undefined,
  ...keys: string[]
): string | undefined => {
  const normalized = readOptionalHttpUrlString(payload, ...keys);
  if (!normalized) {
    return undefined;
  }

  const resolvedSiteHint = resolveSiteHint(siteHint, normalized);
  if (resolvedSiteHint === "pinterest") {
    return isPinterestVideoHintUrl(normalized) ? normalized : undefined;
  }

  return normalized;
};

const candidatePriority = (
  candidate: PinterestVideoCandidate,
  siteHint: string | undefined,
): number => {
  if (resolveSiteHint(siteHint, candidate.url) !== "pinterest") {
    return 0;
  }

  const type = candidate.type?.toLowerCase();
  if (type === "direct_mp4" || isDirectPinterestMp4Url(candidate.url)) {
    return 300;
  }
  if (type === "indirect_media") {
    return 200;
  }
  if (type === "manifest_m3u8" || isPinterestManifestLikeUrl(candidate.url)) {
    return 100;
  }
  return 0;
};

const normalizeVideoCandidateForSite = (
  candidate: unknown,
  siteHint: string | undefined,
): PinterestVideoCandidate | null => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const candidateRecord = candidate as Record<string, unknown>;
  const url = readOptionalVideoHintUrlString(candidateRecord, siteHint, "url");
  if (!url) {
    return null;
  }

  return {
    url,
    type: normalizeOptionalLabel(candidateRecord.type),
    source: normalizeOptionalLabel(candidateRecord.source),
    confidence: normalizeOptionalLabel(candidateRecord.confidence),
    mediaType: normalizeMediaType(candidateRecord.mediaType ?? candidateRecord.media_type),
  };
};

const normalizeVideoCandidates = (
  payload: Record<string, unknown>,
  siteHint: string | undefined,
): PinterestVideoCandidate[] => {
  const rawCandidates = payload.videoCandidates ?? payload.video_candidates;
  if (!Array.isArray(rawCandidates)) {
    return [];
  }

  const seen = new Set<string>();

  return rawCandidates
    .map((candidate, index) => ({
      candidate: normalizeVideoCandidateForSite(candidate, siteHint),
      index,
    }))
    .filter(
      (
        item,
      ): item is { candidate: PinterestVideoCandidate; index: number } => item.candidate !== null,
    )
    .filter((item) => {
      if (seen.has(item.candidate.url)) {
        return false;
      }
      seen.add(item.candidate.url);
      return true;
    })
    .sort((left, right) => {
      const scoreDelta = candidatePriority(right.candidate, siteHint)
        - candidatePriority(left.candidate, siteHint);
      return scoreDelta !== 0 ? scoreDelta : left.index - right.index;
    })
    .map((item) => item.candidate);
};

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeDragDiagnosticFlags = (
  value: unknown,
): PinterestDragDiagnosticFlags | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const flags = value as Record<string, unknown>;
  return {
    hasEmbeddedPayload: normalizeBoolean(flags.hasEmbeddedPayload),
    hasVideoTag: normalizeBoolean(flags.hasVideoTag),
    hasVideoList: normalizeBoolean(flags.hasVideoList),
    hasStoryPinData: normalizeBoolean(flags.hasStoryPinData),
    hasCarouselData: normalizeBoolean(flags.hasCarouselData),
    hasMp4: normalizeBoolean(flags.hasMp4),
    hasM3u8: normalizeBoolean(flags.hasM3u8),
    hasCmfv: normalizeBoolean(flags.hasCmfv),
    hasPinimgVideoHost: normalizeBoolean(flags.hasPinimgVideoHost),
  };
};

const normalizeDragDiagnostic = (
  payload: Record<string, unknown>,
  normalizedVideoCandidates: PinterestVideoCandidate[],
): PinterestDragDiagnostic | undefined => {
  const siteHint = resolvePayloadSiteHint(payload);
  if (siteHint !== "pinterest") {
    return undefined;
  }

  const rawDiagnostic = payload.dragDiagnostic ?? payload.drag_diagnostic;
  if (!rawDiagnostic || typeof rawDiagnostic !== "object" || Array.isArray(rawDiagnostic)) {
    return undefined;
  }

  const diagnostic = rawDiagnostic as Record<string, unknown>;
  const flags = normalizeDragDiagnosticFlags(diagnostic.flags);
  if (!flags) {
    return undefined;
  }

  const htmlLength = Number(diagnostic.htmlLength ?? diagnostic.html_length);
  const htmlPreview = readOptionalTrimmedString(diagnostic, "htmlPreview", "html_preview");

  if (!Number.isFinite(htmlLength) || htmlLength < 0 || !htmlPreview) {
    return undefined;
  }

  const dragCandidates = Array.isArray(diagnostic.videoCandidates)
    ? diagnostic.videoCandidates
        .map((candidate) => normalizeVideoCandidateForSite(candidate, "pinterest"))
        .filter((candidate): candidate is PinterestVideoCandidate => candidate !== null)
    : normalizedVideoCandidates;
  const imageUrl = readOptionalHttpUrlString(diagnostic, "imageUrl", "image_url") ?? null;
  const videoUrl = readOptionalVideoHintUrlString(
    diagnostic,
    "pinterest",
    "videoUrl",
    "video_url",
  ) ?? null;
  const videoCandidatesCountRaw = Number(
    diagnostic.videoCandidatesCount ?? diagnostic.video_candidates_count,
  );

  return {
    htmlLength,
    htmlPreview,
    flags,
    imageUrl,
    videoUrl,
    videoCandidatesCount: Number.isFinite(videoCandidatesCountRaw) && videoCandidatesCountRaw >= 0
      ? Math.floor(videoCandidatesCountRaw)
      : dragCandidates.length,
    videoCandidates: dragCandidates,
  };
};

const normalizeQueueVideoDownloadRequest = (
  payload: CommandPayload,
): QueuedVideoDownloadRequest => {
  const request = asObject(payload);
  const siteHint = resolvePayloadSiteHint(request);
  const normalizedVideoCandidates = normalizeVideoCandidates(request, siteHint);

  return {
    url: readRequiredHttpUrlString(request, "url"),
    pageUrl: readOptionalHttpUrlString(request, "pageUrl", "page_url"),
    videoUrl: readOptionalVideoHintUrlString(request, siteHint, "videoUrl", "video_url"),
    videoCandidates: normalizedVideoCandidates.length > 0 ? normalizedVideoCandidates : undefined,
    title: readOptionalTrimmedString(request, "title"),
    cookies: readOptionalTrimmedString(request, "cookies"),
    selectionScope: readOptionalTrimmedString(
      request,
      "selectionScope",
      "selection_scope",
    ) === "playlist"
      ? "playlist"
      : readOptionalTrimmedString(request, "selectionScope", "selection_scope") === "current_item"
        ? "current_item"
        : undefined,
    clipStartSec: (() => {
      const raw = request.clipStartSec ?? request.clip_start_sec;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    })(),
    clipEndSec: (() => {
      const raw = request.clipEndSec ?? request.clip_end_sec;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    })(),
    ytdlpQuality: (() => {
      const value = readOptionalTrimmedString(
        request,
        "ytdlpQuality",
        "ytdlpQualityPreference",
        "defaultVideoDownloadQuality",
      );
      return value === "best" || value === "balanced" || value === "data_saver"
        ? value
        : undefined;
    })(),
    siteHint,
    dragDiagnostic: normalizeDragDiagnostic(request, normalizedVideoCandidates),
  };
};

const normalizeCancelTraceId = (payload: CommandPayload): string => {
  const request = asObject(payload);
  return readRequiredTrimmedString(request, "traceId", "trace_id");
};

const normalizeBootstrapReason = (payload: CommandPayload): string | undefined => {
  const request = asObject(payload);
  return readOptionalTrimmedString(request, "reason");
};

export const isElectronRuntimeCommand = (
  command: FlowSelectRendererCommand,
): command is ElectronRuntimeCommand => supportedCommands.has(command as ElectronRuntimeCommand);

export const createElectronRuntimeCommandRouter = (
  options: ElectronRuntimeCommandRouterOptions,
): ElectronRuntimeCommandRouter => ({
  supports: isElectronRuntimeCommand,
  async invoke<TResult>(
    command: FlowSelectRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult> {
    switch (command) {
      case "queue_video_download":
        return await options.runtime.queueVideoDownload(
          normalizeQueueVideoDownloadRequest(payload),
        ) as TResult;
      case "cancel_download":
        return await options.runtime.cancelDownload(
          normalizeCancelTraceId(payload),
        ) as TResult;
      case "get_runtime_dependency_status":
        return options.runtime.getRuntimeDependencyStatus() as TResult;
      case "get_runtime_dependency_gate_state":
        return options.runtime.getRuntimeDependencyGateState() as TResult;
      case "refresh_runtime_dependency_gate_state":
        return options.runtime.refreshRuntimeDependencyGateState() as TResult;
      case "start_runtime_dependency_bootstrap":
        return await options.runtime.startRuntimeDependencyBootstrap(
          normalizeBootstrapReason(payload),
        ) as TResult;
      default:
        if (options.fallback) {
          return await options.fallback(command, payload) as TResult;
        }
        throw new Error(`Unsupported Electron runtime command: ${command}`);
    }
  },
});
