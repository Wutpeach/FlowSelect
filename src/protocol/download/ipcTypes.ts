import type { RuntimeFailureDiagnostic } from "../../types/errorDiagnostics.js";
import type {
  AdvancedQualityOption,
  AdvancedQualityPostProcessPlan,
  LocalIntakeOrigin,
} from "../../application/download-api.js";

/**
 * Renderer IPC protocol DTOs (stable wire shapes: `file_path`, event keys,
 * queue/transcode payloads). Owned by the protocol layer; Domain/Application
 * must never import this module. The public advanced-quality option model and
 * the queue acknowledgement are canonical Application models re-exported here
 * so Renderer ergonomics are unchanged.
 */

export type DownloadStage =
  | "preparing"
  | "downloading"
  | "merging"
  | "post_processing";

export type DownloadProgressPayload = {
  traceId: string;
  percent: number;
  stage: DownloadStage;
  speed: string;
  eta: string;
};

export type DownloadResultPayload = {
  traceId: string;
  success: boolean;
  file_path?: string;
  title?: string;
  error?: string;
  failure?: RuntimeFailureDiagnostic;
};

export type VideoQueueTaskStatus = "active" | "pending";

export type VideoQueueTaskPhase =
  | "downloading"
  | "probing_quality"
  | "selecting_quality";

export type AdvancedQualityOptionPayload = AdvancedQualityOption;

export type { AdvancedQualityPostProcessPlan };

export type VideoQueueTaskPayload = {
  traceId: string;
  label: string;
  videoTitle?: string;
  status: VideoQueueTaskStatus;
  phase?: VideoQueueTaskPhase | null;
  qualityOptions?: AdvancedQualityOptionPayload[];
};

export type VideoQueueStatePayload = {
  activeCount: number;
  pendingCount: number;
  totalCount: number;
  maxConcurrent: number;
};

export type VideoQueueDetailPayload = {
  tasks: VideoQueueTaskPayload[];
  /** Transient cause present only on the snapshot emitted by new membership. */
  acceptedTraceId?: string;
  /** Valid only beside the same acceptedTraceId marker; never persisted. */
  acceptedIntakeOrigin?: LocalIntakeOrigin;
};

export type VideoTranscodeTaskStatus = "active" | "pending" | "failed";

export type VideoTranscodeStage =
  | "analyzing"
  | "transcoding"
  | "finalizing_mp4"
  | "failed";

export type VideoTranscodeQueueStatePayload = {
  activeCount: number;
  pendingCount: number;
  failedCount: number;
  totalCount: number;
  maxConcurrent: number;
};

export type VideoTranscodeTaskPayload = {
  traceId: string;
  label: string;
  status: VideoTranscodeTaskStatus;
  stage?: VideoTranscodeStage | null;
  progressPercent?: number | null;
  etaSeconds?: number | null;
  sourcePath?: string | null;
  sourceFormat?: string | null;
  targetFormat?: string | null;
  error?: string | null;
  failure?: RuntimeFailureDiagnostic | null;
};

export type VideoTranscodeQueueDetailPayload = {
  tasks: VideoTranscodeTaskPayload[];
};

export type VideoTranscodeCompletePayload = {
  traceId: string;
  label: string;
  sourcePath: string;
  filePath: string;
  sourceFormat?: string | null;
  targetFormat: string;
};

export type VideoSelectionCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
  mediaType?: "video" | "image";
};

export type PinterestVideoCandidate = VideoSelectionCandidate;

export type PinterestDragDiagnosticFlags = {
  hasEmbeddedPayload: boolean;
  hasVideoTag: boolean;
  hasVideoList: boolean;
  hasStoryPinData: boolean;
  hasCarouselData: boolean;
  hasMp4: boolean;
  hasM3u8: boolean;
  hasCmfv: boolean;
  hasPinimgVideoHost: boolean;
};

export type PinterestDragDiagnostic = {
  htmlLength: number;
  htmlPreview: string;
  flags: PinterestDragDiagnosticFlags;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidatesCount: number;
  videoCandidates: PinterestVideoCandidate[];
};

/**
 * Renderer wire queue request (developer ergonomics; validated in Main).
 * Raw advanced-quality selectors stay runtime-owned and are not part of the
 * public wire input.
 */
export type QueuedVideoDownloadRequest = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  selectedVideoVariant?: VideoSelectionCandidate;
  videoCandidates?: VideoSelectionCandidate[];
  title?: string;
  cookies?: string;
  selectionScope?: "current_item" | "playlist";
  clipStartSec?: number;
  clipEndSec?: number;
  videoQuality?: "best" | "balanced" | "data_saver";
  siteHint?: string;
  advancedQualityRequest?: boolean;
  extensionData?: {
    youtube?: {
      source?: "injected" | "pasted" | "context_menu";
    };
  };
  dragDiagnostic?: PinterestDragDiagnostic;
  diagnostics?: Record<string, unknown>;
};

export type PinterestAsset = {
  url: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};
