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
  error?: string;
};

export type VideoQueueTaskStatus = "active" | "pending";

export type VideoQueueTaskPayload = {
  traceId: string;
  label: string;
  status: VideoQueueTaskStatus;
};

export type VideoQueueStatePayload = {
  activeCount: number;
  pendingCount: number;
  totalCount: number;
  maxConcurrent: number;
};

export type VideoQueueDetailPayload = {
  tasks: VideoQueueTaskPayload[];
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

export type QueuedVideoDownloadRequest = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates?: VideoSelectionCandidate[];
  title?: string;
  cookies?: string;
  selectionScope?: "current_item" | "playlist";
  clipStartSec?: number;
  clipEndSec?: number;
  ytdlpQuality?: "best" | "balanced" | "data_saver";
  siteHint?: string;
  dragDiagnostic?: PinterestDragDiagnostic;
};

export type QueuedVideoDownloadAck = {
  accepted: boolean;
  traceId: string;
};

export type PinterestAsset = {
  url: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type PinterestRuntimePayload = {
  traceId: string;
  pageUrl: string;
  pinId: number;
  title: string;
  origin: string;
  cookiesHeader?: string | null;
  image: PinterestAsset;
  video?: PinterestAsset | null;
  outputDir: string;
};
