import type {
  AdvancedQualityOptionPayload,
  AdvancedQualityPostProcessPlan,
  DownloadProgressPayload,
  DownloadStage,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
  VideoQueueTaskPhase,
  VideoQueueTaskStatus,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeStage,
  VideoTranscodeTaskPayload,
  VideoTranscodeTaskStatus,
} from "../protocol/download/ipcTypes";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

// English fallback labels are comparison tokens from runtime progress, not UI copy.
const DEFAULT_STAGE_FALLBACK_LABELS: Record<DownloadStage, string> = {
  preparing: "Preparing...",
  downloading: "Downloading...",
  merging: "Merging...",
  post_processing: "Post-processing...",
};
const DOWNLOAD_ACTIVITY_TOKEN_PREFIX = "activity:";

const DOWNLOAD_STAGE_ORDER: Record<DownloadStage, number> = {
  preparing: 0,
  downloading: 1,
  merging: 2,
  post_processing: 3,
};

export const EMPTY_VIDEO_QUEUE_STATE: VideoQueueStatePayload = {
  activeCount: 0,
  pendingCount: 0,
  totalCount: 0,
  maxConcurrent: 1,
};

export const EMPTY_VIDEO_QUEUE_DETAIL: VideoQueueDetailPayload = {
  tasks: [],
};

export const EMPTY_VIDEO_TRANSCODE_QUEUE_STATE: VideoTranscodeQueueStatePayload = {
  activeCount: 0,
  pendingCount: 0,
  failedCount: 0,
  totalCount: 0,
  maxConcurrent: 1,
};

export const EMPTY_VIDEO_TRANSCODE_QUEUE_DETAIL: VideoTranscodeQueueDetailPayload = {
  tasks: [],
};

export const shouldShowVideoTaskBadge = ({
  totalTaskCount,
  isQueuePopoverOpen,
  isAdvancedQualitySelectionPopover,
}: {
  totalTaskCount: number;
  isQueuePopoverOpen: boolean;
  isAdvancedQualitySelectionPopover: boolean;
}): boolean => (
  !isAdvancedQualitySelectionPopover
  && (totalTaskCount > 1 || isQueuePopoverOpen)
);

const normalizeAdvancedQualityPostProcessPlan = (
  value: unknown,
): AdvancedQualityPostProcessPlan | undefined => (
  value === "none"
    || value === "remux_only"
    || value === "audio_transcode"
    || value === "full_transcode"
    || value === "unknown"
    ? value
    : undefined
);

const getDownloadStageLabel = (
  t: TranslateFn,
  stage: DownloadStage,
): string => {
  const translationKey = stage === "post_processing" ? "postProcessing" : stage;
  return t(`desktop:app.downloadStage.${translationKey}`);
};

export const getDownloadActivityLabel = (
  t: TranslateFn,
  value: string,
): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(DOWNLOAD_ACTIVITY_TOKEN_PREFIX)) {
    const activityKey = trimmed.slice(DOWNLOAD_ACTIVITY_TOKEN_PREFIX.length);
    if (!activityKey) {
      return null;
    }
    const fullKey = `desktop:app.downloadActivity.${activityKey}`;
    const translated = t(fullKey);
    return translated !== fullKey ? translated : null;
  }

  switch (trimmed) {
    case "Resolving media...":
      return t("desktop:app.downloadActivity.galleryDl.resolvingMedia");
    case "Collecting metadata...":
      return t("desktop:app.downloadActivity.galleryDl.collectingMetadata");
    case "Extracting media...":
      return t("desktop:app.downloadActivity.galleryDl.extractingMedia");
    case "Downloading media...":
      return t("desktop:app.downloadActivity.galleryDl.downloadingMedia");
    case "Checking existing file...":
      return t("desktop:app.downloadActivity.galleryDl.checkingExistingFile");
    case "Saving file...":
      return t("desktop:app.downloadActivity.galleryDl.savingFile");
    default:
      return null;
  }
};

