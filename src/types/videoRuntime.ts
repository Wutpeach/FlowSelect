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

export type PinterestVideoCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
};

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
  videoCandidates?: PinterestVideoCandidate[];
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
