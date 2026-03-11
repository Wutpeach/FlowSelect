import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "motion/react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { YtdlpVersionInfo } from "./types/ytdlp";
import {
  buildPinterestDragDiagnostic,
  extractEmbeddedPinterestDragPayload,
  extractPinterestVideoSelectionFromHtml,
  extractPinterestImageUrlFromHtml,
  isPinterestPinUrl,
  looksLikePinterestVideoHtml,
  type PinterestDragDiagnostic,
  type PinterestVideoCandidate,
} from "./utils/pinterest";
import { extractImageUrlFromHtml } from "./utils/imageDrag";
import { isVideoUrl } from "./utils/videoUrl";
import { saveOutputPath } from "./utils/outputPath";
import { useTheme } from "./contexts/ThemeContext";
import i18n from "./i18n";

// Helper function to check and show sequence overflow error
const checkSequenceOverflow = (error: unknown): boolean => {
  const errorStr = String(error);
  if (errorStr.includes("序号已用完")) {
    alert(i18n.t("desktop:app.sequenceOverflowMessage"));
    return true;
  }
  return false;
};

const isCancelledDownloadError = (error?: string | null): boolean => {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return normalized.includes("cancelled") || normalized.includes("canceled");
};

const summarizeDownloadError = (error?: string | null): string | null => {
  if (!error) return null;
  const summary = error
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!summary) return null;
  return summary.length > 96 ? `${summary.slice(0, 93)}...` : summary;
};

const resolveRenameMediaEnabled = (config: Record<string, unknown>): boolean => {
  if (typeof config.renameMediaOnDownload === "boolean") {
    return config.renameMediaOnDownload;
  }
  if (typeof config.videoKeepOriginalName === "boolean") {
    return !config.videoKeepOriginalName;
  }
  return false;
};

type DownloadStage = "preparing" | "downloading" | "merging" | "post_processing";

type DownloadProgressPayload = {
  traceId: string;
  percent: number;
  stage: DownloadStage;
  speed: string;
  eta: string;
};

type DownloadResult = {
  traceId: string;
  success: boolean;
  file_path?: string;
  error?: string;
};

type VideoQueueStatePayload = {
  activeCount: number;
  pendingCount: number;
  totalCount: number;
  maxConcurrent: number;
};

type VideoQueueTaskStatus = "active" | "pending";

type VideoQueueTaskPayload = {
  traceId: string;
  label: string;
  status: VideoQueueTaskStatus;
};

type VideoQueueDetailPayload = {
  tasks: VideoQueueTaskPayload[];
};

type QueuedVideoDownloadAck = {
  accepted: boolean;
  traceId: string;
};

type QueuedVideoDownloadRequest = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates?: PinterestVideoCandidate[];
  dragDiagnostic?: PinterestDragDiagnostic;
};

const pickDroppedUrl = (rawValue: string): string => {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return "";
  }

  const lines = rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => /^https?:\/\//i.test(line)) ?? rawValue.trim();
};

const mergePinterestVideoCandidates = (
  embeddedCandidates: PinterestVideoCandidate[],
  htmlCandidates: PinterestVideoCandidate[],
): PinterestVideoCandidate[] => {
  const merged: PinterestVideoCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of [...embeddedCandidates, ...htmlCandidates]) {
    if (!candidate?.url || seen.has(candidate.url)) {
      continue;
    }
    seen.add(candidate.url);
    merged.push(candidate);
  }

  return merged;
};

const DEFAULT_STAGE_FALLBACK_LABELS: Record<DownloadStage, string> = {
  preparing: "Preparing...",
  downloading: "Downloading...",
  merging: "Merging...",
  post_processing: "Post-processing...",
};

const getDownloadStageLabel = (stage: DownloadStage): string => {
  const translationKey = stage === "post_processing" ? "postProcessing" : stage;
  return i18n.t(`desktop:app.downloadStage.${translationKey}`);
};

const DOWNLOAD_STAGE_ORDER: Record<DownloadStage, number> = {
  preparing: 0,
  downloading: 1,
  merging: 2,
  post_processing: 3,
};

const advanceDownloadStage = (
  previous: DownloadStage | null,
  incoming: DownloadStage,
  percent: number,
): DownloadStage => {
  if (!previous) return incoming;
  if (incoming === previous) return previous;
  if (percent >= 0 && incoming === "preparing") return previous;
  return DOWNLOAD_STAGE_ORDER[incoming] >= DOWNLOAD_STAGE_ORDER[previous] ? incoming : previous;
};