export const getTranscodeStageLabel = (
  t: TranslateFn,
  stage: VideoTranscodeStage,
): string => {
  const translationKey = stage === "finalizing_mp4" ? "finalizingMp4" : stage;
  return t(`desktop:app.transcodeStage.${translationKey}`);
};

const formatEtaClock = (etaSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(etaSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const getTranscodeEtaLabel = (
  t: TranslateFn,
  etaSeconds: number | null | undefined,
): string | null => {
  if (typeof etaSeconds !== "number" || !Number.isFinite(etaSeconds) || etaSeconds < 0) {
    return null;
  }
  return t("desktop:app.downloadStatus.eta", {
    eta: formatEtaClock(etaSeconds),
  });
};

const joinStatusParts = (...parts: Array<string | null | undefined>): string =>
  parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" · ");

export const advanceDownloadStage = (
  previous: DownloadStage | null,
  incoming: DownloadStage,
  percent: number,
): DownloadStage => {
  if (!previous) return incoming;
  if (incoming === previous) return previous;
  if (percent >= 0 && incoming === "preparing") return previous;
  return DOWNLOAD_STAGE_ORDER[incoming] >= DOWNLOAD_STAGE_ORDER[previous] ? incoming : previous;
};

export const getDownloadStatusText = (
  t: TranslateFn,
  progress: DownloadProgressPayload,
  stage: DownloadStage | null,
): string => {
  const effectiveStage = stage ?? progress.stage;
  const stageLabel = getDownloadStageLabel(t, effectiveStage);
  const speedText = progress.speed.trim();
  const etaText = progress.eta.trim();
  const hasEta = etaText.length > 0 && etaText !== "N/A";
  const etaLabel = t("desktop:app.downloadStatus.eta", { eta: etaText });
  const activityLabel = getDownloadActivityLabel(t, speedText);

  if (effectiveStage === "preparing") {
    return activityLabel ?? stageLabel;
  }

  if (effectiveStage !== "downloading") {
    return stageLabel;
  }

  if (activityLabel) {
    return activityLabel;
  }

  if (
    !speedText
    || speedText === "gallery-dl"
    || speedText === stageLabel
    || speedText === DEFAULT_STAGE_FALLBACK_LABELS[effectiveStage]
  ) {
    if (hasEta) {
      return `${stageLabel} ${etaLabel}`;
    }
    return stageLabel;
  }

  if (hasEta) {
    return `${stageLabel} ${speedText} · ${etaLabel}`;
  }
  return `${stageLabel} ${speedText}`;
};

export const normalizeVideoQueueState = (
  payload: Partial<VideoQueueStatePayload> | null | undefined,
): VideoQueueStatePayload => {
  const safeActiveCount = Number.isFinite(payload?.activeCount)
    ? Math.max(0, Math.floor(payload?.activeCount ?? 0))
    : 0;
  const safePendingCount = Number.isFinite(payload?.pendingCount)
    ? Math.max(0, Math.floor(payload?.pendingCount ?? 0))
    : 0;
  const safeMaxConcurrent = Number.isFinite(payload?.maxConcurrent)
    ? Math.max(1, Math.floor(payload?.maxConcurrent ?? 1))
    : 1;

  return {
    activeCount: safeActiveCount,
    pendingCount: safePendingCount,
    totalCount: safeActiveCount + safePendingCount,
    maxConcurrent: safeMaxConcurrent,
  };
};

export const normalizeVideoQueueDetail = (
  payload: Partial<VideoQueueDetailPayload> | null | undefined,
): VideoQueueDetailPayload => {
  const tasks = Array.isArray(payload?.tasks)
    ? payload.tasks.flatMap((task) => {
        if (!task || typeof task.traceId !== "string" || typeof task.label !== "string") {
          return [];
        }
        const status: VideoQueueTaskStatus = task.status === "pending" ? "pending" : "active";
        const phase: VideoQueueTaskPhase | null = task.phase === "probing_quality"
          ? "probing_quality"
          : task.phase === "selecting_quality"
            ? "selecting_quality"
            : task.phase === "downloading"
              ? "downloading"
              : null;
        const qualityOptions: AdvancedQualityOptionPayload[] | undefined = Array.isArray(task.qualityOptions)
          ? task.qualityOptions.flatMap((option) => {
              if (!option || typeof option.id !== "string" || typeof option.label !== "string") {
                return [];
              }
              return [{
                id: option.id,
                label: option.label.trim() || option.id,
                tags: Array.isArray(option.tags)
                  ? option.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
                  : undefined,
                postProcessPlan: normalizeAdvancedQualityPostProcessPlan(option.postProcessPlan),
              }];
            })
          : undefined;
        const videoTitle = typeof task.videoTitle === "string" && task.videoTitle.trim().length > 0
          ? task.videoTitle.trim()
          : undefined;
        return [{
          traceId: task.traceId,
          label: task.label.trim() || task.traceId,
          videoTitle,
          status,
          phase,
          qualityOptions,
        }];
      })
    : [];
  const acceptedTraceId = typeof payload?.acceptedTraceId === "string"
    ? payload.acceptedTraceId.trim()
    : "";
  return {
    tasks,
    ...(acceptedTraceId.length > 0
      && tasks.some((task) => task.traceId === acceptedTraceId)
      ? { acceptedTraceId }
      : {}),
  };
};

const normalizeVideoTranscodeStage = (
  stage: unknown,
  status: VideoTranscodeTaskStatus,
): VideoTranscodeStage | null => {
  if (stage === "analyzing" || stage === "transcoding" || stage === "finalizing_mp4" || stage === "failed") {
    return stage;
  }
  return status === "failed" ? "failed" : null;
};

export const normalizeVideoTranscodeTask = (
  task: Partial<VideoTranscodeTaskPayload> | null | undefined,
): VideoTranscodeTaskPayload | null => {
  if (!task || typeof task.traceId !== "string" || typeof task.label !== "string") {
    return null;
  }

  const status: VideoTranscodeTaskStatus = task.status === "failed"
    ? "failed"
    : task.status === "pending"
      ? "pending"
      : "active";
  const safeProgressPercent = Number.isFinite(task.progressPercent)
    ? Math.max(0, Math.min(100, Number(task.progressPercent)))
    : null;
  const safeEtaSeconds = Number.isFinite(task.etaSeconds)
    ? Math.max(0, Math.floor(Number(task.etaSeconds)))
    : null;
  const trimOptional = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

  return {
    traceId: task.traceId,
    label: task.label.trim() || task.traceId,
    status,
    stage: normalizeVideoTranscodeStage(task.stage, status),
    progressPercent: safeProgressPercent,
    etaSeconds: safeEtaSeconds,
    sourcePath: trimOptional(task.sourcePath),
    sourceFormat: trimOptional(task.sourceFormat),
    targetFormat: trimOptional(task.targetFormat),
    error: trimOptional(task.error),
    failure: task.failure ?? null,
  };
};

export const normalizeVideoTranscodeQueueState = (
  payload: Partial<VideoTranscodeQueueStatePayload> | null | undefined,
): VideoTranscodeQueueStatePayload => {
  const safeActiveCount = Number.isFinite(payload?.activeCount)
    ? Math.max(0, Math.floor(payload?.activeCount ?? 0))
    : 0;
  const safePendingCount = Number.isFinite(payload?.pendingCount)
    ? Math.max(0, Math.floor(payload?.pendingCount ?? 0))
    : 0;
  const safeFailedCount = Number.isFinite(payload?.failedCount)
    ? Math.max(0, Math.floor(payload?.failedCount ?? 0))
    : 0;
  const safeMaxConcurrent = Number.isFinite(payload?.maxConcurrent)
    ? Math.max(1, Math.floor(payload?.maxConcurrent ?? 1))
    : 1;

  return {
    activeCount: safeActiveCount,
    pendingCount: safePendingCount,
    failedCount: safeFailedCount,
    totalCount: safeActiveCount + safePendingCount + safeFailedCount,
    maxConcurrent: safeMaxConcurrent,
  };
};

export const sortVideoTranscodeTasks = (tasks: VideoTranscodeTaskPayload[]): VideoTranscodeTaskPayload[] => {
  const grouped: Record<VideoTranscodeTaskStatus, VideoTranscodeTaskPayload[]> = {
    active: [],
    pending: [],
    failed: [],
  };

  for (const task of tasks) {
    grouped[task.status].push(task);
  }

  return [
    ...grouped.active,
    ...grouped.pending,
    ...grouped.failed,
  ];
};

export const normalizeVideoTranscodeQueueDetail = (
  payload: Partial<VideoTranscodeQueueDetailPayload> | null | undefined,
): VideoTranscodeQueueDetailPayload => ({
  tasks: Array.isArray(payload?.tasks)
    ? sortVideoTranscodeTasks(
        payload.tasks.flatMap((task) => {
          const normalized = normalizeVideoTranscodeTask(task);
          return normalized ? [normalized] : [];
        }),
      )
    : [],
});

export const upsertVideoTranscodeTask = (
  tasks: VideoTranscodeTaskPayload[],
  incoming: VideoTranscodeTaskPayload,
): VideoTranscodeTaskPayload[] =>
  sortVideoTranscodeTasks([
    ...tasks.filter((task) => task.traceId !== incoming.traceId),
    incoming,
  ]);

export const removeVideoTranscodeTask = (
  tasks: VideoTranscodeTaskPayload[],
  traceId: string,
): VideoTranscodeTaskPayload[] => tasks.filter((task) => task.traceId !== traceId);

export const mergeVideoTranscodeTask = (
  baseTask: VideoTranscodeTaskPayload,
  liveTask?: VideoTranscodeTaskPayload | null,
): VideoTranscodeTaskPayload => ({
  ...baseTask,
  ...(liveTask ?? {}),
  traceId: baseTask.traceId,
  label: liveTask?.label?.trim() || baseTask.label,
  status: liveTask?.status ?? baseTask.status,
});

export const getTranscodeTaskStatusText = (
  t: TranslateFn,
  task: VideoTranscodeTaskPayload,
  options?: { includePercent?: boolean },
): string => {
  const includePercent = options?.includePercent ?? true;
  if (task.status === "pending") {
    return t("desktop:app.queue.waiting");
  }

  const effectiveStage = task.stage ?? (task.status === "failed" ? "failed" : "analyzing");
  const stageLabel = getTranscodeStageLabel(t, effectiveStage);
  const etaLabel = getTranscodeEtaLabel(t, task.etaSeconds);

  if (task.status === "failed") {
    return stageLabel;
  }

  const progressPercent = task.progressPercent;
  if (includePercent && typeof progressPercent === "number" && Number.isFinite(progressPercent) && progressPercent >= 0) {
    return joinStatusParts(`${Math.round(progressPercent)}%`, stageLabel, etaLabel);
  }

  return joinStatusParts(stageLabel, etaLabel);
};

export const getVideoTranscodeTaskProgressPercent = (task: VideoTranscodeTaskPayload): number => {
  if (task.status === "pending") {
    return 8;
  }
  if (typeof task.progressPercent !== "number" || !Number.isFinite(task.progressPercent)) {
    return task.status === "failed" ? 18 : 22;
  }
  return Math.max(8, Math.min(100, task.progressPercent));
};

export const getVideoTranscodeFormatLabel = (task: VideoTranscodeTaskPayload): string | null => {
  if (!task.sourceFormat || !task.targetFormat) {
    return null;
  }
  return `${task.sourceFormat.toUpperCase()} -> ${task.targetFormat.toUpperCase()}`;
};