const getDownloadStatusText = (
  progress: DownloadProgressPayload,
  stage: DownloadStage | null,
): string => {
  const effectiveStage = stage ?? progress.stage;
  const stageLabel = getDownloadStageLabel(effectiveStage);
  const speedText = progress.speed.trim();
  const etaText = progress.eta.trim();
  const hasEta = etaText.length > 0 && etaText !== "N/A";
  const etaLabel = i18n.t("desktop:app.downloadStatus.eta", { eta: etaText });

  if (effectiveStage !== "downloading") {
    return stageLabel;
  }

  if (!speedText || speedText === stageLabel || speedText === DEFAULT_STAGE_FALLBACK_LABELS[effectiveStage]) {
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

const EMPTY_VIDEO_QUEUE_STATE: VideoQueueStatePayload = {
  activeCount: 0,
  pendingCount: 0,
  totalCount: 0,
  maxConcurrent: 1,
};

const EMPTY_VIDEO_QUEUE_DETAIL: VideoQueueDetailPayload = {
  tasks: [],
};

const normalizeVideoQueueState = (
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

const normalizeVideoQueueDetail = (
  payload: Partial<VideoQueueDetailPayload> | null | undefined,
): VideoQueueDetailPayload => ({
  tasks: Array.isArray(payload?.tasks)
    ? payload.tasks.flatMap((task) => {
        if (!task || typeof task.traceId !== "string" || typeof task.label !== "string") {
          return [];
        }
        const status: VideoQueueTaskStatus = task.status === "pending" ? "pending" : "active";
        return [{
          traceId: task.traceId,
          label: task.label.trim() || task.traceId,
          status,
        }];
      })
    : [],
});

// Cat icon for minimized state
const CatIcon = ({ size = 40, glow = true }: { size?: number; glow?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    style={{ shapeRendering: 'geometricPrecision' }}
  >
    <defs>
      <linearGradient id="catGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#93c5fd" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
      <filter id="catGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path
      fill="url(#catGradient)"
      filter={glow ? "url(#catGlow)" : undefined}
      d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812"
    />
  </svg>
);

function App() {
  const { t } = useTranslation("desktop");
  const { colors } = useTheme();
  const isMacOS = navigator.userAgent.toLowerCase().includes("mac");
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadCancelled, setDownloadCancelled] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [isPanelHovered, setIsPanelHovered] = useState(false);
  const [downloadProgressByTrace, setDownloadProgressByTrace] = useState<Record<string, DownloadProgressPayload>>({});
  const [videoQueueState, setVideoQueueState] = useState<VideoQueueStatePayload>(EMPTY_VIDEO_QUEUE_STATE);
  const [videoQueueDetail, setVideoQueueDetail] = useState<VideoQueueDetailPayload>(EMPTY_VIDEO_QUEUE_DETAIL);
  const [cancellingTraceIds, setCancellingTraceIds] = useState<string[]>([]);
  const [isQueuePopoverOpen, setIsQueuePopoverOpen] = useState(false);
  const [ytdlpUpdate, setYtdlpUpdate] = useState<YtdlpVersionInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(true);
  const [windowResized, setWindowResized] = useState(false);
  const [showEdgeGlow, setShowEdgeGlow] = useState(true);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [isResetCounterHovered, setIsResetCounterHovered] = useState(false);
  const [isResetCounterActive, setIsResetCounterActive] = useState(false);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [isSettingsHovered, setIsSettingsHovered] = useState(false);
  const [isProgressCancelHovered, setIsProgressCancelHovered] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const resetCounterFeedbackTimerRef = useRef<number | null>(null);
  const isContextMenuOpenRef = useRef(false);
  const isDraggingRef = useRef(false);
  const cancellingTraceIdsRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanelHoveredRef = useRef(false);
  const queueBadgeButtonRef = useRef<HTMLButtonElement>(null);

  // Window size constants
  const FULL_SIZE = 200;
  const ICON_SIZE = 80;
  const EDGE_GLOW_TRIGGER_DISTANCE = 126;
  const EDGE_GLOW_RADIUS = 248;
  const EDGE_GLOW_BORDER_WIDTH = 2.2;
  const EDGE_GLOW_FALLOFF_EXPONENT = 0.58;
  const DRAG_GLOW_BORDER_WIDTH = 2.4;
  const WINDOW_EDGE_PADDING = 8;
  const CONTEXT_MENU_WIDTH = 176;
  const CONTEXT_MENU_HEIGHT = 80;
  const SETTINGS_WINDOW_WIDTH = 320;
  const SETTINGS_WINDOW_HEIGHT = 400;
  const SETTINGS_WINDOW_GAP = 16;
  const hasActiveDownloads = videoQueueState.activeCount > 0;
  const queueTasks = videoQueueDetail.tasks;
  const activeQueueTasks = queueTasks.filter((task) => task.status === "active");
  const primaryQueueTask = activeQueueTasks[0] ?? null;
  const primaryDownloadProgress = primaryQueueTask
    ? downloadProgressByTrace[primaryQueueTask.traceId] ?? null
    : null;
  const downloadProgress = primaryQueueTask
    ? primaryDownloadProgress ?? {
        traceId: primaryQueueTask.traceId,
        percent: -1,
        stage: "preparing" as DownloadStage,
        speed: getDownloadStageLabel("preparing"),
        eta: "",
      }
    : null;
  const downloadStage = primaryDownloadProgress?.stage ?? (primaryQueueTask ? "preparing" : null);

  const resetDownloadOutcome = useCallback(() => {
    setDownloadCancelled(false);
    setDownloadErrorMessage(null);
  }, []);

  const addCancellingTraceId = useCallback((traceId: string) => {
    setCancellingTraceIds((current) => {
      if (current.includes(traceId)) {
        return current;
      }
      const next = [...current, traceId];
      cancellingTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const removeCancellingTraceId = useCallback((traceId: string) => {
    setCancellingTraceIds((current) => {
      if (!current.includes(traceId)) {
        return current;
      }
      const next = current.filter((item) => item !== traceId);
      cancellingTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const updateContextMenuOpen = useCallback((open: boolean) => {
    isContextMenuOpenRef.current = open;
    setIsContextMenuOpen(open);
  }, []);

  const clearCancellingTraceIds = useCallback(() => {
    cancellingTraceIdsRef.current = new Set();
    setCancellingTraceIds([]);
  }, []);

  const closeContextMenuWindow = useCallback(async () => {
    const existing = await WebviewWindow.getByLabel("context-menu");
    if (existing) {
      await existing.close().catch(() => undefined);
    }
    updateContextMenuOpen(false);
  }, [updateContextMenuOpen]);

  // Expand window from icon mode
  const expandWindow = async () => {
    if (isMacOS || !windowResized) {
      setWindowResized(false);
      setIsMinimized(false);
      return;
    }

    try {
      // Expand window first, then animate
      const window = getCurrentWindow();
      const pos = await window.outerPosition();
      await Promise.all([
        invoke('set_window_size', { width: FULL_SIZE, height: FULL_SIZE }),
        invoke('set_window_position', { x: pos.x, y: pos.y }),
      ]);
      setWindowResized(false);
      setIsMinimized(false);
    } catch (err) {
      console.error('Failed to expand window:', err);
      setIsMinimized(false);
    }
  };

  // Shrink window after minimize animation completes
  const handleAnimationComplete = async () => {
    if (isMinimized && !windowResized && !isInitialMount) {
      if (isMacOS) {
        return;
      }
      try {
        // Shrink window - content is already at top-left due to transformOrigin
        setWindowResized(true);
        const window = getCurrentWindow();
        const pos = await window.outerPosition();
        await Promise.all([
          invoke('set_window_size', { width: ICON_SIZE, height: ICON_SIZE }),
          invoke('set_window_position', { x: pos.x, y: pos.y }),
        ]);
      } catch (err) {
        console.error('Failed to shrink window:', err);
      }
    }
  };

  const shouldShowEdgeGlow =
    isPanelHovered && !isHovering && !downloadProgress && !isMinimized && showEdgeGlow;
  const shouldShowDragGlow = isHovering && !downloadProgress && !isMinimized;
  const panelRadius = isMinimized ? 100 : 16;

  const getEdgeGlowOpacity = () => {
    const distanceToEdge = Math.min(
      mousePos.x,
      mousePos.y,
      FULL_SIZE - mousePos.x,
      FULL_SIZE - mousePos.y,
    );
    const normalized = Math.max(0, 1 - distanceToEdge / EDGE_GLOW_TRIGGER_DISTANCE);
    return Math.min(1, Math.pow(normalized, EDGE_GLOW_FALLOFF_EXPONENT) * 1.18);
  };

  const edgeGlowOpacity = getEdgeGlowOpacity();

  const getEdgeGlowStyle = (): CSSProperties => {
    return {
      position: 'absolute',
      inset: 0,
      borderRadius: panelRadius,
      pointerEvents: 'none',
      padding: EDGE_GLOW_BORDER_WIDTH,
      background: `radial-gradient(
        ${EDGE_GLOW_RADIUS}px circle at ${mousePos.x}px ${mousePos.y}px,
        rgba(59,130,246,1) 0%,
        rgba(96,165,250,0.98) 18%,
        rgba(125,211,252,0.72) 38%,
        rgba(147,197,253,0.36) 56%,
        rgba(191,219,254,0.14) 70%,
        transparent 84%
      )`,
      boxShadow: 'inset 0 0 14px rgba(96,165,250,0.18)',
      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      maskComposite: 'exclude',
      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      WebkitMaskComposite: 'xor',
    };
  };

  const getDragGlowStyle = (): CSSProperties => {
    return {
      position: 'absolute',
      inset: 0,
      borderRadius: panelRadius,
      pointerEvents: 'none',
      padding: DRAG_GLOW_BORDER_WIDTH,
      background: `linear-gradient(
        135deg,
        rgba(125,211,252,0.96) 0%,
        rgba(96,165,250,0.98) 35%,
        rgba(59,130,246,0.96) 65%,
        rgba(147,197,253,0.92) 100%
      )`,
      boxShadow: `
        inset 0 0 0 1px rgba(191,219,254,0.85),
        inset 0 0 22px rgba(59,130,246,0.28),
        inset 0 0 36px rgba(96,165,250,0.16)
      `,
      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      maskComposite: 'exclude',
      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      WebkitMaskComposite: 'xor',
    };
  };

  const applyRuntimeConfig = useCallback((config: Record<string, unknown>) => {
    if (typeof config.outputPath === "string") {
      setOutputPath(config.outputPath);
    }
    setRenameMediaOnDownload(resolveRenameMediaEnabled(config));
  }, []);

  const refreshYtdlpVersion = useCallback(async () => {
    try {
      console.log(">>> Checking yt-dlp version...");
      const result = await invoke<YtdlpVersionInfo>("check_ytdlp_version");
      console.log(">>> yt-dlp version check result:", result);
      setYtdlpUpdate(result.updateAvailable === true ? result : null);
    } catch (err) {
      console.error(">>> yt-dlp version check failed:", err);
    }
  }, []);

  const enqueueVideoDownload = useCallback((request: string | QueuedVideoDownloadRequest) => {
    resetDownloadOutcome();
    const payload = typeof request === "string" ? { url: request } : request;
    void invoke<QueuedVideoDownloadAck>("queue_video_download", payload).catch((err) => {
      console.error("Failed to queue video download:", err);
      checkSequenceOverflow(err);
      setDownloadCancelled(true);
      setDownloadErrorMessage(summarizeDownloadError(String(err)));
    });
  }, [resetDownloadOutcome]);

  const cancelVideoTask = useCallback(async (
    traceId: string,
    options?: { showCurrentTaskFeedback?: boolean },
  ) => {
    if (!traceId || cancellingTraceIdsRef.current.has(traceId)) {
      return;
    }

    addCancellingTraceId(traceId);
    if (options?.showCurrentTaskFeedback) {
      setDownloadCancelled(true);
      setDownloadErrorMessage(t("app.queue.cancellingCurrent"));
    }

    try {
      const cancelled = await invoke<boolean>("cancel_download", { traceId });
      if (!cancelled) {
        removeCancellingTraceId(traceId);
      }
    } catch (err) {
      removeCancellingTraceId(traceId);
      if (options?.showCurrentTaskFeedback) {
        setDownloadCancelled(false);
        setDownloadErrorMessage(null);
      }
      console.error("Failed to cancel download:", err);
    }
  }, [addCancellingTraceId, removeCancellingTraceId, t]);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        console.log("Loaded config:", configStr);
        const config = JSON.parse(configStr) as Record<string, unknown>;
        applyRuntimeConfig(config);
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };
    loadConfig();
  }, [applyRuntimeConfig, isMacOS]);

  // Startup animation: brief delay to trigger bounce effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialMount(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [isMacOS]);

  useEffect(() => {
    return () => {
      if (resetCounterFeedbackTimerRef.current !== null) {
        clearTimeout(resetCounterFeedbackTimerRef.current);
      }
    };
  }, []);

  // Listen for video download progress events
  useEffect(() => {
    const unlistenProgress = listen<DownloadProgressPayload>(
      "video-download-progress",
      async (event) => {
        const payload = event.payload;
        // 清除已有的 idle timer，防止下载中被最小化
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        // Set progress immediately (sync) before async operations
        setIsMinimized(false);
        setDownloadProgressByTrace((current) => {
          const previous = current[payload.traceId];
          const nextStage = advanceDownloadStage(previous?.stage ?? null, payload.stage, payload.percent);
          return {
            ...current,
            [payload.traceId]: {
              ...payload,
              stage: nextStage,
            },
          };
        });
        setDownloadErrorMessage(null);
        // 直接恢复窗口大小（避免闭包问题）
        if (!isMacOS) {
          try {
            const win = getCurrentWindow();
            const pos = await win.outerPosition();
            await Promise.all([
              invoke('set_window_size', { width: FULL_SIZE, height: FULL_SIZE }),
              invoke('set_window_position', { x: pos.x, y: pos.y }),
            ]);
            setWindowResized(false);
          } catch (err) {
            console.error('Failed to expand window for download:', err);
          }
        } else {
          setWindowResized(false);
        }
      }
    );
    const unlistenComplete = listen<DownloadResult>(
      "video-download-complete",
      (event) => {
        console.log(">>> [Frontend] video-download-complete received:", event);
        const payload = event.payload;
        setDownloadProgressByTrace((current) => {
          if (!current[payload.traceId]) {
            return current;
          }
          const next = { ...current };
          delete next[payload.traceId];
          return next;
        });
        const cancelled = cancellingTraceIdsRef.current.has(payload.traceId)
          || isCancelledDownloadError(payload?.error);
        removeCancellingTraceId(payload.traceId);
        const success = Boolean(payload?.success) && !cancelled;
        const errorSummary = summarizeDownloadError(payload?.error);

        setDownloadCancelled(!success);
        setDownloadErrorMessage(success ? null : errorSummary);
        if (!success) {
          console.error(">>> [Frontend] Video download failed:", payload?.error ?? "Unknown error");
        }
        setIsProcessing(true);
        setTimeout(() => setIsProcessing(false), 1500);

        // 下载完成后延迟5秒再启动 idle timer
        setTimeout(() => {
          if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
          }
          if (!isDraggingRef.current && !isPanelHoveredRef.current && !isContextMenuOpenRef.current) {
            idleTimerRef.current = window.setTimeout(() => {
              if (isDraggingRef.current || isPanelHoveredRef.current || isContextMenuOpenRef.current) return;
              setIsMinimized(true);
              setShowEdgeGlow(false);
            }, 3000);
          }
        }, 5000);
      }
    );
    return () => {
      unlistenProgress.then(fn => fn());
      unlistenComplete.then(fn => fn());
    };
  }, [isMacOS, removeCancellingTraceId]);

  // Listen for output path changes from settings window
  useEffect(() => {
    const unlisten = listen<{ path: string }>("output-path-changed", (event) => {
      setOutputPath(event.payload.path);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<void>("context-menu-closed", () => {
      updateContextMenuOpen(false);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateContextMenuOpen]);

  // Listen for devMode changes from settings window
  useEffect(() => {
    const unlisten = listen<{ enabled: boolean }>("devmode-changed", (event) => {
      setDevMode(event.payload.enabled);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Listen for rename toggle changes from settings window
  useEffect(() => {
    const unlisten = listen<{ enabled: boolean }>("rename-setting-changed", (event) => {
      setRenameMediaOnDownload(Boolean(event.payload.enabled));
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Listen for shortcut show event
  useEffect(() => {
    const unlisten = listen<void>("shortcut-show", async () => {
      // 如果窗口处于图标模式（已缩小），需要先恢复窗口大小
      if (windowResized && !isMacOS) {
        try {
          await invoke('set_window_size', { width: FULL_SIZE, height: FULL_SIZE });
          setWindowResized(false);
        } catch (err) {
          console.error('Failed to restore window size:', err);
        }
      } else {
        setWindowResized(false);
      }
      setIsMinimized(false);
      setShowEdgeGlow(false);
      setTimeout(() => setShowEdgeGlow(true), 500);

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (!hasActiveDownloads && !isDraggingRef.current && !isPanelHoveredRef.current && !isContextMenuOpenRef.current) {
        idleTimerRef.current = window.setTimeout(() => {
          if (isDraggingRef.current || isPanelHoveredRef.current || isContextMenuOpenRef.current) return;
          setIsMinimized(true);
          setShowEdgeGlow(false);
        }, 3000);
      }

      // 聚焦以接收粘贴事件
      setTimeout(() => {
        const container = document.querySelector('[tabIndex="0"]') as HTMLElement;
        if (container) container.focus();
      }, 100);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [windowResized, hasActiveDownloads, isMacOS]);

  // Check yt-dlp version on startup
  useEffect(() => {
    void refreshYtdlpVersion();
  }, [refreshYtdlpVersion]);

  // Sync yt-dlp version status with settings window updates
  useEffect(() => {
    const unlisten = listen<{ source: "main" | "settings" }>("ytdlp-version-refresh", (event) => {
      if (event.payload.source === "main") {
        return;
      }
      void refreshYtdlpVersion();
    });
    return () => { unlisten.then(fn => fn()); };
  }, [refreshYtdlpVersion]);

  useEffect(() => {
    const unlisten = listen<VideoQueueStatePayload>("video-queue-count", (event) => {
      const normalized = normalizeVideoQueueState(event.payload);
      setVideoQueueState(normalized);
      if (normalized.activeCount === 0) {
        setDownloadProgressByTrace((current) => (Object.keys(current).length === 0 ? current : {}));
      }
      if (normalized.totalCount === 0) {
        clearCancellingTraceIds();
        setIsQueuePopoverOpen(false);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [clearCancellingTraceIds]);

  useEffect(() => {
    const unlisten = listen<VideoQueueDetailPayload>("video-queue-detail", (event) => {
      const normalized = normalizeVideoQueueDetail(event.payload);
      setVideoQueueDetail(normalized);
      if (normalized.tasks.length === 0) {
        setIsQueuePopoverOpen(false);
      }
      const liveTraceIds = new Set(normalized.tasks.map((task) => task.traceId));
      setCancellingTraceIds((current) => {
        const next = current.filter((traceId) => liveTraceIds.has(traceId));
        if (next.length === current.length) {
          return current;
        }
        cancellingTraceIdsRef.current = new Set(next);
        return next;
      });
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Block F12 if devMode is disabled
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' && !devMode) {
        e.preventDefault();
        console.log("F12 blocked: devMode is disabled");
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [devMode]);

  // Idle auto-minimize: reset timer helper
  const resetIdleTimer = ({ expandIfMinimized = true }: { expandIfMinimized?: boolean } = {}) => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    const wasMinimized = isMinimized;

    // Use async expandWindow instead of direct setIsMinimized
    if (expandIfMinimized && wasMinimized) {
      expandWindow();
      setShowEdgeGlow(false);
      setTimeout(() => setShowEdgeGlow(true), 500);
      // 恢复后自动聚焦，确保能接收粘贴事件
      setTimeout(() => {
        const container = document.querySelector('[tabIndex="0"]') as HTMLElement;
        if (container) container.focus();
      }, 100);
    }

    // 下载进行中、拖拽中或鼠标仍停留在面板内时不启动 idle timer
    if (hasActiveDownloads || isDraggingRef.current || isPanelHoveredRef.current || isContextMenuOpenRef.current) return;

    idleTimerRef.current = window.setTimeout(() => {
      if (isDraggingRef.current || isPanelHoveredRef.current || isContextMenuOpenRef.current) return;
      setIsMinimized(true);
      setShowEdgeGlow(false); // 缩小时立即隐藏边缘光
    }, 3000);
  };

  // Start idle timer on mount
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // resetIdleTimer should run once on mount to bootstrap idle behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isContextMenuOpen) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    resetIdleTimer({ expandIfMinimized: false });
    // resetIdleTimer is intentionally omitted to avoid re-arming on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContextMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isContextMenuOpen) {
        return;
      }
      void closeContextMenuWindow();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContextMenuWindow, isContextMenuOpen]);

  // Handle window drag start - prevents minimize during drag
  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只响应左键

    if (isContextMenuOpen) {
      await closeContextMenuWindow();
      return;
    }

    if (isMinimized) {
      resetIdleTimer();
      return;
    }

    isDraggingRef.current = true;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    try {
      await getCurrentWindow().startDragging();
    } finally {
      // Windows 上 await 返回 = 拖拽结束
      isDraggingRef.current = false;
      resetIdleTimer();
    }
  };


  // Handle paste event - check for video URL first, then image URL, then clipboard files
  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();
    resetIdleTimer();

    const text = e.clipboardData.getData("text/plain");

    // 1. Check if clipboard text is a video URL (highest priority)
    if (text && isVideoUrl(text)) {
      console.log("Pasted video URL:", text);
      resetDownloadOutcome();
      enqueueVideoDownload(text);
      return;
    }

    // 2. Check if clipboard text is an image URL
    if (text && isImageUrl(text)) {
      console.log("Pasted image URL:", text);
      resetDownloadOutcome();
      setIsProcessing(true);
      try {
        // Distinguish between Data URL and HTTP URL
        if (text.startsWith("data:image/")) {
          const result = await invoke<string>("save_data_url", {
            dataUrl: text,
            targetDir: outputPath || null,
          });
          console.log("Save data URL result:", result);
        } else {
          const result = await invoke<string>("download_image", {
            url: text,
            targetDir: outputPath || null,
          });
          console.log("Download result:", result);
        }
      } catch (err) {
        console.error("Failed to process image:", err);
        checkSequenceOverflow(err);
      }
      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // 2. Otherwise, continue with file processing logic
    try {
      const paths = await invoke<string[]>("get_clipboard_files");

      if (paths && paths.length > 0) {
        console.log("Clipboard files from backend:", paths);
        resetDownloadOutcome();
        setIsProcessing(true);

        try {
          await invoke("process_files", {
            paths,
            targetDir: outputPath || null
          });
        } catch (err) {
          console.warn("Failed to process clipboard files:", err);
          checkSequenceOverflow(err);
        }

        setTimeout(() => setIsProcessing(false), 1000);
      } else {
        console.warn("No files in clipboard");
      }
    } catch (err) {
      console.warn("Failed to get clipboard files:", err);
    }
  };

  // Check if URL looks like an image
  const isImageUrl = (url: string): boolean => {
    // Support Data URL
    if (url.startsWith("data:image/")) {
      return true;
    }
    // Support file:// protocol (local files from apps like Feishu/Lark)
    if (url.startsWith("file://")) {
      const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
      return imageExtensions.test(url);
    }
    // HTTP URL check
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return false;
    }
    // Common image extensions or known image hosts
    const imagePatterns = [
      /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i,
      /images\./i,
      /img\./i,
      /i\.imgur\.com/i,
      /pbs\.twimg\.com/i,
      /cdn\.discordapp\.com/i,
    ];
    return imagePatterns.some(pattern => pattern.test(url));
  };

  // Handle native drop event for URL detection
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);

    // 1. 检测是否为本地文件夹拖拽（使用 webkitGetAsEntry）
    if (e.dataTransfer.items.length > 0) {
      const item = e.dataTransfer.items[0];
      const entry = (item as any).webkitGetAsEntry?.();

      if (entry?.isDirectory) {
        console.log("检测到文件夹拖拽，触发目录选择对话框");
        try {
          const selected = await open({
            directory: true,
            multiple: false,
            title: t("app.drop.directoryDialogTitle"),
          });

          if (selected && typeof selected === "string") {
            console.log("用户选择的路径:", selected);
            await saveOutputPath(selected);
            setOutputPath(selected);
            resetDownloadOutcome();
            setIsProcessing(true);
            setTimeout(() => setIsProcessing(false), 1000);
          }
        } catch (err) {
          console.error("打开目录选择器失败:", err);
        }
        return;
      }
    }

    // 2. Debug logging
    console.log("Drop types:", e.dataTransfer.types);
    console.log("text/uri-list:", e.dataTransfer.getData("text/uri-list"));
    console.log("text/plain:", e.dataTransfer.getData("text/plain"));
    console.log("text/html:", e.dataTransfer.getData("text/html"));
    // Also log files for debugging
    console.log("files:", e.dataTransfer.files.length, Array.from(e.dataTransfer.files).map(f => f.name));

    const html = e.dataTransfer.getData("text/html");
    const rawUriList = e.dataTransfer.getData("text/uri-list");
    const rawPlain = e.dataTransfer.getData("text/plain");
    const embeddedPinterestDragPayload =
      extractEmbeddedPinterestDragPayload(html) ??
      extractEmbeddedPinterestDragPayload(rawPlain) ??
      extractEmbeddedPinterestDragPayload(rawUriList);

    // Check for URL in dataTransfer
    // Note: text/uri-list may return "about:blank#blocked" due to security policy
    let url = pickDroppedUrl(rawUriList);
    if (!url || url === "about:blank#blocked" || url.startsWith("about:")) {
      url = pickDroppedUrl(rawPlain);
    }
    if ((!url || url === "about:blank#blocked" || url.startsWith("about:")) && embeddedPinterestDragPayload?.pageUrl) {
      url = embeddedPinterestDragPayload.pageUrl;
    }

    // === 优先处理本地文件 file:// URL ===
    if (url && url.startsWith("file://")) {
      const localPath = decodeURIComponent(url.replace("file:///", ""));
      console.log("Detected local file URL:", localPath);
      resetDownloadOutcome();
      setIsProcessing(true);

      try {
        const copyResult = await invoke<string>("process_files", {
          paths: [localPath],
          targetDir: outputPath || null,
        });
        console.log("Copy local file result:", copyResult);
      } catch (err) {
        console.error("Failed to copy local file:", err);
        checkSequenceOverflow(err);
      }

      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // === Pinterest special handling ===
    if (url && isPinterestPinUrl(url)) {
      const pinterestDragDiagnostic = buildPinterestDragDiagnostic(html);
      const hasEmbeddedVideoHint = Boolean(
        embeddedPinterestDragPayload?.videoUrl ||
        (embeddedPinterestDragPayload?.videoCandidates.length ?? 0) > 0,
      );
      console.log(
        "[Pinterest drag debug] payload:",
        JSON.stringify({
          pageUrl: url,
          looksLikeVideoHtml: looksLikePinterestVideoHtml(html),
          hasEmbeddedVideoHint,
          ...pinterestDragDiagnostic,
        }),
      );

      if (!looksLikePinterestVideoHtml(html) && !hasEmbeddedVideoHint) {
        const imageUrl = extractPinterestImageUrlFromHtml(html);
        if (imageUrl) {
          console.log("Detected Pinterest image pin, downloading extracted image:", imageUrl);
          resetDownloadOutcome();
          setIsProcessing(true);
          try {
            await invoke<string>("download_image", {
              url: imageUrl,
              targetDir: outputPath || null,
            });
          } catch (err) {
            console.error("Failed to download Pinterest image:", err);
            checkSequenceOverflow(err);
          }
          setTimeout(() => setIsProcessing(false), 1000);
          return;
        }
      }

      const videoSelection = extractPinterestVideoSelectionFromHtml(html);
      const mergedVideoCandidates = mergePinterestVideoCandidates(
        embeddedPinterestDragPayload?.videoCandidates ?? [],
        videoSelection.videoCandidates,
      );
      const mergedVideoUrl =
        embeddedPinterestDragPayload?.videoUrl ?? videoSelection.videoUrl ?? undefined;
      console.log("Detected Pinterest video pin, queueing Pinterest media resolution:", {
        pageUrl: url,
        hasVideoUrl: Boolean(mergedVideoUrl),
        videoCandidatesCount: mergedVideoCandidates.length,
        topVideoCandidates: mergedVideoCandidates.slice(0, 4),
      });
      resetDownloadOutcome();
      enqueueVideoDownload({
        url,
        pageUrl: embeddedPinterestDragPayload?.pageUrl ?? url,
        videoUrl: mergedVideoUrl,
        videoCandidates: mergedVideoCandidates,
        dragDiagnostic: pinterestDragDiagnostic,
      });
      return;
    }

    const htmlImageUrl = extractImageUrlFromHtml(html, {
      baseUrl: /^https?:\/\//i.test(url) ? url : null,
    });
    const resolvedImageUrl =
      url && isImageUrl(url) ? url : (!url || !isVideoUrl(url) ? htmlImageUrl : null);

    // Check if it's a video URL (highest priority)
    if (url && isVideoUrl(url)) {
      console.log("Detected video URL:", url);
      resetDownloadOutcome();
      enqueueVideoDownload(url);
      return;
    }

    // Check if it's an image URL
    if (resolvedImageUrl && isImageUrl(resolvedImageUrl)) {
      if (resolvedImageUrl !== url) {
        console.log("Detected image URL from HTML fallback:", {
          pageUrl: url || null,
          imageUrl: resolvedImageUrl,
        });
      } else {
        console.log("Detected image URL:", resolvedImageUrl);
      }
      resetDownloadOutcome();
      setIsProcessing(true);

      try {
        // Distinguish between Data URL, file:// URL, and HTTP URL
        if (resolvedImageUrl.startsWith("data:image/")) {
          const result = await invoke<string>("save_data_url", {
            dataUrl: resolvedImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Save data URL result:", result);
        } else if (resolvedImageUrl.startsWith("file://")) {
          // Convert file:// URL to local path
          const localPath = decodeURIComponent(resolvedImageUrl.replace("file:///", ""));
          console.log("Detected local file:", localPath);

          // First try to copy from local path
          const copyResult = await invoke<string>("process_files", {
            paths: [localPath],
            targetDir: outputPath || null,
          });
          console.log("Copy result:", copyResult);

          // If copy failed (0 files), try reading from dataTransfer.files
          if (copyResult.includes("Copied 0 files") && e.dataTransfer.files.length > 0) {
            console.log("Local file not found, trying dataTransfer.files...");
            for (const file of Array.from(e.dataTransfer.files)) {
              if (!file.type.startsWith("image/")) {
                console.log("Skipping non-image file:", file.name);
                continue;
              }
              try {
                const arrayBuffer = await file.arrayBuffer();
                const base64 = btoa(
                  new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
                );
                const dataUrl = `data:${file.type};base64,${base64}`;
                const saveResult = await invoke<string>("save_data_url", {
                  dataUrl,
                  targetDir: outputPath || null,
                  originalFilename: file.name,
                });
                console.log("Save from dataTransfer.files result:", saveResult);
              } catch (fileErr) {
                console.error("Failed to process file:", file.name, fileErr);
                checkSequenceOverflow(fileErr);
              }
            }
          }
        } else {
          const result = await invoke<string>("download_image", {
            url: resolvedImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Download result:", result);
        }
      } catch (err) {
        console.error("Failed to process image:", err);
        checkSequenceOverflow(err);
      }

      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // If URL not recognized but files exist, try reading from dataTransfer.files
    if (e.dataTransfer.files.length > 0) {
      console.log("URL not recognized, trying dataTransfer.files...");
      resetDownloadOutcome();
      setIsProcessing(true);

      // 收集所有文件路径
      const filePaths: string[] = [];
      for (const file of Array.from(e.dataTransfer.files)) {
        // 尝试获取本地路径 (Electron/Tauri 环境)
        const path = (file as any).path;
        if (path) {
          filePaths.push(path);
        }
      }

      if (filePaths.length > 0) {
        // 有本地路径，直接复制文件
        try {
          const copyResult = await invoke<string>("process_files", {
            paths: filePaths,
            targetDir: outputPath || null,
          });
          console.log("Copy result:", copyResult);
        } catch (err) {
          console.error("Failed to copy files:", err);
          checkSequenceOverflow(err);
        }
      } else {
        // 无本地路径，尝试读取文件内容并保存
        for (const file of Array.from(e.dataTransfer.files)) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
            );
            const mimeType = file.type || "application/octet-stream";
            const dataUrl = `data:${mimeType};base64,${base64}`;
            await invoke<string>("save_data_url", {
              dataUrl,
              targetDir: outputPath || null,
              originalFilename: file.name,
            });
          } catch (fileErr) {
            console.error("Failed to process file:", file.name, fileErr);
            checkSequenceOverflow(fileErr);
          }
        }
      }

      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // If not a URL and no files, let Tauri handle it
    console.log("Not an image URL and no files, letting Tauri handle it");
  };

  // Open settings window
  const openSettings = async () => {
    if (isContextMenuOpen) {
      await closeContextMenuWindow();
    }

    const existing = await WebviewWindow.getByLabel("settings");
    if (existing) {
      await existing.setFocus();
      return;
    }

    const currentWindow = getCurrentWindow();
    let settingsPosition: { x: number; y: number } | null = null;
    try {
      const [outerPosition, outerSize, scaleFactor, monitor] = await Promise.all([
        currentWindow.outerPosition(),
        currentWindow.outerSize(),
        currentWindow.scaleFactor(),
        currentMonitor(),
      ]);

      const gapPx = SETTINGS_WINDOW_GAP * scaleFactor;
      const edgePaddingPx = WINDOW_EDGE_PADDING * scaleFactor;
      const settingsWidthPx = SETTINGS_WINDOW_WIDTH * scaleFactor;
      const settingsHeightPx = SETTINGS_WINDOW_HEIGHT * scaleFactor;
      let x = outerPosition.x + outerSize.width + gapPx;
      let y = outerPosition.y;

      if (monitor) {
        const monitorX = monitor.position.x;
        const monitorY = monitor.position.y;
        const minX = monitorX + edgePaddingPx;
        const minY = monitorY + edgePaddingPx;
        const maxX = monitorX + monitor.size.width - settingsWidthPx - edgePaddingPx;
        const maxY = monitorY + monitor.size.height - settingsHeightPx - edgePaddingPx;

        if (x > maxX) {
          x = outerPosition.x - settingsWidthPx - gapPx;
        }

        x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
        y = Math.min(Math.max(y, minY), Math.max(minY, maxY));
      }

      settingsPosition = {
        x: x / scaleFactor,
        y: y / scaleFactor,
      };
    } catch (err) {
      console.error("Failed to resolve settings window position:", err);
    }

    const baseOptions = {
      url: "/settings",
      title: t("app.windows.settingsTitle"),
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      decorations: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      shadow: false,
    };

    if (settingsPosition) {
      new WebviewWindow("settings", {
        ...baseOptions,
        center: false,
        x: settingsPosition.x,
        y: settingsPosition.y,
      });
      return;
    }

    new WebviewWindow("settings", {
      ...baseOptions,
      center: true,
    });
  };

  const resetRenameCounter = async () => {
    try {
      await invoke<boolean>("reset_rename_counter");
    } catch (err) {
      console.error("Failed to reset rename counter:", err);
    }
  };

  const handleResetRenameCounter = async () => {
    if (resetCounterFeedbackTimerRef.current !== null) {
      clearTimeout(resetCounterFeedbackTimerRef.current);
    }
    setIsResetCounterActive(true);
    resetCounterFeedbackTimerRef.current = window.setTimeout(() => {
      setIsResetCounterActive(false);
      resetCounterFeedbackTimerRef.current = null;
    }, 600);
    await resetRenameCounter();
  };

  // Handle yt-dlp update
  const handleYtdlpUpdate = async () => {
    setIsUpdating(true);
    try {
      await invoke<string>("update_ytdlp");
      await emit("ytdlp-version-refresh", { source: "main" });
      await refreshYtdlpVersion();
    } catch (err) {
      console.error("Failed to update yt-dlp:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  // 右键菜单
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetIdleTimer();

    try {
      await closeContextMenuWindow();

      const currentWindow = getCurrentWindow();
      const [outerPosition, scaleFactor, monitor] = await Promise.all([
        currentWindow.outerPosition(),
        currentWindow.scaleFactor(),
        currentMonitor(),
      ]);

      const logicalWindowPosition = new PhysicalPosition(outerPosition).toLogical(scaleFactor);
      let x = logicalWindowPosition.x + e.clientX;
      let y = logicalWindowPosition.y + e.clientY;

      if (monitor) {
        const monitorX = monitor.position.x / scaleFactor;
        const monitorY = monitor.position.y / scaleFactor;
        const monitorWidth = monitor.size.width / scaleFactor;
        const monitorHeight = monitor.size.height / scaleFactor;
        const minX = monitorX + WINDOW_EDGE_PADDING;
        const minY = monitorY + WINDOW_EDGE_PADDING;
        const maxX = monitorX + monitorWidth - CONTEXT_MENU_WIDTH - WINDOW_EDGE_PADDING;
        const maxY = monitorY + monitorHeight - CONTEXT_MENU_HEIGHT - WINDOW_EDGE_PADDING;

        x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
        y = Math.min(Math.max(y, minY), Math.max(minY, maxY));
      } else {
        const screenWidth = window.screen.availWidth;
        const screenHeight = window.screen.availHeight;
        const minX = WINDOW_EDGE_PADDING;
        const minY = WINDOW_EDGE_PADDING;
        const maxX = screenWidth - CONTEXT_MENU_WIDTH - WINDOW_EDGE_PADDING;
        const maxY = screenHeight - CONTEXT_MENU_HEIGHT - WINDOW_EDGE_PADDING;

        x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
        y = Math.min(Math.max(y, minY), Math.max(minY, maxY));
      }

      new WebviewWindow("context-menu", {
        url: "/context-menu",
        title: t("app.windows.contextMenuTitle"),
        x,
        y,
        width: CONTEXT_MENU_WIDTH,
        height: CONTEXT_MENU_HEIGHT,
        decorations: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        shadow: false,
        focus: true,
        parent: "main",
      });
      updateContextMenuOpen(true);
    } catch (err) {
      updateContextMenuOpen(false);
      console.error("Failed to open context menu window:", err);
    }
  };

  const shouldShowMiniControls = isPanelHovered && !isMinimized;
  const containerBoxShadow = downloadProgress
    ? `inset 0 0 0 1px ${colors.borderStart}, inset 0 0 12px ${colors.accentGlow}`
    : isHovering
      ? `inset 0 0 0 1px ${colors.accentBorder}, inset 0 0 24px ${colors.accentGlow}, inset 0 0 42px ${colors.accentSurfaceStrong}`
      : `inset 0 0 0 1px ${colors.borderStart}`;
  const miniControlStyle: CSSProperties = {
    position: 'absolute',
    width: 16,
    height: 16,
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: shouldShowMiniControls ? 1 : 0,
    transition: 'opacity 0.2s ease',
    transitionDelay: !isMinimized ? '0.2s' : '0s',
    pointerEvents: shouldShowMiniControls ? 'auto' : 'none',
    zIndex: 10,
  };
  const isPrimaryTaskCancelling = primaryQueueTask
    ? cancellingTraceIds.includes(primaryQueueTask.traceId)
    : false;
  const getQueueTaskProgressText = (task: VideoQueueTaskPayload): string => {
    if (cancellingTraceIds.includes(task.traceId)) {
      return t("app.queue.cancelling");
    }
    if (task.status === "pending") {
      return t("app.queue.waiting");
    }
    const progress = downloadProgressByTrace[task.traceId];
    if (!progress) {
      return t("app.downloadStage.preparing");
    }
    const statusText = getDownloadStatusText(progress, progress.stage);
    return progress.percent < 0
      ? statusText
      : t("app.queue.percentStatus", {
          percent: Math.round(progress.percent),
          status: statusText,
        });
  };
  const getQueueTaskProgressPercent = (task: VideoQueueTaskPayload): number => {
    if (task.status !== "active") {
      return 8;
    }
    const progress = downloadProgressByTrace[task.traceId];
    if (!progress || progress.percent < 0) {
      return 18;
    }
    return Math.max(8, Math.min(100, progress.percent));
  };
  const downloadStatusText = downloadProgress
    ? getDownloadStatusText(downloadProgress, downloadStage)
    : "";
  const queueStatusText = isPrimaryTaskCancelling
    ? t("app.queue.cancellingCurrent")
    : videoQueueState.pendingCount > 0
      ? t("app.queue.queuedNext", { count: videoQueueState.pendingCount })
      : videoQueueState.totalCount > 1
        ? t("app.queue.tasksInQueue", { count: videoQueueState.totalCount })
        : "";
  const showVideoTaskBadge = videoQueueState.totalCount > 1 || isQueuePopoverOpen;
  const queueViewTitle = t("app.queue.title");
  const queueViewMeta = t("app.queue.meta", {
    active: videoQueueState.activeCount,
    queued: videoQueueState.pendingCount,
  });

  return (
    <motion.div
      ref={containerRef}
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        console.log("DragOver types:", e.dataTransfer.types);
        resetIdleTimer();
        const hasFiles = e.dataTransfer.files.length > 0 || e.dataTransfer.types.includes("Files");
        const hasUrl = e.dataTransfer.types.includes("text/uri-list")
          || e.dataTransfer.types.includes("text/plain");
        if ((hasFiles || hasUrl) && !isHovering) {
          setIsHovering(true);
        }
      }}
      onDrop={handleDrop}
      onDragLeave={() => setIsHovering(false)}
      onPaste={handlePaste}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        isPanelHoveredRef.current = true;
        setIsPanelHovered(true);
        resetIdleTimer();
        containerRef.current?.focus();
      }}
      onMouseLeave={() => {
        isPanelHoveredRef.current = false;
        setIsPanelHovered(false);
        resetIdleTimer({ expandIfMinimized: false });
      }}
      onMouseDown={handleDragStart}
      onMouseUp={() => {
        resetIdleTimer();
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }}
      onContextMenu={handleContextMenu}
      initial={false}
      animate={{
        scale: isInitialMount ? 0 : (isMinimized ? 0.3 : 1),
        borderRadius: isMinimized ? 100 : 16,
      }}
      transition={{
        scale: isInitialMount
          ? { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }
          : { type: 'spring', stiffness: 400, damping: 30 },
        borderRadius: isInitialMount
          ? { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }
          : { type: 'spring', stiffness: 400, damping: 30 },
      }}
      onAnimationComplete={handleAnimationComplete}
      style={{
        width: FULL_SIZE,
        height: FULL_SIZE,
        transformOrigin: 'top left',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        outline: 'none',
        borderRadius: panelRadius,
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
        border: 'none',
        boxShadow: containerBoxShadow,
        willChange: 'transform',
      }}
    >
      {/* Edge glow layer - follows mouse */}
      <AnimatePresence>
        {shouldShowEdgeGlow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: edgeGlowOpacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08, ease: 'linear' }}
            style={getEdgeGlowStyle()}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shouldShowDragGlow && (
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={getDragGlowStyle()}
          />
        )}
      </AnimatePresence>

      {showVideoTaskBadge ? (
        <>
          <button
            ref={queueBadgeButtonRef}
            onClick={() => setIsQueuePopoverOpen((current) => !current)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              minWidth: 42,
              height: 30,
              borderRadius: 15,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: isQueuePopoverOpen
                ? `linear-gradient(135deg, ${colors.queueCloseBg} 0%, ${colors.queueCloseGlow} 100%)`
                : `linear-gradient(135deg, ${colors.queueBadgeBg} 0%, ${colors.queueBadgeGlow} 100%)`,
              color: isQueuePopoverOpen ? colors.queueCloseIcon : colors.queueBadgeText,
              border: isQueuePopoverOpen
                ? `1px solid ${colors.queueCloseBorder}`
                : `1px solid ${colors.queueBadgeBorder}`,
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              userSelect: 'none',
              zIndex: 30,
              boxShadow: isQueuePopoverOpen
                ? `0 10px 18px ${colors.progressCancelHoverBg}`
                : `0 10px 18px ${colors.queueBadgeShadow}, ${colors.panelShadow}`,
              backdropFilter: 'blur(12px)',
              cursor: 'pointer',
              transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
            }}
            aria-pressed={isQueuePopoverOpen}
            aria-label={t("app.queue.currentTasksAria", { count: videoQueueState.totalCount })}
            title={isQueuePopoverOpen ? t("app.queue.closeList") : t("app.queue.showList")}
          >
            {isQueuePopoverOpen ? (
              <svg
                width="11"
                height="11"
                viewBox="0 0 10 10"
                style={{ color: colors.queueCloseIcon, pointerEvents: 'none' }}
              >
                <path
                  d="M2 2L8 8M8 2L2 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: colors.queueBadgeDot,
                    boxShadow: `0 0 10px ${colors.queueBadgeDot}`,
                    flexShrink: 0,
                    pointerEvents: 'none',
                  }}
                />
                <span style={{ pointerEvents: 'none' }}>{videoQueueState.totalCount}</span>
              </>
            )}
          </button>

          <AnimatePresence>
            {isQueuePopoverOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: 8, scale: 0.98, filter: 'blur(2px)' }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '48px 10px 10px',
                  borderRadius: isMinimized ? 100 : 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                  boxShadow: `inset 0 0 0 1px ${colors.queueBadgeBorder}, inset 0 0 18px ${colors.queueStatusBg}`,
                  backdropFilter: 'blur(16px)',
                  zIndex: 25,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    padding: '0 4px 2px',
                  }}
                >
                  <span
                    style={{
                      fontSize: 8,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: colors.textSecondary,
                      opacity: 0.76,
                      lineHeight: 1,
                      userSelect: 'none',
                    }}
                  >
                    {t("app.queue.label")}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: colors.textPrimary,
                      lineHeight: 1,
                      userSelect: 'none',
                    }}
                  >
                    {queueViewTitle}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: colors.textSecondary,
                      lineHeight: 1.2,
                      userSelect: 'none',
                    }}
                  >
                    {queueViewMeta}
                  </span>
                </div>

                <div
                  className="hide-scrollbar"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    paddingRight: 2,
                  }}
                >
                  {queueTasks.map((task) => {
                    const isTaskCancelling = cancellingTraceIds.includes(task.traceId);
                    return (
                      <div
                        key={task.traceId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 9px',
                          borderRadius: 8,
                          background: `linear-gradient(180deg, ${colors.bgPrimary} 0%, ${colors.bgSecondary} 100%)`,
                          border: `1px solid ${colors.borderStart}`,
                          boxShadow: `inset 0 0 0 1px ${colors.borderStart}, ${colors.panelShadow}`,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                flexShrink: 0,
                                backgroundColor: task.status === 'pending'
                                  ? colors.queueBadgeDot
                                  : colors.progressFgStroke,
                                boxShadow: task.status === 'pending'
                                  ? `0 0 8px ${colors.queueBadgeDot}`
                                  : `0 0 10px ${colors.progressFgStroke}`,
                              }}
                            />
                            <span
                              title={task.label}
                              style={{
                                fontSize: 10,
                                lineHeight: 1.2,
                                color: colors.textPrimary,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {task.label}
                            </span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: 6,
                              borderRadius: 999,
                              background: `linear-gradient(90deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                              overflow: 'hidden',
                              boxShadow: `inset 0 0 0 1px ${colors.borderStart}`,
                            }}
                          >
                            <div
                              style={{
                                width: `${getQueueTaskProgressPercent(task)}%`,
                                height: '100%',
                                borderRadius: 999,
                                background: task.status === 'pending'
                                  ? `linear-gradient(90deg, ${colors.queueBadgeDot} 0%, ${colors.queueBadgeGlow} 100%)`
                                  : `linear-gradient(90deg, ${colors.progressFgStroke} 0%, ${colors.progressText} 100%)`,
                                boxShadow: task.status === 'pending'
                                  ? `0 0 12px ${colors.queueBadgeShadow}`
                                  : `0 0 12px ${colors.progressFgStroke}`,
                                transition: 'width 0.2s ease',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 9, lineHeight: 1.1, color: colors.textSecondary }}>
                            {getQueueTaskProgressText(task)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            void cancelVideoTask(task.traceId);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          disabled={isTaskCancelling}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: 'none',
                            backgroundColor: isTaskCancelling
                              ? colors.queueStatusBg
                              : 'transparent',
                            cursor: isTaskCancelling ? 'default' : 'pointer',
                            opacity: isTaskCancelling ? 0.6 : 1,
                            flexShrink: 0,
                            transition: 'background-color 0.2s ease',
                          }}
                          title={isTaskCancelling ? t("app.queue.cancellingTask") : t("app.queue.cancelTask")}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            style={{ color: colors.progressCancelIcon, transition: 'color 0.2s' }}
                          >
                            <path
                              d="M2 2L8 8M8 2L2 8"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}

      {/* Close button - top right circle */}
      <button
        onClick={async () => {
          setShowEdgeGlow(false);
          await closeContextMenuWindow().catch(() => undefined);
          try {
            await getCurrentWindow().hide();
          } catch (err) {
            console.error("Failed to hide main window:", err);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setIsCloseHovered(true)}
        onMouseLeave={() => setIsCloseHovered(false)}
        style={{
          top: 8,
          right: 8,
          ...miniControlStyle,
          cursor: 'pointer',
        }}
        title={t("app.actions.hideWindow")}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: isCloseHovered ? colors.dangerSolid : colors.controlMuted,
            boxShadow: isCloseHovered ? `0 0 6px ${colors.dangerGlow}` : 'none',
            transition: 'background-color 0.2s ease',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      </button>

      {/* 中央图标 */}
      <AnimatePresence mode="wait">
        {downloadProgress ? (
          <motion.div
            key="progress"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <div style={{
              position: 'relative',
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                style={{
                  transform: 'rotate(-90deg)',
                  display: 'block',
                }}
              >
                <circle
                  cx="24" cy="24" r="20"
                  fill="none"
                  stroke={colors.progressBgStroke}
                  strokeWidth="4"
                />
                <circle
                  cx="24" cy="24" r="20"
                  fill="none"
                  stroke={colors.progressFgStroke}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 20}
                  strokeDashoffset={downloadProgress.percent < 0
                    ? 2 * Math.PI * 20 * 0.75  // Indeterminate: show 25% arc
                    : 2 * Math.PI * 20 * (1 - downloadProgress.percent / 100)}
                  style={{
                    transition: downloadProgress.percent < 0 ? 'none' : 'stroke-dashoffset 0.3s ease',
                    animation: downloadProgress.percent < 0 ? 'spin 1s linear infinite' : 'none',
                    transformOrigin: 'center',
                  }}
                />
              </svg>
              <span style={{
                position: 'absolute',
                fontSize: 11,
                fontWeight: 500,
                color: colors.progressText,
                textAlign: 'center',
                userSelect: 'none',
                pointerEvents: 'none',
              }}>
                {downloadProgress.percent < 0
                  ? '...'
                  : `${Math.round(downloadProgress.percent)}%`}
              </span>
            </div>
            {downloadStatusText ? (
              <span style={{ fontSize: 10, color: colors.progressSpeedText, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>
                {downloadStatusText}
              </span>
            ) : null}
            {queueStatusText ? (
              <span
                style={{
                  fontSize: 9,
                  color: colors.queueBadgeText,
                  backgroundColor: colors.queueStatusBg,
                  border: `1px solid ${colors.queueStatusBorder}`,
                  borderRadius: 999,
                  padding: '2px 6px',
                  lineHeight: 1.1,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                {queueStatusText}
              </span>
            ) : null}
            {/* Cancel download button */}
            <button
              onClick={async () => {
                if (!primaryQueueTask || isPrimaryTaskCancelling) {
                  return;
                }
                void cancelVideoTask(primaryQueueTask.traceId, { showCurrentTaskFeedback: true });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setIsProgressCancelHovered(true)}
              onMouseLeave={() => setIsProgressCancelHovered(false)}
              style={{
                margin: 0,
                marginTop: 4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isProgressCancelHovered ? colors.progressCancelHoverBg : 'transparent',
                border: 'none',
                cursor: !primaryQueueTask || isPrimaryTaskCancelling ? 'default' : 'pointer',
                transition: 'background-color 0.2s',
                opacity: !primaryQueueTask || isPrimaryTaskCancelling ? 0.6 : 1,
              }}
              title={t("app.actions.cancelCurrentTask")}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                style={{
                  color: isProgressCancelHovered ? colors.progressCancelHoverIcon : colors.progressCancelIcon,
                  transition: 'color 0.2s',
                }}
              >
                <path
                  d="M2 2L8 8M8 2L2 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </motion.div>
        ) : isProcessing ? (
          <motion.div
            key="check"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.05, 1], opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              maxWidth: 170,
            }}
          >
            {downloadCancelled ? (
              <X size={48} style={{ color: colors.errorIcon }} strokeWidth={3} />
            ) : (
              <Check size={48} style={{ color: colors.successIcon }} strokeWidth={3} />
            )}
            {downloadCancelled && downloadErrorMessage ? (
              <span
                title={downloadErrorMessage}
                style={{
                  fontSize: 9,
                  lineHeight: 1.2,
                  color: colors.textSecondary,
                  textAlign: "center",
                  userSelect: "text",
                  pointerEvents: "none",
                  padding: "0 8px",
                }}
              >
                {downloadErrorMessage}
              </span>
            ) : null}
          </motion.div>
        ) : isMinimized ? (
          <motion.div
            key="minimized"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: isMacOS ? 1 : 3.33, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
          >
            <CatIcon size={isMacOS ? 120 : 40} glow={!isMacOS} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* yt-dlp update indicator */}
      {ytdlpUpdate && (
        <button
          onClick={handleYtdlpUpdate}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isUpdating}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 28,
            width: 16,
            height: 16,
            border: 'none',
            borderRadius: 4,
            backgroundColor: 'transparent',
            cursor: isUpdating ? 'wait' : 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isPanelHovered && !isMinimized ? 1 : 0,
            transition: 'opacity 0.2s ease',
            transitionDelay: !isMinimized ? '0.2s' : '0s',
            pointerEvents: isPanelHovered && !isMinimized ? 'auto' : 'none',
            zIndex: 10,
          }}
          title={isUpdating
            ? t("app.actions.updating")
            : t("app.actions.updateYtdlp", {
                current: ytdlpUpdate.current,
                latest: ytdlpUpdate.latest ?? "",
              })}
        >
          {isUpdating ? (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: `1.5px solid ${colors.accentBorder}`,
                borderTopColor: colors.accentSolid,
                display: 'block',
                animation: 'spin 0.75s linear infinite',
                transformOrigin: '50% 50%',
                boxShadow: `0 0 4px ${colors.accentGlow}`,
              }}
            />
          ) : (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: colors.dangerSolid,
                display: 'block',
                boxShadow: `0 0 6px ${colors.dangerGlow}`,
              }}
            />
          )}
        </button>
      )}

      {/* Rename counter reset button - bottom left solid rectangle */}
      {renameMediaOnDownload && (
        <button
          onClick={handleResetRenameCounter}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setIsResetCounterHovered(true)}
          onMouseLeave={() => setIsResetCounterHovered(false)}
          style={{
            bottom: 8,
            left: 8,
            ...miniControlStyle,
            cursor: 'pointer',
          }}
          title={t("app.actions.resetRenameCounter")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
            <rect
              x="1"
              y="1"
              width="8"
              height="8"
              fill={
                isResetCounterActive
                  ? colors.accentSolid
                  : (isResetCounterHovered ? colors.controlMutedHover : colors.controlMuted)
              }
              stroke="none"
              rx="1"
              style={{ transition: 'fill 0.2s ease' }}
            />
          </svg>
        </button>
      )}

      {/* Settings button - bottom right rectangle */}
      <button
        onClick={openSettings}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setIsSettingsHovered(true)}
        onMouseLeave={() => setIsSettingsHovered(false)}
        style={{
          bottom: 8,
          right: 8,
          ...miniControlStyle,
          cursor: 'pointer',
        }}
        title={t("app.actions.settings")}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
          <rect
            x="1"
            y="1"
            width="8"
            height="8"
            fill="none"
            stroke={isSettingsHovered ? colors.controlStrokeHover : colors.controlStroke}
            strokeWidth="1.5"
            rx="1"
            style={{ transition: 'stroke 0.2s ease' }}
          />
        </svg>
      </button>

    </motion.div>
  );
}

export default App;
