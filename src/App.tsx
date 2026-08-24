import { startTransition, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { NeonIconButton } from "./components/ui";
import {
  COMPACT_EASE,
} from "./components/ui/shared-styles";
import type { AppUpdateInfo, AppUpdatePhase, AppUpdateStatePayload } from "./types/appUpdate";
import type { ProcessFilesResult } from "./types/fileIntake";
import {
  desktopClipboard,
  desktopCommands,
  desktopCurrentWindow,
  desktopDrop,
  desktopEvents,
  desktopSystem,
  desktopUpdater,
  desktopWindows,
  isElectronRenderer,
} from "./desktop/runtime";
import type {
  RuntimeDependencyGatePhase,
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyStatusSnapshot,
} from "./types/runtimeDependencies";
import type {
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeTaskPayload,
} from "./protocol/download/ipcTypes";
import type {
  ErrorDiagnosticCopyRequest,
  RuntimeFailureDiagnostic,
} from "./types/errorDiagnostics";
import {
  buildPinterestDragDiagnostic,
  extractEmbeddedPinterestDragPayload,
  extractPinterestVideoSelectionFromHtml,
  extractPinterestImageUrlFromHtml,
  isPinterestPinUrl,
  looksLikePinterestVideoHtml,
} from "./utils/pinterest";
import { extractImageUrlFromHtml } from "./utils/imageDrag";
import { upgradeImageUrl } from "./utils/imageQualityUpgrade";
import {
  extractEmbeddedXiaohongshuDragPayload,
  hasXiaohongshuVideoSignals,
  isXiaohongshuPageUrl,
  pickXiaohongshuImageForDownload,
  type XiaohongshuResolvedDragMedia,
} from "./utils/xiaohongshu";
import { parseLocalFileUrl } from "./utils/localFileUrl";
import { canonicalizeTwitterXPageUrl, shouldPreferTwitterXImageDrop } from "./utils/twitterX";
import {
  getDroppedFolderErrorTranslationKey,
  shouldHandleDroppedFolderResult,
} from "./utils/folderDrop";
import {
  EMPTY_VIDEO_TRANSCODE_QUEUE_DETAIL,
  EMPTY_VIDEO_TRANSCODE_QUEUE_STATE,
  getDownloadStatusText,
  getTranscodeStageLabel,
  getTranscodeTaskStatusText,
  mergeVideoTranscodeTask,
  normalizeVideoTranscodeQueueDetail,
  normalizeVideoTranscodeTask,
  shouldShowVideoTaskBadge,
} from "./utils/downloadViewHelpers";
import {
  applyNormalizedTranscodeProgressToDetail,
  applyNormalizedTranscodeProgressToMap,
  applyVideoTranscodeQueueStateEvent,
  clearTranscodeProgressWhenInactive,
  removeTranscodeProgressTrace,
  removeTranscodeTaskFromDetail,
  summarizeDownloadError,
  upsertTranscodeTaskToDetail,
} from "./utils/downloadEventReducers";
import type { DownloadQueueAck, LocalIntakeOrigin } from "./application/download-api";
import {
  createDownloadQueueClient,
  type DownloadQueueRequest,
} from "./features/download/client";
import {
  selectAdvancedQualitySelectionTask,
  selectDownloadQueueRows,
  selectIsTaskCancelling,
  selectPrimaryDownloadProgress,
  selectPrimaryDownloadStage,
  selectPrimaryDownloadTask,
  selectRemainingDownloadCount,
  selectVisibleTaskCount,
} from "./features/download/selectors";
import { useDownloadQueue } from "./features/download/useDownloadQueue";
import type {
  AdvancedQualityOption,
  DownloadTask,
} from "./features/download/model";
import { extractEmbeddedProtectedImageDragPayload } from "./utils/protectedImageDrag";
import {
  DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS,
  getDeferredStartupInitializationDelayMs,
  STARTUP_AUTO_RUNTIME_BOOTSTRAP_DELAY_MS,
  shouldStartExpandedOnLaunch,
} from "./utils/startupWindowState";
import {
  createCenterOverlayState,
  isCenterOverlayLockActive,
  reduceCenterOverlayState,
  selectCenterOverlayVisual,
  type CenterOverlayOutcomeOrigin,
  type CenterOverlayOutcomeSource,
  type CenterOverlayOutcomeStatus,
  type CenterOverlayState,
} from "./utils/centerOverlayState";
import {
  errorDiagnosticCategoryTranslationKey,
  resolveErrorDiagnosticCategory,
} from "./utils/errorDiagnosticCategories";
import { parseDesktopAppConfig } from "./updates/appUpdatePreferences";
import { isVideoUrl } from "./utils/videoUrl";
import { saveOutputPath } from "./utils/outputPath";
import { useTheme } from "./contexts/ThemeContext";
import { isLikelyShortLinkUrl } from "./core/short-links";
import {
  getMainWindowCompactOuterSize,
  SETTINGS_WINDOW_CONTENT_HEIGHT,
  SETTINGS_WINDOW_CONTENT_WIDTH,
} from "./constants/windowMetrics";
import {
  useMainWindowPresentation,
  type MainWindowPresentationDependencies,
} from "./presentation/main-window/reactAdapter";
import {
  MainWindowPresentationSurface,
  type MainWindowApplicationLock,
} from "./presentation/main-window/MainWindowPresentationSurface";
import { resolveDownloadProgressTarget } from "./presentation/main-window/downloadProgressProjection";
import {
  shouldInvalidateTerminalRevealForPrimaryDownload,
  shouldShowDownloadTerminalReveal,
} from "./presentation/main-window/downloadTerminalProjection";
import { useDownloadIntakePresentation } from "./presentation/main-window/downloadIntakePresentation";
import { resolveFolderActivationPresentation } from "./presentation/main-window/folderActivationPresentation";
import { resolveExpandedPresentationTarget } from "./presentation/main-window/expandedPresentationPolicy";
import { snapshotClientPointOrigin } from "./presentation/main-window/pointerField";
import { isMainWindowFullContentVisible } from "./presentation/main-window/projections";
import { MainWindowQueuePopover } from "./presentation/main-window/MainWindowQueuePopover";
import { MainWindowCenterOverlay } from "./presentation/main-window/MainWindowCenterOverlay";
import { MainWindowRuntimeIndicator } from "./presentation/main-window/MainWindowRuntimeIndicator";
import i18n from "./i18n";
import {
  getMissingRuntimeComponentsFromStatus,
  clampRuntimeGateProgressPercent,
  getRuntimeGateHeadline,
  getRuntimeGateNextLabel,
  getRuntimeGateProgressLabel,
  hasMissingManagedRuntimeComponents,
  runtimeGateIsActive,
  runtimeGateNeedsManualAction,
  shouldAutoStartManagedRuntimeBootstrapOnStartup,
  summarizeRuntimeGateError,
} from "./utils/runtimeDependencyGate";

const isResolvableVideoInputUrl = (value: string): boolean => (
  isVideoUrl(value) || isLikelyShortLinkUrl(value)
);

const MAX_IN_MEMORY_DROPPED_FILE_BYTES = 25 * 1024 * 1024;

// Helper function to check and show sequence overflow error
const checkSequenceOverflow = (error: unknown): boolean => {
  const errorStr = String(error);
  if (errorStr.includes("序号已用完")) {
    alert(i18n.t("desktop:app.sequenceOverflowMessage"));
    return true;
  }
  return false;
};

const summarizeAppUpdateError = (error: unknown): string | null => {
  const errorString = String(error ?? "").trim();
  if (!errorString) {
    return null;
  }
  return summarizeDownloadError(errorString) ?? errorString;
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

const readClipboardImageDataUrl = async (): Promise<string | null> => {
  const clipboardImage = await desktopClipboard.readImage();
  if (!clipboardImage) {
    return null;
  }

  const { width, height } = clipboardImage;

  if (width <= 0 || height <= 0) {
    throw new Error(`Clipboard image has invalid dimensions: ${width}x${height}`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create a canvas context for clipboard image paste");
  }

  const imageData = new ImageData(
    new Uint8ClampedArray(clipboardImage.rgba),
    width,
    height,
  );
  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
};

const fileToDataUrl = async (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      resolve(reader.result);
      return;
    }
    reject(new Error("Failed to read file as data URL"));
  };
  reader.onerror = () => reject(reader.error ?? new Error("Failed to read file as data URL"));
  reader.readAsDataURL(file);
});

const filterDroppedFilesByMimePrefix = (
  dataTransfer: DataTransfer | null,
  mimePrefix: `${string}/`,
): File[] => Array.from(dataTransfer?.files ?? []).filter((file) => file.type.startsWith(mimePrefix));

const saveDroppedFilesToOutput = async (
  files: File[],
  targetDir: string | null,
): Promise<number> => {
  let savedCount = 0;

  for (const file of files) {
    try {
      if (file.size > MAX_IN_MEMORY_DROPPED_FILE_BYTES) {
        throw new Error(
          `Dropped file is too large to copy without a local path: ${file.name || "<unnamed>"}`,
        );
      }

      const dataUrl = await fileToDataUrl(file);
      await desktopCommands.invoke<string>("save_data_url", {
        dataUrl,
        targetDir,
        originalFilename: file.name || undefined,
      });

      savedCount += 1;
    } catch (error) {
      console.error("Failed to save dropped browser file:", file.name || "<unnamed>", error);
      checkSequenceOverflow(error);
    }
  }

  return savedCount;
};

const extractClipboardImageFile = (clipboardData: DataTransfer | null): File | null => {
  if (!clipboardData) {
    return null;
  }

  for (const file of Array.from(clipboardData.files)) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  return null;
};

const runtimeGatePhaseNeedsAttention = (phase: RuntimeDependencyGatePhase): boolean => (
  phase === "checking"
  || phase === "awaiting_confirmation"
  || phase === "downloading"
  || phase === "blocked_by_user"
  || phase === "failed"
);

const runtimeGatePhasePreservesDecision = (phase: RuntimeDependencyGatePhase): boolean => (
  phase === "awaiting_confirmation"
  || phase === "downloading"
  || phase === "blocked_by_user"
);

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

const mergeVideoCandidatesByUrl = <TCandidate extends { url: string }>(
  embeddedCandidates: TCandidate[],
  htmlCandidates: TCandidate[],
): TCandidate[] => {
  const merged: TCandidate[] = [];
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

function App() {
  const { t } = useTranslation("desktop");
  const { colors } = useTheme();
  const shouldReduceMotion = useReducedMotion();
  const userAgent = navigator.userAgent.toLowerCase();
  const isMacOS = userAgent.includes("mac");
  const isWindows = userAgent.includes("windows");
  const currentMainWindowPlatform: NodeJS.Platform = isMacOS
    ? "darwin"
    : isWindows
      ? "win32"
      : "linux";
  const supportsCompactPassthroughHotspot = isWindows;
  const startupWindowEnvironment = {
    protocol: window.location.protocol,
    userAgent: navigator.userAgent,
  };
  const deferredStartupInitializationDelayMs =
    getDeferredStartupInitializationDelayMs(startupWindowEnvironment);
  const startsExpandedOnLaunch =
    shouldStartExpandedOnLaunch(startupWindowEnvironment);
  const presentationDependencies = useMemo<MainWindowPresentationDependencies>(() => {
    const nativeSurfaceAvailable = isElectronRenderer();
    return {
      scheduleTimer: (handler, delayMs) => window.setTimeout(handler, delayMs),
      cancelTimer: (handle) => window.clearTimeout(handle),
      setInteractionMode: (mode) => {
        if (nativeSurfaceAvailable) {
          desktopCurrentWindow.setInteractionMode(mode);
        }
      },
      beginCompactReachability: (requestEpoch) => {
        if (!nativeSurfaceAvailable) {
          return;
        }
        void desktopCurrentWindow.ensureMainWindowCompactReachable({
          reachableFrameSize: getMainWindowCompactOuterSize(currentMainWindowPlatform),
          edgePadding: WINDOW_EDGE_PADDING,
          reducedMotion: Boolean(shouldReduceMotion),
          requestEpoch,
        }).catch((err) => {
          console.error("Failed to keep compact main window reachable:", err);
        });
      },
      cancelCompactReachability: () => {
        if (nativeSurfaceAvailable) {
          desktopCurrentWindow.cancelCompactReachability();
        }
      },
      focusContainer: () => {
        window.setTimeout(() => {
          const container = document.querySelector('[tabIndex="0"]') as HTMLElement | null;
          container?.focus();
        }, 100);
      },
      supportsCompactPassthrough: supportsCompactPassthroughHotspot,
    };
  }, [currentMainWindowPlatform, shouldReduceMotion, supportsCompactPassthroughHotspot]);
  const presentation = useMainWindowPresentation({
    startsCompact: !startsExpandedOnLaunch,
    dependencies: presentationDependencies,
  });
  const [hoveredAdvancedQualityOptionId, setHoveredAdvancedQualityOptionId] = useState<string | null>(null);
  const [centerOverlayState, setCenterOverlayState] = useState<CenterOverlayState>(() => createCenterOverlayState());
  const [outputPath, setOutputPath] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [videoTranscodeQueueState, setVideoTranscodeQueueState] = useState<VideoTranscodeQueueStatePayload>(EMPTY_VIDEO_TRANSCODE_QUEUE_STATE);
  const [videoTranscodeQueueDetail, setVideoTranscodeQueueDetail] = useState<VideoTranscodeQueueDetailPayload>(EMPTY_VIDEO_TRANSCODE_QUEUE_DETAIL);
  const [transcodeProgressByTrace, setTranscodeProgressByTrace] = useState<Record<string, VideoTranscodeTaskPayload>>({});
  const [pendingTranscodeActionTraceIds, setPendingTranscodeActionTraceIds] = useState<string[]>([]);
  const downloadClient = useMemo(
    () => createDownloadQueueClient({ commands: desktopCommands, events: desktopEvents }),
    [],
  );
  const {
    state: downloadState,
    actions: downloadActions,
    onIntake: onDownloadIntake,
    onTerminal: onDownloadTerminal,
  } = useDownloadQueue(downloadClient);
  const downloadIntakePresentation = useDownloadIntakePresentation({
    downloadState,
    onIntake: onDownloadIntake,
    onTerminal: onDownloadTerminal,
  });
  const [queueNoticeMessage, setQueueNoticeMessage] = useState<string | null>(null);
  const [isQueuePopoverOpen, setIsQueuePopoverOpen] = useState(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [appUpdatePhase, setAppUpdatePhase] = useState<AppUpdatePhase>("idle");
  const [appUpdateError, setAppUpdateError] = useState<string | null>(null);
  const [runtimeDependencyStatus, setRuntimeDependencyStatus] = useState<RuntimeDependencyStatusSnapshot | null>(null);
  const [runtimeDependencyGateState, setRuntimeDependencyGateState] =
    useState<RuntimeDependencyGateStatePayload | null>(null);
  const [isRuntimeIndicatorHovered, setIsRuntimeIndicatorHovered] = useState(false);
  const [isRuntimeRetryFeedbackVisible, setIsRuntimeRetryFeedbackVisible] = useState(false);
  const [isRuntimeRetryInFlight, setIsRuntimeRetryInFlight] = useState(false);
  const [showRuntimeSuccessIndicator, setShowRuntimeSuccessIndicator] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [isDeferredStartupInitializationReady, setIsDeferredStartupInitializationReady] =
    useState(deferredStartupInitializationDelayMs <= 0);
  // App-side startup gate: runtime bootstrap waits for the first settle frame.
  const [isInitialMount, setIsInitialMount] = useState(true);
  // Ordinary local UI state: panel hover reported by the surface for
  // application content (mini controls). Full-content visibility is derived
  // directly from the lifecycle projection, never mirrored here.
  const [isPanelHovered, setIsPanelHovered] = useState(false);
  const [isResetCounterActive, setIsResetCounterActive] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const resetCounterFeedbackTimerRef = useRef<number | null>(null);
  const queueNoticeTimerRef = useRef<number | null>(null);
  const runtimeRetryFeedbackTimerRef = useRef<number | null>(null);
  const runtimeSuccessTimerRef = useRef<number | null>(null);
  const runtimeBootstrapAfterVisibleTimerRef = useRef<number | null>(null);
  const deferredStartupInitializationTimerRef = useRef<number | null>(null);
  const deferredStartupInitializationIdleRef = useRef<number | null>(null);
  const foregroundTaskOutcomeTimerRef = useRef<number | null>(null);
  const centerOutcomeTimerRef = useRef<number | null>(null);
  const centerOverlayStateRef = useRef<CenterOverlayState>(centerOverlayState);
  const isContextMenuOpenRef = useRef(false);
  const pendingTranscodeActionTraceIdsRef = useRef<Set<string>>(new Set());
  const pasteHandlerRef = useRef<(
    clipboardData: DataTransfer | null,
    origin?: LocalIntakeOrigin,
  ) => void>(() => undefined);
  const handleSurfacePaste = useCallback((
    clipboardData: DataTransfer | null,
    origin?: LocalIntakeOrigin,
  ) => {
    pasteHandlerRef.current(clipboardData, origin);
  }, []);
  const queueBadgeButtonRef = useRef<HTMLButtonElement>(null);
  const previousTaskCountRef = useRef(0);
  const previousRuntimeGatePhaseRef = useRef<RuntimeDependencyGatePhase>("idle");
  const hasTriggeredStartupRuntimeBootstrapRef = useRef(false);
  const WINDOW_EDGE_PADDING = 8;
  const CONTEXT_MENU_WIDTH = 176;
  const CONTEXT_MENU_HEIGHT = 80;
  const SETTINGS_WINDOW_WIDTH = SETTINGS_WINDOW_CONTENT_WIDTH;
  const SETTINGS_WINDOW_HEIGHT = SETTINGS_WINDOW_CONTENT_HEIGHT;
  const totalDownloadTaskCount = selectVisibleTaskCount(downloadState);
  const downloadQueueTasks = selectDownloadQueueRows(downloadState);
  const primaryDownloadTask = selectPrimaryDownloadTask(downloadState);
  const downloadProgress = selectPrimaryDownloadProgress(downloadState);
  // MR3 pure projection: current primary Download selector result -> neutral
  // Expanded Presentation target (idle/determinate/indeterminate).
  const expandedPresentationProgress = resolveDownloadProgressTarget(
    primaryDownloadTask,
    downloadProgress,
  );
  const downloadStage = selectPrimaryDownloadStage(downloadState);
  const transcodeQueueTasks = videoTranscodeQueueDetail.tasks.map((task) =>
    mergeVideoTranscodeTask(task, transcodeProgressByTrace[task.traceId]),
  );
  const activeTranscodeProgressTask = Object.values(transcodeProgressByTrace).find((task) => task.status === "active") ?? null;
  const activeTranscodeQueueTasks = transcodeQueueTasks.filter((task) => task.status === "active");
  const primaryTranscodeTask = activeTranscodeQueueTasks[0] ?? activeTranscodeProgressTask;
  const totalTranscodeTaskCount = videoTranscodeQueueState.totalCount;
  const ongoingTranscodeTaskCount = videoTranscodeQueueState.activeCount + videoTranscodeQueueState.pendingCount;
  const ongoingTaskCount = totalDownloadTaskCount + ongoingTranscodeTaskCount;
  const totalTaskCount = totalDownloadTaskCount + totalTranscodeTaskCount;
  const runtimeGatePhase = runtimeDependencyGateState?.phase ?? "idle";
  const runtimeGateIsBusy = runtimeGateIsActive(runtimeGatePhase);
  // Direct pure projection from the lifecycle state — no mirrored copy.
  const mainWindowFullContentVisible = isMainWindowFullContentVisible(presentation.state);
  const isWindowReadyForStartupRuntimeBootstrap = mainWindowFullContentVisible;
  const shouldEvaluateDeferredStartupIndicators =
    isDeferredStartupInitializationReady
    || runtimeDependencyStatus !== null
    || runtimeDependencyGateState !== null
    || showRuntimeSuccessIndicator;
  const primaryTask = downloadProgress && primaryDownloadTask
    ? {
        kind: "download" as const,
        task: primaryDownloadTask,
        percent: downloadProgress.percent,
        statusText: primaryDownloadTask.phase === "probing_quality"
          ? t("app.queue.probingAdvancedQuality")
          : primaryDownloadTask.phase === "selecting_quality"
            ? t("app.queue.selectAdvancedQuality")
            : getDownloadStatusText(i18n.t, downloadProgress, downloadStage),
        indeterminate:
          primaryDownloadTask.phase === "probing_quality"
          || primaryDownloadTask.phase === "selecting_quality"
          || downloadProgress.percent < 0,
      }
    : primaryTranscodeTask
      ? {
          kind: "transcode" as const,
          task: primaryTranscodeTask,
          percent: primaryTranscodeTask.progressPercent ?? -1,
          statusText: getTranscodeTaskStatusText(i18n.t, primaryTranscodeTask, { includePercent: false }),
          indeterminate:
            typeof primaryTranscodeTask.progressPercent !== "number"
            || !Number.isFinite(primaryTranscodeTask.progressPercent),
        }
      : null;
  const hasOngoingTask = ongoingTaskCount > 0;
  const centerOverlayLockActive = isCenterOverlayLockActive(centerOverlayState);
  const isProcessing = centerOverlayLockActive;
  // Product activity (foreground file/image processing) is a task fact; the
  // typed outcome presentations (task/folder outcome) are terminal
  // Presentation facts. MR4 separates the two lifecycle lock projections so
  // the same Reveal fact never activates both the `task` and `centerOutcome`
  // locks.
  const isTaskProcessing = centerOverlayState.kind === "task-processing";
  const folderActivationPresentation = resolveFolderActivationPresentation(centerOverlayState);
  const expandedPresentationTarget = resolveExpandedPresentationTarget({
    progress: expandedPresentationProgress,
    intake: downloadIntakePresentation,
    folder: folderActivationPresentation,
  });
  const centerOverlayVisual = selectCenterOverlayVisual({
    primaryTask: primaryTask
      ? {
          kind: primaryTask.kind,
          traceId: primaryTask.task.traceId,
        }
      : null,
    centerOverlayState,
  });
  const remainingDownloadCount = selectRemainingDownloadCount(
    downloadState,
    primaryTask?.kind === "download",
  );
  const remainingTranscodeCount = Math.max(
    0,
    totalTranscodeTaskCount - (primaryTask?.kind === "transcode" ? 1 : 0),
  );

  // Only Application-owned lock facts are mirrored into the lifecycle. `drag`
  // and `drop` are Surface-owned facts written at the gesture boundary, so App
  // must not publish constant values that could overwrite an active lock.
  const presentationLocks = useMemo<Record<MainWindowApplicationLock, boolean>>(() => ({
    contextMenu: isContextMenuOpen,
    task: hasOngoingTask || isTaskProcessing,
    centerOutcome: centerOverlayLockActive,
    appUpdate: appUpdatePhase === "downloading" || appUpdatePhase === "installing" || runtimeGateIsBusy,
  }), [
    appUpdatePhase,
    centerOverlayLockActive,
    hasOngoingTask,
    isContextMenuOpen,
    isTaskProcessing,
    runtimeGateIsBusy,
  ]);

  const requestFullIntent = useCallback((
    reason: "task" | "runtimeGate" | "shortcut" | "foreground",
    recipe: "animated" | "instant" = "animated",
  ) => {
    presentation.dispatch({ type: "requestFull", reason, recipe });
    // presentation.dispatch is stable; the binding object identity changes per
    // render and must not be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation.dispatch]);

  const clearForegroundTaskOutcomeTimer = useCallback(() => {
    if (foregroundTaskOutcomeTimerRef.current !== null) {
      clearTimeout(foregroundTaskOutcomeTimerRef.current);
      foregroundTaskOutcomeTimerRef.current = null;
    }
  }, []);

  const clearCenterOutcomeTimer = useCallback(() => {
    if (centerOutcomeTimerRef.current !== null) {
      clearTimeout(centerOutcomeTimerRef.current);
      centerOutcomeTimerRef.current = null;
    }
  }, []);

  const updateCenterOverlayState = useCallback((action: Parameters<typeof reduceCenterOverlayState>[1]) => {
    const nextState = reduceCenterOverlayState(centerOverlayStateRef.current, action);
    centerOverlayStateRef.current = nextState;
    setCenterOverlayState(nextState);
    return nextState;
  }, []);

  const resetDownloadOutcome = useCallback(() => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    updateCenterOverlayState({ type: "reset" });
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer, updateCenterOverlayState]);

  const dismissTransientCenterOverlay = useCallback(() => {
    const current = centerOverlayStateRef.current;
    if (current.kind !== "task-outcome-loading" && current.kind !== "task-outcome-visible" && current.kind !== "folder-outcome-visible") {
      return;
    }
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    updateCenterOverlayState({ type: "dismissTransient" });
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer, updateCenterOverlayState]);

  const clearDeferredStartupInitializationIdle = useCallback(() => {
    if (
      deferredStartupInitializationIdleRef.current !== null
      && typeof window.cancelIdleCallback === "function"
    ) {
      window.cancelIdleCallback(deferredStartupInitializationIdleRef.current);
    }
    deferredStartupInitializationIdleRef.current = null;
  }, []);

  const markDeferredStartupInitializationReady = useCallback(() => {
    clearDeferredStartupInitializationIdle();
    setIsDeferredStartupInitializationReady(true);
  }, [clearDeferredStartupInitializationIdle]);

  useEffect(() => {
    centerOverlayStateRef.current = centerOverlayState;
  }, [centerOverlayState]);

  const showQueueNotice = useCallback((message: string) => {
    setQueueNoticeMessage(message);
    if (queueNoticeTimerRef.current !== null) {
      clearTimeout(queueNoticeTimerRef.current);
    }
    queueNoticeTimerRef.current = window.setTimeout(() => {
      setQueueNoticeMessage(null);
      queueNoticeTimerRef.current = null;
    }, 2400);
  }, []);

  const updateContextMenuOpen = useCallback((open: boolean) => {
    isContextMenuOpenRef.current = open;
    setIsContextMenuOpen(open);
  }, []);

  const addPendingTranscodeActionTraceId = useCallback((traceId: string) => {
    setPendingTranscodeActionTraceIds((current) => {
      if (current.includes(traceId)) {
        return current;
      }
      const next = [...current, traceId];
      pendingTranscodeActionTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const removePendingTranscodeActionTraceId = useCallback((traceId: string) => {
    setPendingTranscodeActionTraceIds((current) => {
      if (!current.includes(traceId)) {
        return current;
      }
      const next = current.filter((item) => item !== traceId);
      pendingTranscodeActionTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const openCurrentOutputFolder = useCallback(async () => {
    try {
      await desktopCommands.invoke<void>("open_current_output_folder");
    } catch (err) {
      console.error("Failed to open current output folder:", err);
    }
  }, []);

  const handleOutputFolderShortcut = useCallback(async () => {
    await openCurrentOutputFolder();
  }, [openCurrentOutputFolder]);

  const closeContextMenuWindow = useCallback(async () => {
    if (await desktopWindows.has("context-menu")) {
      await desktopWindows.close("context-menu").catch(() => undefined);
    }
    updateContextMenuOpen(false);
  }, [updateContextMenuOpen]);

  const prepareMainWindowForForegroundTask = useCallback(async () => {
    // Full intent is explicit lifecycle input; the lifecycle owns the
    // transition recipe and keeps pointer truth. The task lock lands through
    // the presentation lock facts before the overlay can paint.
    requestFullIntent("foreground", "instant");
  }, [requestFullIntent]);

  const buildErrorDiagnosticRequest = useCallback(({
    surface,
    traceId,
    failure,
    fallbackMessage,
  }: {
    surface: ErrorDiagnosticCopyRequest["surface"];
    traceId?: string;
    failure?: RuntimeFailureDiagnostic | null;
    fallbackMessage?: string | null;
  }): ErrorDiagnosticCopyRequest => {
    const normalizedFallback = typeof fallbackMessage === "string" && fallbackMessage.trim()
      ? fallbackMessage.trim()
      : null;
    const normalizedFailure = failure ?? (
      normalizedFallback
        ? { rawMessage: normalizedFallback }
        : null
    );
    const category = resolveErrorDiagnosticCategory({
      surface,
      failure: normalizedFailure,
      fallbackMessage: normalizedFallback,
    });
    const userMessage = t(errorDiagnosticCategoryTranslationKey(category));

    return {
      surface,
      traceId,
      userMessage,
      category,
      language: i18n.resolvedLanguage ?? i18n.language,
      failure: normalizedFailure,
    };
  }, [t]);

  const handleCopyErrorDiagnostic = useCallback((diagnostic: ErrorDiagnosticCopyRequest) => {
    void desktopCommands.invoke<boolean>("copy_error_diagnostics", diagnostic)
      .then((copied) => {
        if (!copied) {
          return;
        }
        clearForegroundTaskOutcomeTimer();
        updateCenterOverlayState({ type: "dismissTransient" });
      })
      .catch((error) => {
        console.error("Failed to copy error diagnostics:", error);
      });
  }, [clearForegroundTaskOutcomeTimer, updateCenterOverlayState]);

  const showForegroundTaskOutcome = useCallback(({
    status,
    error,
    durationMs,
    source,
    origin,
    diagnostic,
  }: {
    status: CenterOverlayOutcomeStatus;
    error: string | null;
    durationMs: number;
    source?: Exclude<CenterOverlayOutcomeSource, "folder">;
    origin?: CenterOverlayOutcomeOrigin;
    diagnostic?: ErrorDiagnosticCopyRequest | null;
  }) => {
    clearForegroundTaskOutcomeTimer();
    const loadingState = updateCenterOverlayState({
      type: "beginTaskOutcomeLoading",
      source: source ?? diagnostic?.surface ?? "download",
      status,
      origin,
      message: status === "success" ? null : error,
      durationMs,
      diagnostic: status === "failure" ? diagnostic ?? null : null,
    });
    const requestId = loadingState.requestId;
    void prepareMainWindowForForegroundTask();
    if (centerOverlayStateRef.current.requestId !== requestId) {
      return;
    }
    updateCenterOverlayState({ type: "showTaskOutcome", requestId });
    foregroundTaskOutcomeTimerRef.current = window.setTimeout(() => {
      if (centerOverlayStateRef.current.requestId !== requestId) {
        return;
      }
      foregroundTaskOutcomeTimerRef.current = null;
      updateCenterOverlayState({ type: "finishTaskOutcome", requestId });
    }, durationMs);
  }, [
    clearForegroundTaskOutcomeTimer,
    prepareMainWindowForForegroundTask,
    updateCenterOverlayState,
  ]);

  const showFolderDropOutcome = useCallback((origin?: LocalIntakeOrigin) => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    const outcomeState = updateCenterOverlayState({
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
      origin,
      startedAt: performance.now(),
    });
    const requestId = outcomeState.requestId;
    centerOutcomeTimerRef.current = window.setTimeout(() => {
      if (centerOverlayStateRef.current.requestId !== requestId) {
        return;
      }
      centerOutcomeTimerRef.current = null;
      updateCenterOverlayState({ type: "finishFolderOutcome", requestId });
    }, 1400);
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer, updateCenterOverlayState]);

  const showFolderDropErrorOutcome = useCallback((error: string) => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    const outcomeState = updateCenterOverlayState({
      type: "showFolderOutcome",
      status: "error",
      message: error,
      durationMs: 1800,
    });
    const requestId = outcomeState.requestId;
    centerOutcomeTimerRef.current = window.setTimeout(() => {
      if (centerOverlayStateRef.current.requestId !== requestId) {
        return;
      }
      centerOutcomeTimerRef.current = null;
      updateCenterOverlayState({ type: "finishFolderOutcome", requestId });
    }, 1800);
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer, updateCenterOverlayState]);

  const startForegroundProcessing = useCallback(async () => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    updateCenterOverlayState({ type: "beginTaskProcessing", source: "image" });
    await prepareMainWindowForForegroundTask();
  }, [
    clearCenterOutcomeTimer,
    clearForegroundTaskOutcomeTimer,
    prepareMainWindowForForegroundTask,
    updateCenterOverlayState,
  ]);

  const scheduleForegroundProcessingDismiss = useCallback((durationMs: number) => {
    const requestId = centerOverlayStateRef.current.requestId;
    window.setTimeout(() => {
      const current = centerOverlayStateRef.current;
      if (current.requestId !== requestId || current.kind !== "task-processing") {
        return;
      }
      updateCenterOverlayState({ type: "dismissTransient" });
    }, durationMs);
  }, [updateCenterOverlayState]);

  const summarizeForegroundTaskError = useCallback((error: unknown): string => {
    const fallbackMessage = checkSequenceOverflow(error)
      ? i18n.t("desktop:app.sequenceOverflowMessage")
      : "Download failed";
    return summarizeDownloadError(String(error ?? "").trim()) ?? fallbackMessage;
  }, []);

  const runForegroundImageTask = useCallback(async (
    task: () => Promise<void>,
    failureLogLabel: string,
  ) => {
    resetDownloadOutcome();
    await startForegroundProcessing();

    try {
      await task();
      await prepareMainWindowForForegroundTask();
      showForegroundTaskOutcome({
        status: "success",
        error: null,
        durationMs: 1400,
      });
    } catch (error) {
      console.error(failureLogLabel, error);
      await prepareMainWindowForForegroundTask();
      showForegroundTaskOutcome({
        status: "failure",
        error: summarizeForegroundTaskError(error),
        durationMs: 1800,
      });
    }
  }, [
    prepareMainWindowForForegroundTask,
    resetDownloadOutcome,
    showForegroundTaskOutcome,
    startForegroundProcessing,
    summarizeForegroundTaskError,
  ]);

  useEffect(() => {
    if (hasOngoingTask) {
      requestFullIntent("task", "instant");
    }
  }, [hasOngoingTask, requestFullIntent]);

  const applyRuntimeConfig = useCallback((config: Record<string, unknown>) => {
    if (typeof config.outputPath === "string") {
      setOutputPath(config.outputPath);
    }
    setRenameMediaOnDownload(resolveRenameMediaEnabled(config));
  }, []);

  const refreshRuntimeDependencyStatus = useCallback(async () => {
    try {
      const status = await desktopCommands.invoke<RuntimeDependencyStatusSnapshot>("get_runtime_dependency_status");
      startTransition(() => {
        setRuntimeDependencyStatus(status);
      });
      return status;
    } catch (err) {
      console.error("Failed to load runtime dependency status:", err);
      startTransition(() => {
        setRuntimeDependencyStatus(null);
      });
      return null;
    }
  }, []);

  const applyAppUpdateState = useCallback((nextState: AppUpdateStatePayload) => {
    startTransition(() => {
      setAppUpdateInfo(nextState.info);
      setAppUpdatePhase(nextState.phase);
      setAppUpdateError(nextState.error);
    });
  }, []);

  const handleAppUpdateInstall = useCallback(async () => {
    if (!appUpdateInfo || appUpdatePhase === "downloading" || appUpdatePhase === "installing") {
      return;
    }

    if (appUpdateInfo.installMode === "manual" && appUpdateInfo.manualUrl) {
      try {
        await desktopSystem.openExternal(appUpdateInfo.manualUrl);
      } catch (err) {
        console.error("Failed to open app update download:", err);
        setAppUpdateError(summarizeAppUpdateError(err));
        setAppUpdatePhase("error");
      }
      return;
    }

    setAppUpdateError(null);
    setAppUpdatePhase("downloading");

    try {
      await desktopUpdater.downloadAndInstall();
      setAppUpdatePhase("installing");
      await desktopSystem.relaunch();
    } catch (err) {
      console.error("Failed to install app update:", err);
      setAppUpdateError(summarizeAppUpdateError(err));
      setAppUpdatePhase("error");
    }
  }, [appUpdateInfo, appUpdatePhase]);

  const loadRuntimeDependencyGateState = useCallback(async () => {
    try {
      const state = await desktopCommands.invoke<RuntimeDependencyGateStatePayload>("get_runtime_dependency_gate_state");
      startTransition(() => {
        setRuntimeDependencyGateState(state);
      });
      return state;
    } catch (err) {
      console.error("Failed to load runtime dependency gate state:", err);
      startTransition(() => {
        setRuntimeDependencyGateState(null);
      });
      return null;
    }
  }, []);

  const refreshRuntimeDependencyGateState = useCallback(async () => {
    try {
      const state = await desktopCommands.invoke<RuntimeDependencyGateStatePayload>("refresh_runtime_dependency_gate_state");
      startTransition(() => {
        setRuntimeDependencyGateState(state);
      });
      return state;
    } catch (err) {
      console.error("Failed to refresh runtime dependency gate state:", err);
      startTransition(() => {
        setRuntimeDependencyGateState(null);
      });
      return null;
    }
  }, []);

  const startRuntimeDependencyBootstrap = useCallback(async (reason?: string) => {
    try {
      const state = await desktopCommands.invoke<RuntimeDependencyGateStatePayload>(
        "start_runtime_dependency_bootstrap",
        reason ? { reason } : undefined,
      );
      startTransition(() => {
        setRuntimeDependencyGateState(state);
      });
      return state;
    } catch (err) {
      console.error("Failed to start runtime dependency bootstrap:", err);
      return null;
    }
  }, []);

  const refreshRuntimeDependencyContext = useCallback(async () => {
    const [status, gate] = await Promise.all([
      refreshRuntimeDependencyStatus(),
      refreshRuntimeDependencyGateState(),
    ]);
    return { status, gate };
  }, [refreshRuntimeDependencyGateState, refreshRuntimeDependencyStatus]);

  const runDownloadEnqueue = useCallback(async (
    attempt: () => Promise<DownloadQueueAck>,
    userUrl: string,
  ) => {
    await prepareMainWindowForForegroundTask();
    resetDownloadOutcome();
    try {
      await attempt();
    } catch (err) {
      console.error("Failed to queue video download:", err);
      checkSequenceOverflow(err);
      const fallbackMessage = summarizeDownloadError(String(err)) ?? String(err);
      const diagnostic = buildErrorDiagnosticRequest({
        surface: "download",
        failure: {
          rawMessage: fallbackMessage,
          userUrl,
        },
        fallbackMessage,
      });
      showForegroundTaskOutcome({
        status: "failure",
        error: diagnostic.userMessage,
        durationMs: 5000,
        diagnostic,
      });
    }
  }, [
    buildErrorDiagnosticRequest,
    prepareMainWindowForForegroundTask,
    resetDownloadOutcome,
    showForegroundTaskOutcome,
  ]);

  const enqueueVideoDownload = useCallback((
    request: string | DownloadQueueRequest,
    intakeOrigin?: LocalIntakeOrigin,
  ) => {
    const payload = typeof request === "string" ? { url: request } : request;
    const requestWithCause = intakeOrigin === undefined ? payload : { ...payload, intakeOrigin };
    return runDownloadEnqueue(
      () => downloadActions.queue(requestWithCause),
      requestWithCause.pageUrl ?? requestWithCause.url,
    );
  }, [downloadActions, runDownloadEnqueue]);

  const enqueuePastedVideoDownload = useCallback((url: string, intakeOrigin?: LocalIntakeOrigin) => (
    runDownloadEnqueue(() => downloadActions.queuePasted(url, intakeOrigin), url)
  ), [downloadActions, runDownloadEnqueue]);

  const cancelVideoTask = useCallback(async (traceId: string) => {
    if (!traceId) {
      return;
    }
    try {
      await downloadActions.cancel(traceId);
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
  }, [downloadActions]);

  const retryTranscodeTask = useCallback(async (traceId: string) => {
    if (!traceId || pendingTranscodeActionTraceIdsRef.current.has(traceId)) {
      return;
    }

    addPendingTranscodeActionTraceId(traceId);

    try {
      const retried = await desktopCommands.invoke<boolean>("retry_transcode", { traceId });
      if (!retried) {
        console.warn("Transcode retry was ignored for trace:", traceId);
      }
    } catch (err) {
      console.error("Failed to retry transcode:", err);
    } finally {
      removePendingTranscodeActionTraceId(traceId);
    }
  }, [addPendingTranscodeActionTraceId, removePendingTranscodeActionTraceId]);

  const removeTranscodeTask = useCallback(async (traceId: string) => {
    if (!traceId || pendingTranscodeActionTraceIdsRef.current.has(traceId)) {
      return;
    }

    addPendingTranscodeActionTraceId(traceId);

    try {
      const removed = await desktopCommands.invoke<boolean>("remove_transcode", { traceId });
      if (!removed) {
        console.warn("Transcode remove was ignored for trace:", traceId);
      }
    } catch (err) {
      console.error("Failed to remove transcode row:", err);
    } finally {
      removePendingTranscodeActionTraceId(traceId);
    }
  }, [addPendingTranscodeActionTraceId, removePendingTranscodeActionTraceId]);

  const selectAdvancedQualityOption = useCallback(async (traceId: string, optionId: string) => {
    if (!traceId || !optionId) {
      return;
    }

    try {
      const accepted = await downloadActions.selectQuality(traceId, optionId);
      if (!accepted) {
        console.warn("Advanced quality selection was ignored for trace:", traceId);
        return;
      }
      setIsQueuePopoverOpen(false);
    } catch (err) {
      console.error("Failed to select advanced quality option:", err);
    }
  }, [downloadActions]);

  const cancelTranscodeTask = useCallback(async (traceId: string) => {
    if (!traceId || pendingTranscodeActionTraceIdsRef.current.has(traceId)) {
      return;
    }

    addPendingTranscodeActionTraceId(traceId);

    try {
      const cancelled = await desktopCommands.invoke<boolean>("cancel_transcode", { traceId });
      if (!cancelled) {
        removePendingTranscodeActionTraceId(traceId);
        console.warn("Transcode cancel was ignored for trace:", traceId);
      }
    } catch (err) {
      removePendingTranscodeActionTraceId(traceId);
      console.error("Failed to cancel transcode:", err);
    }
  }, [addPendingTranscodeActionTraceId, removePendingTranscodeActionTraceId]);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await desktopCommands.invoke<string>("get_config");
        console.log("Loaded config:", configStr);
        const config = parseDesktopAppConfig(configStr);
        applyRuntimeConfig(config);
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };
    loadConfig();
  }, [applyRuntimeConfig, isMacOS]);

  useEffect(() => {
    if (!isDeferredStartupInitializationReady) {
      return;
    }

    const loadRuntimeDependencies = async () => {
      await Promise.all([
        refreshRuntimeDependencyStatus(),
        loadRuntimeDependencyGateState(),
      ]);
    };

    void loadRuntimeDependencies();
  }, [
    isDeferredStartupInitializationReady,
    loadRuntimeDependencyGateState,
    refreshRuntimeDependencyStatus,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsInitialMount(false);
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (resetCounterFeedbackTimerRef.current !== null) {
        clearTimeout(resetCounterFeedbackTimerRef.current);
      }
      if (queueNoticeTimerRef.current !== null) {
        clearTimeout(queueNoticeTimerRef.current);
      }
      if (runtimeRetryFeedbackTimerRef.current !== null) {
        clearTimeout(runtimeRetryFeedbackTimerRef.current);
      }
      if (runtimeSuccessTimerRef.current !== null) {
        clearTimeout(runtimeSuccessTimerRef.current);
      }
      if (runtimeBootstrapAfterVisibleTimerRef.current !== null) {
        clearTimeout(runtimeBootstrapAfterVisibleTimerRef.current);
      }
      if (deferredStartupInitializationTimerRef.current !== null) {
        clearTimeout(deferredStartupInitializationTimerRef.current);
      }
      clearDeferredStartupInitializationIdle();
    };
  }, [clearDeferredStartupInitializationIdle]);

  useEffect(() => {
    if (isDeferredStartupInitializationReady || isInitialMount) {
      return;
    }
    if (deferredStartupInitializationDelayMs <= 0) {
      markDeferredStartupInitializationReady();
      return;
    }

    deferredStartupInitializationTimerRef.current = window.setTimeout(() => {
      deferredStartupInitializationTimerRef.current = null;
      if (typeof window.requestIdleCallback === "function") {
        deferredStartupInitializationIdleRef.current = window.requestIdleCallback(() => {
          deferredStartupInitializationIdleRef.current = null;
          setIsDeferredStartupInitializationReady(true);
        }, {
          timeout: DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS,
        });
        return;
      }

      markDeferredStartupInitializationReady();
    }, deferredStartupInitializationDelayMs);

    return () => {
      if (deferredStartupInitializationTimerRef.current !== null) {
        clearTimeout(deferredStartupInitializationTimerRef.current);
        deferredStartupInitializationTimerRef.current = null;
      }
      clearDeferredStartupInitializationIdle();
    };
  }, [
    clearDeferredStartupInitializationIdle,
    markDeferredStartupInitializationReady,
    deferredStartupInitializationDelayMs,
    isDeferredStartupInitializationReady,
    isInitialMount,
  ]);

  useEffect(() => {
    if (
      isInitialMount
      || !isDeferredStartupInitializationReady
      || hasTriggeredStartupRuntimeBootstrapRef.current
      || runtimeBootstrapAfterVisibleTimerRef.current !== null
    ) {
      return;
    }

    const shouldAutoStartBootstrap = shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount,
      hasTriggeredStartupBootstrap: hasTriggeredStartupRuntimeBootstrapRef.current,
      runtimeDependencyStatus,
      gatePhase: runtimeDependencyGateState?.phase,
      isWindowReadyForStartupBootstrap: isWindowReadyForStartupRuntimeBootstrap,
    });

    if (!shouldAutoStartBootstrap) {
      return;
    }

    runtimeBootstrapAfterVisibleTimerRef.current = window.setTimeout(() => {
      runtimeBootstrapAfterVisibleTimerRef.current = null;
      hasTriggeredStartupRuntimeBootstrapRef.current = true;
      void startRuntimeDependencyBootstrap("startup_auto_retry").then((state) => {
        if (!state || state.phase === "idle") {
          hasTriggeredStartupRuntimeBootstrapRef.current = false;
        }
      });
    }, STARTUP_AUTO_RUNTIME_BOOTSTRAP_DELAY_MS);
  }, [
    isDeferredStartupInitializationReady,
    isInitialMount,
    runtimeDependencyGateState?.phase,
    runtimeDependencyStatus,
    isWindowReadyForStartupRuntimeBootstrap,
    startRuntimeDependencyBootstrap,
  ]);

  // Download lifecycle shell effects: protocol events are reduced synchronously
  // inside the feature controller (see useDownloadQueue), so these effects can
  // never reorder lifecycle reduction — they only run shell preparation after
  // the reduction has already happened.
  useEffect(() => {
    if (Object.keys(downloadState.progressByTrace).length === 0) {
      return;
    }
    void prepareMainWindowForForegroundTask();
    dismissTransientCenterOverlay();
  }, [
    dismissTransientCenterOverlay,
    downloadState.progressByTrace,
    prepareMainWindowForForegroundTask,
  ]);

  // MR4: a NEW current primary Download invalidates the previous terminal
  // Reveal Presentation state, its retention timer, and the centerOutcome
  // lock immediately — including before the new download's first progress
  // event (synthetic/preparing progress). Canvas suppression alone is not
  // enough: the center outcome state and lock must be cleared. The effect
  // keys on the current primary Download task identity (a stable object out
  // of the queue state), so a newly-current download fires it regardless of
  // progress events or React batching. The authoritative typed terminal fact
  // in the Download queue state is never touched; requestId generation
  // guards make the dismissed retention timer a stale no-op against any
  // newer outcome.
  useEffect(() => {
    if (!shouldInvalidateTerminalRevealForPrimaryDownload(
      centerOverlayStateRef.current,
      primaryDownloadTask,
    )) {
      return;
    }
    dismissTransientCenterOverlay();
  }, [dismissTransientCenterOverlay, primaryDownloadTask]);

  useEffect(() => onDownloadTerminal((outcome, postReductionState) => {
    // MR4: a terminal whose download is NOT the current primary (per the
    // controller's EXACT post-reduction snapshot) is a background terminal.
    // terminalReceived has already pruned the terminal's own trace, so any
    // non-null primary is necessarily another download: suppress. Only a null
    // primary shows the just-arrived terminal. No React commit timing is
    // involved: the snapshot is captured synchronously at the controller
    // notification boundary.
    if (!shouldShowDownloadTerminalReveal(
      selectPrimaryDownloadTask(postReductionState),
    )) {
      return;
    }
    if (outcome.kind === "success") {
      showForegroundTaskOutcome({
        status: "success",
        error: null,
        durationMs: 1500,
        origin: "terminal",
      });
    } else if (outcome.kind === "cancelled") {
      showForegroundTaskOutcome({
        status: "cancelled",
        error: outcome.errorSummary,
        durationMs: 1500,
        origin: "terminal",
      });
    } else {
      const fallbackMessage = outcome.errorSummary ?? "Unknown download error";
      const diagnostic = buildErrorDiagnosticRequest({
        surface: "download",
        traceId: outcome.traceId,
        failure: outcome.failure ?? { rawMessage: fallbackMessage },
        fallbackMessage,
      });
      showForegroundTaskOutcome({
        status: "failure",
        error: diagnostic.userMessage,
        durationMs: 5000,
        diagnostic,
        origin: "terminal",
      });
    }
  }), [
    buildErrorDiagnosticRequest,
    onDownloadTerminal,
    showForegroundTaskOutcome,
  ]);

  // Listen for output path changes from settings window
  useEffect(() => {
    const unlisten = desktopEvents.on<{ path: string }>("output-path-changed", (event) => {
      setOutputPath(event.payload.path);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = desktopEvents.on<void>("context-menu-closed", () => {
      updateContextMenuOpen(false);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateContextMenuOpen]);

  useEffect(() => () => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer]);

  // Listen for devMode changes from settings window
  useEffect(() => {
    const unlisten = desktopEvents.on<{ enabled: boolean }>("devmode-changed", (event) => {
      setDevMode(event.payload.enabled);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Listen for rename toggle changes from settings window
  useEffect(() => {
    const unlisten = desktopEvents.on<{ enabled: boolean }>("rename-setting-changed", (event) => {
      setRenameMediaOnDownload(Boolean(event.payload.enabled));
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    void desktopEvents.on<AppUpdateStatePayload>(
      "app-update-state",
      (event) => {
        applyAppUpdateState(event.payload);
      },
    ).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => {
      cleanup?.();
    };
  }, [applyAppUpdateState]);

  // Listen for shortcut show event
  useEffect(() => {
    const unlisten = desktopEvents.on<void>("shortcut-show", () => {
      requestFullIntent("shortcut", "instant");
    });
    return () => { unlisten.then(fn => fn()); };
  }, [requestFullIntent]);

  // Hydrate scheduler-owned app update state after startup.
  useEffect(() => {
    if (!isDeferredStartupInitializationReady) {
      return;
    }
    void desktopUpdater.getState()
      .then(applyAppUpdateState)
      .catch((err) => {
        console.error("Failed to load app update state:", err);
      });
  }, [applyAppUpdateState, isDeferredStartupInitializationReady]);

  useEffect(() => {
    const unlisten = desktopEvents.on<RuntimeDependencyGateStatePayload>(
      "runtime-dependency-gate-state",
      (event) => {
        const nextGateState = event.payload;
        startTransition(() => {
          setRuntimeDependencyGateState(nextGateState);
        });
        if (runtimeGateIsActive(nextGateState.phase)) {
          return;
        }
        void refreshRuntimeDependencyStatus();
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshRuntimeDependencyStatus]);

  useEffect(() => {
    const previousPhase = previousRuntimeGatePhaseRef.current;
    const currentPhase = runtimeDependencyGateState?.phase ?? "idle";
    previousRuntimeGatePhaseRef.current = currentPhase;

    const transitionedFromActiveToReady = runtimeGateIsActive(previousPhase) && currentPhase === "ready";
    if (!transitionedFromActiveToReady) {
      if (currentPhase !== "ready" && showRuntimeSuccessIndicator) {
        setShowRuntimeSuccessIndicator(false);
      }
      return;
    }

    setShowRuntimeSuccessIndicator(true);
    setIsRuntimeIndicatorHovered(false);
    if (runtimeSuccessTimerRef.current !== null) {
      clearTimeout(runtimeSuccessTimerRef.current);
    }
    runtimeSuccessTimerRef.current = window.setTimeout(() => {
      setShowRuntimeSuccessIndicator(false);
      runtimeSuccessTimerRef.current = null;
    }, 1120);
  }, [runtimeDependencyGateState?.phase, showRuntimeSuccessIndicator]);

  useEffect(() => {
    const previousTaskCount = previousTaskCountRef.current;
    previousTaskCountRef.current = totalTaskCount;

    if (previousTaskCount > 0 || totalTaskCount === 0) {
      return;
    }

    const currentPhase = runtimeDependencyGateState?.phase ?? "idle";
    if (runtimeGatePhasePreservesDecision(currentPhase)) {
      return;
    }

    void refreshRuntimeDependencyContext();
  }, [refreshRuntimeDependencyContext, runtimeDependencyGateState?.phase, totalTaskCount]);

  // A selecting-quality task appearing opens the queue popover, same as the
  // legacy queue-detail handler. Tracked by task identity so later progress or
  // snapshot events cannot re-open a popover the user closed.
  const lastAdvancedQualityTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    const taskId = selectAdvancedQualitySelectionTask(downloadState)?.traceId ?? null;
    if (taskId !== null && taskId !== lastAdvancedQualityTaskIdRef.current) {
      setIsQueuePopoverOpen(true);
    }
    lastAdvancedQualityTaskIdRef.current = taskId;
  }, [downloadState]);

  useEffect(() => {
    const unlistenCount = desktopEvents.on<VideoTranscodeQueueStatePayload>("video-transcode-queue-count", (event) => {
      const { state } = applyVideoTranscodeQueueStateEvent(event.payload, {});
      setVideoTranscodeQueueState(state);
      if (state.activeCount === 0) {
        setTranscodeProgressByTrace((current) =>
          clearTranscodeProgressWhenInactive(state, current)
        );
      }
    });

    const unlistenDetail = desktopEvents.on<VideoTranscodeQueueDetailPayload>("video-transcode-queue-detail", (event) => {
      const normalized = normalizeVideoTranscodeQueueDetail(event.payload);
      setVideoTranscodeQueueDetail(normalized);
    });

    const unlistenProgress = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-progress", async (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }

      await prepareMainWindowForForegroundTask();
      dismissTransientCenterOverlay();
      setTranscodeProgressByTrace((current) =>
        applyNormalizedTranscodeProgressToMap(current, normalized)
      );
      setVideoTranscodeQueueDetail((current) =>
        applyNormalizedTranscodeProgressToDetail(current, normalized)
      );
    });

    const unlistenQueued = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-queued", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      setVideoTranscodeQueueDetail((current) =>
        upsertTranscodeTaskToDetail(current, normalized)
      );
    });

    const unlistenRetried = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-retried", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      removePendingTranscodeActionTraceId(normalized.traceId);
      setVideoTranscodeQueueDetail((current) =>
        upsertTranscodeTaskToDetail(current, normalized)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, normalized.traceId)
      );
    });

    const unlistenRemoved = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-removed", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      removePendingTranscodeActionTraceId(normalized.traceId);
      setVideoTranscodeQueueDetail((current) =>
        removeTranscodeTaskFromDetail(current, normalized.traceId)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, normalized.traceId)
      );
    });

    const unlistenFailed = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-failed", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      removePendingTranscodeActionTraceId(normalized.traceId);
      setVideoTranscodeQueueDetail((current) =>
        upsertTranscodeTaskToDetail(current, normalized)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, normalized.traceId)
      );
      const fallbackMessage = normalized.error ?? getTranscodeStageLabel(i18n.t, "failed");
      const diagnostic = buildErrorDiagnosticRequest({
        surface: "transcode",
        traceId: normalized.traceId,
        failure: normalized.failure ?? { rawMessage: fallbackMessage },
        fallbackMessage,
      });
      showForegroundTaskOutcome({
        status: "failure",
        source: "transcode",
        error: diagnostic.userMessage,
        durationMs: 5000,
        diagnostic,
      });
      showQueueNotice(t("app.queue.transcodeFailedNotice"));
    });

    const unlistenComplete = desktopEvents.on<VideoTranscodeCompletePayload>("video-transcode-complete", (event) => {
      const payload = event.payload;
      removePendingTranscodeActionTraceId(payload.traceId);
      setVideoTranscodeQueueDetail((current) =>
        removeTranscodeTaskFromDetail(current, payload.traceId)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, payload.traceId)
      );
      showForegroundTaskOutcome({
        status: "success",
        source: "transcode",
        error: null,
        durationMs: 1400,
      });
      showQueueNotice(t("app.queue.transcodeCompleted"));
    });

    return () => {
      unlistenCount.then((fn) => fn());
      unlistenDetail.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
      unlistenQueued.then((fn) => fn());
      unlistenRetried.then((fn) => fn());
      unlistenRemoved.then((fn) => fn());
      unlistenFailed.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, [
    buildErrorDiagnosticRequest,
    dismissTransientCenterOverlay,
    prepareMainWindowForForegroundTask,
    removePendingTranscodeActionTraceId,
    showForegroundTaskOutcome,
    showQueueNotice,
    t,
  ]);

  useEffect(() => {
    if (totalTaskCount === 0) {
      setIsQueuePopoverOpen(false);
    }
  }, [totalTaskCount]);

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

  useEffect(() => {
    if (runtimeGateIsBusy) {
      requestFullIntent("runtimeGate", "animated");
    }
  }, [requestFullIntent, runtimeGateIsBusy]);

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

  // Handle paste event - check for video URL first, then image URL, then clipboard images/files.
  const handlePaste = async (
    clipboardData: DataTransfer | null,
    intakeOrigin?: LocalIntakeOrigin,
  ) => {
    const text = clipboardData?.getData("text/plain") ?? "";

    // 1. Check if clipboard text is a video URL (highest priority)
    if (text && isResolvableVideoInputUrl(text)) {
      console.log("Pasted video URL:", text);
      await enqueuePastedVideoDownload(text, intakeOrigin);
      return;
    }

    // 2. Check if clipboard text is an image URL
    if (text && isImageUrl(text)) {
      console.log("Pasted image URL:", text);
      await runForegroundImageTask(async () => {
        // Distinguish between Data URL and HTTP URL
        if (text.startsWith("data:image/")) {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: text,
            targetDir: outputPath || null,
          });
          console.log("Save data URL result:", result);
        } else {
          const result = await desktopCommands.invoke<string>("download_image", {
            url: text,
            targetDir: outputPath || null,
          });
          console.log("Download result:", result);
        }
      }, "Failed to process pasted image URL:");
      return;
    }

    // 3. Try the image/file payload exposed directly on the paste event first.
    const pastedImageFile = extractClipboardImageFile(clipboardData);
    if (pastedImageFile) {
      console.log(
        "Detected clipboard image file from paste event:",
        pastedImageFile.name || "<unnamed>",
      );
      await runForegroundImageTask(async () => {
        const dataUrl = await fileToDataUrl(pastedImageFile);
        const result = await desktopCommands.invoke<string>("save_data_url", {
          dataUrl,
          targetDir: outputPath || null,
          originalFilename: pastedImageFile.name || undefined,
        });
        console.log("Save clipboard image file result:", result);
      }, "Failed to save clipboard image file:");
      return;
    }

    // 4. Some screenshot tools expose the image only through pasted HTML.
    const pastedHtml = clipboardData?.getData("text/html") ?? "";
    const pastedHtmlImageUrl = pastedHtml ? extractImageUrlFromHtml(pastedHtml) : null;
    if (pastedHtmlImageUrl) {
      console.log("Detected clipboard image from HTML payload:", pastedHtmlImageUrl);
      await runForegroundImageTask(async () => {
        if (pastedHtmlImageUrl.startsWith("data:image/")) {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: pastedHtmlImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Save clipboard HTML image result:", result);
        } else {
          const result = await desktopCommands.invoke<string>("download_image", {
            url: pastedHtmlImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Download clipboard HTML image result:", result);
        }
      }, "Failed to process clipboard HTML image:");
      return;
    }

    // 5. Try reading a clipboard image through the desktop bridge.
    try {
      const clipboardImageDataUrl = await readClipboardImageDataUrl();
      if (clipboardImageDataUrl) {
        console.log("Detected clipboard image, saving to output folder");
        await runForegroundImageTask(async () => {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: clipboardImageDataUrl,
            targetDir: outputPath || null,
          });
          console.log("Save clipboard image result:", result);
        }, "Failed to save clipboard image:");
        return;
      }
    } catch (err) {
      console.warn("Clipboard image is not available for paste:", err);
    }

    // 6. Otherwise, continue with file processing logic.
    try {
      const paths = await desktopCommands.invoke<string[]>("get_clipboard_files");

      if (paths && paths.length > 0) {
        console.log("Clipboard files from backend:", paths);
        resetDownloadOutcome();
        await startForegroundProcessing();

        try {
          const result = await desktopCommands.invoke<ProcessFilesResult>("process_files", {
            paths,
            targetDir: outputPath || null
          });
          if (result.items.some((item) => item.status === "failed")) {
            console.warn("Some clipboard files failed to process:", result);
          }
        } catch (err) {
          console.warn("Failed to process clipboard files:", err);
          checkSequenceOverflow(err);
        }

        scheduleForegroundProcessingDismiss(1000);
      } else {
        console.warn("No pasteable clipboard image or files detected");
      }
    } catch (err) {
      console.warn("Failed to get clipboard files:", err);
    }
  };

  pasteHandlerRef.current = (clipboardData, origin) => {
    void handlePaste(clipboardData, origin);
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
      /(?:^|\.)sinaimg\.cn\//i,
      /cdn\.discordapp\.com/i,
      /xhscdn\.com\/.*(?:imageView2|format\/(?:jpe?g|png|webp|gif))/i,
      /sns-webpic[^/]*\.xhscdn\.com/i,
    ];
    return imagePatterns.some(pattern => pattern.test(url));
  };

  // Handle native drop event for URL detection. Drop presentation state
  // (drag hover, drop lock, dragleave suppression) is owned by the
  // presentation surface; this handler only processes dropped content.
  const handleDrop = async (e: React.DragEvent) => {
    // Capture before the first await. This point is a transient Presentation
    // cause only and is never reread during acceptance or reduction.
    const intakeOrigin = mainWindowFullContentVisible
      ? snapshotClientPointOrigin(
          e.clientX,
          e.clientY,
          e.currentTarget.getBoundingClientRect(),
        )
      : undefined;
    const droppedFolderResult = await desktopDrop.consumePendingFolderDrop();
    if (droppedFolderResult?.success) {
      try {
        await saveOutputPath(droppedFolderResult.path);
        setOutputPath(droppedFolderResult.path);
        resetDownloadOutcome();
        showFolderDropOutcome(intakeOrigin);
      } catch (err) {
        console.error("Failed to save dropped folder path:", err);
        showFolderDropErrorOutcome(t("app.drop.errors.saveFailed"));
      }
      return;
    }

    if (droppedFolderResult && shouldHandleDroppedFolderResult(droppedFolderResult)) {
      console.error("Failed to resolve dropped folder:", droppedFolderResult);
      showFolderDropErrorOutcome(t(getDroppedFolderErrorTranslationKey(droppedFolderResult.reason)));
      return;
    }

    const droppedFilePaths = await desktopDrop.consumePendingFileDropPaths();
    if (droppedFilePaths.length > 0) {
      console.log("Detected dragged local file path payload, moving via process_files:", droppedFilePaths);
      resetDownloadOutcome();
      await startForegroundProcessing();

      try {
        const result = await desktopCommands.invoke<ProcessFilesResult>("process_files", {
          paths: droppedFilePaths,
          targetDir: outputPath || null,
          operation: "move",
        });
        if (result.items.some((item) => item.status === "failed")) {
          console.error("Some dropped local files failed to move:", result);
        }
      } catch (err) {
        console.error("Failed to move dropped local files:", err);
        checkSequenceOverflow(err);
      }

      scheduleForegroundProcessingDismiss(1000);
      return;
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
    const rawProtectedImageDrag = e.dataTransfer.getData("application/x-ameow-protected-image-drag");
    const rawXiaohongshuDrag = e.dataTransfer.getData("application/x-ameow-xiaohongshu-drag");
    const embeddedPinterestDragPayload =
      extractEmbeddedPinterestDragPayload(html) ??
      extractEmbeddedPinterestDragPayload(rawPlain) ??
      extractEmbeddedPinterestDragPayload(rawUriList);
    const embeddedXiaohongshuDragPayload =
      extractEmbeddedXiaohongshuDragPayload(rawXiaohongshuDrag) ??
      extractEmbeddedXiaohongshuDragPayload(rawPlain) ??
      extractEmbeddedXiaohongshuDragPayload(rawUriList) ??
      extractEmbeddedXiaohongshuDragPayload(html);
    const protectedImageDragPayload =
      extractEmbeddedProtectedImageDragPayload(rawProtectedImageDrag) ??
      extractEmbeddedProtectedImageDragPayload(rawPlain) ??
      extractEmbeddedProtectedImageDragPayload(rawUriList) ??
      extractEmbeddedProtectedImageDragPayload(html);

    // Check for URL in dataTransfer
    // Note: text/uri-list may return "about:blank#blocked" due to security policy
    let url = pickDroppedUrl(rawUriList);
    if (!url || url === "about:blank#blocked" || url.startsWith("about:")) {
      url = pickDroppedUrl(rawPlain);
    }
    if ((!url || url === "about:blank#blocked" || url.startsWith("about:")) && embeddedPinterestDragPayload?.pageUrl) {
      url = embeddedPinterestDragPayload.pageUrl;
    }
    if ((!url || url === "about:blank#blocked" || url.startsWith("about:")) && embeddedXiaohongshuDragPayload?.pageUrl) {
      url = embeddedXiaohongshuDragPayload.pageUrl;
    }

    const droppedVideoFiles = filterDroppedFilesByMimePrefix(e.dataTransfer, "video/");
    if (droppedVideoFiles.length > 0) {
      console.log("Detected dragged video file payload, saving directly from dataTransfer.files");
      resetDownloadOutcome();
      await startForegroundProcessing();

      await saveDroppedFilesToOutput(droppedVideoFiles, outputPath || null);

      scheduleForegroundProcessingDismiss(1000);
      return;
    }

    // === 优先处理本地文件 file:// URL ===
    if (url && url.startsWith("file://")) {
      const localPath = parseLocalFileUrl(url) ?? decodeURIComponent(url.replace("file:///", ""));
      console.log("Detected local file URL:", localPath);
      resetDownloadOutcome();
      await startForegroundProcessing();

      try {
        const copyResult = await desktopCommands.invoke<ProcessFilesResult>("process_files", {
          paths: [localPath],
          targetDir: outputPath || null,
        });
        console.log("Copy local file result:", copyResult);
      } catch (err) {
        console.error("Failed to copy local file:", err);
        checkSequenceOverflow(err);
      }

      scheduleForegroundProcessingDismiss(1000);
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
          await runForegroundImageTask(async () => {
            await desktopCommands.invoke<string>("download_image", {
              url: imageUrl,
              targetDir: outputPath || null,
            });
          }, "Failed to download Pinterest image:");
          return;
        }
      }

      const videoSelection = extractPinterestVideoSelectionFromHtml(html);
      const mergedVideoCandidates = mergeVideoCandidatesByUrl(
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
      await enqueueVideoDownload({
        url,
        pageUrl: embeddedPinterestDragPayload?.pageUrl ?? url,
        videoUrl: mergedVideoUrl,
        videoCandidates: mergedVideoCandidates,
        dragDiagnostic: pinterestDragDiagnostic,
      }, intakeOrigin);
      return;
    }

    const xiaohongshuPageUrl =
      embeddedXiaohongshuDragPayload?.pageUrl
      ?? (url && isXiaohongshuPageUrl(url) ? url : null);
    if (xiaohongshuPageUrl) {
      let resolvedXiaohongshuMedia: XiaohongshuResolvedDragMedia | null = null;

      try {
        resolvedXiaohongshuMedia = await desktopCommands.invoke<XiaohongshuResolvedDragMedia | null>("resolve_xiaohongshu_drag_media", {
          url: xiaohongshuPageUrl,
          pageUrl: xiaohongshuPageUrl,
          detailUrl: embeddedXiaohongshuDragPayload?.detailUrl ?? undefined,
          sourcePageUrl: embeddedXiaohongshuDragPayload?.sourcePageUrl ?? undefined,
          token: embeddedXiaohongshuDragPayload?.token ?? undefined,
          noteId: embeddedXiaohongshuDragPayload?.noteId ?? undefined,
          imageUrl:
            embeddedXiaohongshuDragPayload?.exactImageUrl
            ?? embeddedXiaohongshuDragPayload?.imageUrl
            ?? undefined,
          mediaType: embeddedXiaohongshuDragPayload?.mediaType ?? undefined,
          videoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? undefined,
          videoIntentSources: embeddedXiaohongshuDragPayload?.videoIntentSources ?? undefined,
        });
      } catch (error) {
        console.error("[Xiaohongshu drag debug] resolve_xiaohongshu_drag_media failed:", error);
      }

      console.log("[Xiaohongshu drag debug] resolved drag media payload:", {
        pageUrl: xiaohongshuPageUrl,
        detailUrl: embeddedXiaohongshuDragPayload?.detailUrl ?? null,
        sourcePageUrl: embeddedXiaohongshuDragPayload?.sourcePageUrl ?? null,
        token: embeddedXiaohongshuDragPayload?.token ?? null,
        noteId: embeddedXiaohongshuDragPayload?.noteId ?? null,
        requestedImageUrl:
          embeddedXiaohongshuDragPayload?.exactImageUrl
          ?? embeddedXiaohongshuDragPayload?.imageUrl
          ?? null,
        resultKind: resolvedXiaohongshuMedia?.kind ?? "null",
        resultVideoUrl: resolvedXiaohongshuMedia?.videoUrl ?? null,
        resultVideoCandidatesCount: resolvedXiaohongshuMedia?.videoCandidates.length ?? 0,
        resultImageUrl: resolvedXiaohongshuMedia?.imageUrl ?? null,
        embeddedVideoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? null,
        embeddedVideoIntentSources: embeddedXiaohongshuDragPayload?.videoIntentSources ?? [],
        resolvedVideoIntentConfidence: resolvedXiaohongshuMedia?.videoIntentConfidence ?? null,
        resolvedVideoIntentSources: resolvedXiaohongshuMedia?.videoIntentSources ?? [],
      });

      const shouldQueueResolvedXiaohongshuVideo =
        Boolean(xiaohongshuPageUrl)
        && (
          embeddedXiaohongshuDragPayload?.mediaType === "video"
          || hasXiaohongshuVideoSignals(embeddedXiaohongshuDragPayload
            ? {
                kind: embeddedXiaohongshuDragPayload.mediaType ?? "unknown",
                videoUrl: embeddedXiaohongshuDragPayload.videoUrl,
                videoCandidates: embeddedXiaohongshuDragPayload.videoCandidates,
                videoIntentConfidence: embeddedXiaohongshuDragPayload.videoIntentConfidence,
              }
            : null)
          || hasXiaohongshuVideoSignals(resolvedXiaohongshuMedia)
        );
      console.log("[Xiaohongshu drag debug] video queue decision:", {
        pageUrl: xiaohongshuPageUrl,
        token: embeddedXiaohongshuDragPayload?.token ?? null,
        noteId: embeddedXiaohongshuDragPayload?.noteId ?? null,
        embeddedMediaType: embeddedXiaohongshuDragPayload?.mediaType ?? null,
        embeddedHasVideoUrl: Boolean(embeddedXiaohongshuDragPayload?.videoUrl),
        embeddedVideoCandidatesCount: embeddedXiaohongshuDragPayload?.videoCandidates.length ?? 0,
        embeddedVideoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? null,
        embeddedVideoIntentSources: embeddedXiaohongshuDragPayload?.videoIntentSources ?? [],
        resolvedKind: resolvedXiaohongshuMedia?.kind ?? "null",
        resolvedVideoUrl: resolvedXiaohongshuMedia?.videoUrl ?? null,
        resolvedVideoCandidatesCount: resolvedXiaohongshuMedia?.videoCandidates.length ?? 0,
        resolvedVideoIntentConfidence: resolvedXiaohongshuMedia?.videoIntentConfidence ?? null,
        resolvedVideoIntentSources: resolvedXiaohongshuMedia?.videoIntentSources ?? [],
        shouldQueueResolvedXiaohongshuVideo,
      });

      if (shouldQueueResolvedXiaohongshuVideo) {
        console.log("[Xiaohongshu drag debug] queueing resolved video media:", {
          pageUrl: resolvedXiaohongshuMedia?.pageUrl ?? xiaohongshuPageUrl,
          resolvedKind: resolvedXiaohongshuMedia?.kind ?? "null",
          embeddedMediaType: embeddedXiaohongshuDragPayload?.mediaType ?? null,
          embeddedVideoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? null,
          resolvedVideoIntentConfidence: resolvedXiaohongshuMedia?.videoIntentConfidence ?? null,
        });
        resetDownloadOutcome();
        await enqueueVideoDownload({
          url: resolvedXiaohongshuMedia?.pageUrl ?? xiaohongshuPageUrl,
          pageUrl: resolvedXiaohongshuMedia?.pageUrl ?? xiaohongshuPageUrl,
          videoUrl: resolvedXiaohongshuMedia?.videoUrl ?? undefined,
          videoCandidates: resolvedXiaohongshuMedia?.videoCandidates ?? undefined,
          siteHint: "xiaohongshu",
        }, intakeOrigin);
        return;
      }

      const resolvedXiaohongshuImageUrl = pickXiaohongshuImageForDownload({
        embeddedPayload: embeddedXiaohongshuDragPayload,
        resolvedMedia: resolvedXiaohongshuMedia,
      });
      if (resolvedXiaohongshuImageUrl) {
        console.log("[Xiaohongshu drag debug] resolved page image media:", {
          pageUrl: xiaohongshuPageUrl,
          imageUrl: resolvedXiaohongshuImageUrl,
        });
        await runForegroundImageTask(async () => {
          const result = await desktopCommands.invoke<string>("download_image", {
            url: resolvedXiaohongshuImageUrl,
            targetDir: outputPath || null,
            pageUrl: xiaohongshuPageUrl,
            requestHeaders: {
              Referer: xiaohongshuPageUrl,
              Origin: "https://www.xiaohongshu.com",
            },
          });
          console.log("Download result:", result);
        }, "Failed to process Xiaohongshu resolved page image:");
        return;
      }

      console.warn("[Xiaohongshu drag debug] no media resolved; skipping generic fallback for Xiaohongshu page", {
        pageUrl: xiaohongshuPageUrl,
        resolvedKind: resolvedXiaohongshuMedia?.kind ?? "null",
        embeddedMediaType: embeddedXiaohongshuDragPayload?.mediaType ?? null,
      });
      return;
    }

    const htmlImageUrl = extractImageUrlFromHtml(html, {
      baseUrl: /^https?:\/\//i.test(url) ? url : null,
    });
    const shouldPreferTwitterXImageBranch = shouldPreferTwitterXImageDrop({
      dropUrl: url,
      html,
      htmlImageUrl,
    });
    const resolvedImageUrl =
      url && isImageUrl(url)
        ? url
        : (
            shouldPreferTwitterXImageBranch
            || !url
            || !isResolvableVideoInputUrl(url)
          )
          ? htmlImageUrl
          : null;
    const resolvedImagePageUrl = (() => {
      if (protectedImageDragPayload?.pageUrl) {
        return canonicalizeTwitterXPageUrl(protectedImageDragPayload.pageUrl) ?? protectedImageDragPayload.pageUrl;
      }
      if (
        url
        && resolvedImageUrl
        && url !== resolvedImageUrl
        && /^https?:\/\//i.test(url)
      ) {
        return canonicalizeTwitterXPageUrl(url) ?? url;
      }
      return null;
    })();

    // Check if it's a video URL (highest priority)
    if (url && isResolvableVideoInputUrl(url) && !shouldPreferTwitterXImageBranch) {
      console.log("Detected video URL:", url);
      resetDownloadOutcome();
      await enqueueVideoDownload(url, intakeOrigin);
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
      await runForegroundImageTask(async () => {
        const protectedImageFallback =
          protectedImageDragPayload &&
          (!protectedImageDragPayload.imageUrl || protectedImageDragPayload.imageUrl === resolvedImageUrl)
            ? {
                token: protectedImageDragPayload.token,
                pageUrl: protectedImageDragPayload.pageUrl,
                imageUrl: protectedImageDragPayload.imageUrl ?? resolvedImageUrl,
              }
            : null;

        if (protectedImageFallback) {
          console.log("Protected image drag payload detected:", protectedImageFallback);
        }

        // Distinguish between Data URL, file:// URL, and HTTP URL
        if (resolvedImageUrl.startsWith("data:image/")) {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: resolvedImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Save data URL result:", result);
        } else if (resolvedImageUrl.startsWith("file://")) {
          // Convert file:// URL to local path
          const localPath =
            parseLocalFileUrl(resolvedImageUrl)
            ?? decodeURIComponent(resolvedImageUrl.replace("file:///", ""));
          console.log("Detected local file:", localPath);

          // First try to copy from local path
          const copyResult = await desktopCommands.invoke<ProcessFilesResult>("process_files", {
            paths: [localPath],
            targetDir: outputPath || null,
          });
          console.log("Copy result:", copyResult);

          // If copy failed (0 files), try reading from dataTransfer.files
          if (copyResult.processedCount === 0 && e.dataTransfer.files.length > 0) {
            console.log("Local file not found, trying dataTransfer.files...");
            const droppedImageFiles = filterDroppedFilesByMimePrefix(e.dataTransfer, "image/");
            const savedCount = await saveDroppedFilesToOutput(droppedImageFiles, outputPath || null);
            console.log("Saved image files from dataTransfer.files fallback:", savedCount);
          }
        } else {
          try {
            const imageQualityUpgrade = await upgradeImageUrl({
              imageUrl: resolvedImageUrl,
              pageUrl: resolvedImagePageUrl,
            });
            const finalImageUrl = imageQualityUpgrade.upgradedUrl ?? resolvedImageUrl;
            console.log("Image quality upgrade decision:", {
              originalUrl: resolvedImageUrl,
              finalUrl: finalImageUrl,
              strategy: imageQualityUpgrade.strategy,
              confidence: imageQualityUpgrade.confidence,
              notes: imageQualityUpgrade.notes,
              requestHeaders: imageQualityUpgrade.requestHeaders ?? null,
            });
            const result = await desktopCommands.invoke<string>("download_image", {
              url: finalImageUrl,
              targetDir: outputPath || null,
              protectedImageFallback,
              pageUrl: resolvedImagePageUrl,
              requestHeaders: imageQualityUpgrade.requestHeaders,
            });
            console.log("Download result:", result);
          } catch (downloadErr) {
            const droppedImageFiles = filterDroppedFilesByMimePrefix(e.dataTransfer, "image/");
            if (protectedImageFallback && droppedImageFiles.length > 0) {
              console.warn(
                "Protected image download failed, falling back to dragged image file payloads:",
                downloadErr,
              );
              const savedCount = await saveDroppedFilesToOutput(
                droppedImageFiles,
                outputPath || null,
              );
              if (savedCount > 0) {
                console.log("Saved protected image from dataTransfer.files fallback:", savedCount);
              } else {
                throw downloadErr;
              }
            } else {
              throw downloadErr;
            }
          }
        }
      }, "Failed to process image:");
      return;
    }

    // If URL not recognized but files exist, try reading from dataTransfer.files
    if (e.dataTransfer.files.length > 0) {
      console.log("URL not recognized, trying dataTransfer.files...");
      resetDownloadOutcome();
      await startForegroundProcessing();

      const savedCount = await saveDroppedFilesToOutput(
        Array.from(e.dataTransfer.files),
        outputPath || null,
      );
      console.log("Saved files from dataTransfer.files fallback:", savedCount);

      scheduleForegroundProcessingDismiss(1000);
      return;
    }

    // If not a URL and no files, let the desktop runtime handle it
    console.log("Not an image URL and no files, letting the desktop runtime handle it");
  };

  // Open settings window
  const openSettings = async (options?: {
    page?: "sites";
  }) => {
    if (isContextMenuOpen) {
      await closeContextMenuWindow();
    }

    if (await desktopWindows.has("settings")) {
      await desktopWindows.focus("settings");
      if (options?.page === "sites") {
        await desktopEvents.emit("settings-page-requested", {
          page: "sites",
        });
      }
      return;
    }

    await desktopWindows.openSettings({
      title: t("app.windows.settingsTitle"),
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      alwaysOnTop: true,
      routePath: options?.page === "sites"
        ? "/settings?docsPage=sites"
        : undefined,
    });
  };

  const resetRenameCounter = async () => {
    try {
      await desktopCommands.invoke<boolean>("reset_rename_counter");
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

  const handleRuntimeDependencyRecheck = async () => {
    setIsRuntimeRetryInFlight(true);
    setIsRuntimeRetryFeedbackVisible(true);
    if (runtimeRetryFeedbackTimerRef.current !== null) {
      clearTimeout(runtimeRetryFeedbackTimerRef.current);
    }
    runtimeRetryFeedbackTimerRef.current = window.setTimeout(() => {
      setIsRuntimeRetryFeedbackVisible(false);
      runtimeRetryFeedbackTimerRef.current = null;
    }, 180);

    try {
      const { status } = await refreshRuntimeDependencyContext();
      if (hasMissingManagedRuntimeComponents(status)) {
        await startRuntimeDependencyBootstrap("runtime_indicator_manual");
      }
    } finally {
      setIsRuntimeRetryInFlight(false);
    }
  };

  // 右键菜单 (the presentation surface calls this after its own drag reset)
  const handleContextMenu = async (e: React.MouseEvent) => {
    try {
      await closeContextMenuWindow();

      const currentWindow = desktopCurrentWindow;
      const [outerPosition, monitor] = await Promise.all([
        currentWindow.outerPosition(),
        desktopSystem.currentMonitor(),
      ]);

      let x = outerPosition.x + e.clientX;
      let y = outerPosition.y + e.clientY;

      if (monitor) {
        const monitorX = monitor.position.x;
        const monitorY = monitor.position.y;
        const monitorWidth = monitor.size.width;
        const monitorHeight = monitor.size.height;
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

      await desktopWindows.openContextMenu({
        title: t("app.windows.contextMenuTitle"),
        x,
        y,
        width: CONTEXT_MENU_WIDTH,
        height: CONTEXT_MENU_HEIGHT,
        alwaysOnTop: true,
        skipTaskbar: true,
        focus: true,
        parent: "main",
      });
      updateContextMenuOpen(true);
    } catch (err) {
      updateContextMenuOpen(false);
      console.error("Failed to open context menu window:", err);
    }
  };

  const shouldRenderMiniControls = mainWindowFullContentVisible && isPanelHovered;
  const miniControlsPresenceTransition = shouldReduceMotion
    ? { duration: 0.01 }
    : { duration: 0.12, ease: [0.22, 1, 0.36, 1] as const };
  const shouldShowAppUpdateIndicator = !!appUpdateInfo && (
    appUpdatePhase === "available"
    || appUpdatePhase === "checking"
    || appUpdatePhase === "downloading"
    || appUpdatePhase === "installing"
    || appUpdatePhase === "error"
  );
  const appUpdateIndicatorTitle = (() => {
    if (!appUpdateInfo) {
      return "";
    }

    if (appUpdatePhase === "downloading") {
      return appUpdateInfo.installMode === "portable"
        ? t("app.actions.downloadPortableAppUpdate")
        : t("app.actions.downloadAppUpdate");
    }

    if (appUpdatePhase === "installing") {
      return appUpdateInfo.installMode === "portable"
        ? t("app.actions.installPortableAppUpdate")
        : t("app.actions.installAppUpdate");
    }

    if (appUpdatePhase === "error") {
      const retryTitle = t("app.actions.retryAppUpdate", {
        current: appUpdateInfo.current,
        latest: appUpdateInfo.latest,
      });
      return appUpdateError ? `${retryTitle}\n${appUpdateError}` : retryTitle;
    }

    if (appUpdateInfo.installMode === "manual") {
      return t("app.actions.openManualAppUpdate", {
        current: appUpdateInfo.current,
        latest: appUpdateInfo.latest,
      });
    }

    return t("app.actions.updateApp", {
      current: appUpdateInfo.current,
      latest: appUpdateInfo.latest,
    });
  })();
  const isPrimaryTaskActionPending = primaryTask?.kind === "download"
    ? selectIsTaskCancelling(downloadState, primaryTask.task.traceId)
    : primaryTask?.kind === "transcode"
      ? pendingTranscodeActionTraceIds.includes(primaryTask.task.traceId)
      : false;
  const primaryTaskStatusText = primaryTask
    ? primaryTask.statusText
    : "";
  const primaryTaskSummaryText = queueNoticeMessage
    ? queueNoticeMessage
    : isPrimaryTaskActionPending
      ? primaryTask?.kind === "transcode"
        ? t("app.queue.cancellingCurrentTranscode")
        : t("app.queue.cancellingCurrent")
      : remainingDownloadCount > 0 || remainingTranscodeCount > 0
        ? t("app.queue.remainingSummary", {
            downloadCount: remainingDownloadCount,
            transcodeCount: remainingTranscodeCount,
        })
          : "";
  const advancedQualitySelectionTask = selectAdvancedQualitySelectionTask(downloadState);
  const isAdvancedQualitySelectionPopover = isQueuePopoverOpen && advancedQualitySelectionTask !== null;
  const getAdvancedQualityTaskTitle = (task: DownloadTask): string => (
    task.videoTitle?.trim() || task.label
  );
  const getAdvancedQualityPostProcessBadge = (
    option: AdvancedQualityOption,
  ): string | null => {
    if (option.postProcessPlan === "remux_only") {
      return "封装";
    }
    if (option.postProcessPlan === "audio_transcode" || option.postProcessPlan === "full_transcode") {
      return "转码";
    }
    return null;
  };
  const renderAdvancedQualityOptionButton = (
    task: DownloadTask,
    option: AdvancedQualityOption,
    density: "popover" | "inline",
  ) => {
    const hoverKey = `${task.traceId}:${option.id}:${density}`;
    const isHovered = hoveredAdvancedQualityOptionId === hoverKey;
    const badge = getAdvancedQualityPostProcessBadge(option);

    return (
      <button
        key={option.id}
        onClick={() => {
          void selectAdvancedQualityOption(task.traceId, option.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setHoveredAdvancedQualityOptionId(hoverKey)}
        onMouseLeave={() => setHoveredAdvancedQualityOptionId((current) => (
          current === hoverKey ? null : current
        ))}
        onFocus={() => setHoveredAdvancedQualityOptionId(hoverKey)}
        onBlur={() => setHoveredAdvancedQualityOptionId((current) => (
          current === hoverKey ? null : current
        ))}
        style={{
          minHeight: density === "popover" ? 36 : 30,
          width: '100%',
          border: `1px solid ${isHovered ? colors.accentBorder : colors.fieldBorder}`,
          background: isHovered
            ? `linear-gradient(180deg, ${colors.fieldHoverBg} 0%, ${colors.fieldBg} 100%)`
            : `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgSecondary} 100%)`,
          color: colors.textPrimary,
          borderRadius: 10,
          padding: density === "popover" ? '0 10px' : '0 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: 'pointer',
          boxShadow: isHovered
            ? `inset 0 0 0 1px ${colors.accentBorder}, 0 0 10px -6px ${colors.accentGlow}`
            : `inset 0 0 0 1px ${colors.borderStart}`,
          transition: 'border-color 0.16s cubic-bezier(0.22, 1, 0.36, 1), background 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.16s cubic-bezier(0.22, 1, 0.36, 1), transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        title={option.label}
      >
        <span
          style={{
            minWidth: 0,
            flex: 1,
            fontSize: density === "popover" ? 13 : 11,
            fontWeight: 700,
            lineHeight: 1,
            color: isHovered ? colors.accentText : colors.textPrimary,
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {option.label}
        </span>
        {badge ? (
          <span
            style={{
              flexShrink: 0,
              borderRadius: 999,
              padding: density === "popover" ? '2px 6px' : '1px 5px',
              border: `1px solid ${colors.warningBorder}`,
              backgroundColor: colors.warningSurface,
              color: colors.warningText,
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {badge}
          </span>
        ) : null}
      </button>
    );
  };
  const showVideoTaskBadge = shouldShowVideoTaskBadge({
    totalTaskCount,
    isQueuePopoverOpen,
    isAdvancedQualitySelectionPopover,
  });
  const runtimeMissingComponents = runtimeDependencyGateState?.missingComponents.length
    ? runtimeDependencyGateState.missingComponents
    : getMissingRuntimeComponentsFromStatus(runtimeDependencyStatus);
  const hasRuntimeGateIssue = shouldEvaluateDeferredStartupIndicators && (
    runtimeGatePhaseNeedsAttention(runtimeGatePhase)
    || runtimeMissingComponents.length > 0
    || runtimeDependencyStatus === null
  );
  const runtimeGateRequiresManualAction = runtimeGateNeedsManualAction(runtimeGatePhase)
    || (!runtimeGateIsBusy && runtimeDependencyStatus === null);
  const shouldShowRuntimeIndicator = mainWindowFullContentVisible && !isQueuePopoverOpen && (
    showRuntimeSuccessIndicator
    || hasRuntimeGateIssue
  );
  const runtimeIndicatorHeadline = getRuntimeGateHeadline(t, runtimeDependencyGateState);
  const runtimeIndicatorProgressLabel = getRuntimeGateProgressLabel(t, runtimeDependencyGateState);
  const runtimeIndicatorNextLabel = getRuntimeGateNextLabel(t, runtimeDependencyGateState);
  const runtimeIndicatorErrorSummary = summarizeRuntimeGateError(runtimeDependencyGateState?.lastError);
  const runtimeIndicatorFallbackSummary = runtimeMissingComponents.length > 0
    ? t("settings.downloaders.runtime.missingItems", {
        items: runtimeMissingComponents.join(", "),
      })
    : runtimeDependencyStatus
      ? t("settings.downloaders.runtime.allReady")
      : t("settings.downloaders.runtime.unavailable");
  const runtimeIndicatorStatusText = runtimeGateRequiresManualAction
    ? runtimeIndicatorErrorSummary ?? runtimeIndicatorFallbackSummary
    : runtimeIndicatorProgressLabel ?? runtimeIndicatorFallbackSummary;
  const runtimeIndicatorFooterText = runtimeIndicatorNextLabel
    ?? (runtimeGateRequiresManualAction ? t("app.runtime.manualHint") : null);
  const runtimeIndicatorProgressPercent = clampRuntimeGateProgressPercent(
    runtimeDependencyGateState?.progressPercent,
  );
  const runtimeIndicatorShouldRenderRing = (
    runtimeGateIsBusy
    || showRuntimeSuccessIndicator
    || (hasRuntimeGateIssue && !runtimeGateRequiresManualAction)
  );
  const runtimeIndicatorIsIndeterminate = runtimeIndicatorShouldRenderRing
    && !showRuntimeSuccessIndicator
    && runtimeIndicatorProgressPercent === null;
  const runtimeIndicatorTitle = runtimeGateRequiresManualAction
    ? runtimeIndicatorErrorSummary ?? runtimeIndicatorFallbackSummary
    : runtimeIndicatorProgressLabel ?? runtimeIndicatorHeadline;
  return (
    <MainWindowPresentationSurface
      presentation={presentation}
      environment={{
        platform: currentMainWindowPlatform,
        isMacOS,
        supportsCompactPassthrough: supportsCompactPassthroughHotspot,
        reducedMotion: Boolean(shouldReduceMotion),
        startsCompact: !startsExpandedOnLaunch,
      }}
      locks={presentationLocks}
      primaryTaskKind={primaryTask?.kind ?? null}
      expandedPresentationTarget={expandedPresentationTarget}
      isContextMenuOpen={isContextMenuOpen}
      interactionBusy={isProcessing || Boolean(primaryTask) || totalTaskCount > 0 || isQueuePopoverOpen}
      onCloseContextMenu={closeContextMenuWindow}
      onOutputFolderShortcut={handleOutputFolderShortcut}
      onContextMenu={handleContextMenu}
      onDrop={handleDrop}
      onPaste={handleSurfacePaste}
      onPanelHoveredChange={setIsPanelHovered}
    >
        <MainWindowQueuePopover
          ref={queueBadgeButtonRef}
          visible={showVideoTaskBadge || isQueuePopoverOpen}
          showBadge={showVideoTaskBadge}
          isOpen={isQueuePopoverOpen}
          onToggleOpen={() => setIsQueuePopoverOpen((current) => !current)}
          totalTaskCount={totalTaskCount}
          downloadQueueTasks={downloadQueueTasks}
          totalDownloadTaskCount={totalDownloadTaskCount}
          downloadState={downloadState}
          transcodeQueueTasks={transcodeQueueTasks}
          totalTranscodeTaskCount={totalTranscodeTaskCount}
          pendingTranscodeActionTraceIds={pendingTranscodeActionTraceIds}
          isAdvancedQualitySelectionPopover={isAdvancedQualitySelectionPopover}
          advancedQualitySelectionTask={advancedQualitySelectionTask}
          mainWindowFullContentVisible={mainWindowFullContentVisible}
          getAdvancedQualityTaskTitle={getAdvancedQualityTaskTitle}
          renderAdvancedQualityOptionButton={renderAdvancedQualityOptionButton}
          onCancelDownload={(traceId) => {
            void cancelVideoTask(traceId);
          }}
          onCancelTranscode={(traceId) => {
            void cancelTranscodeTask(traceId);
          }}
          onRetryTranscode={(traceId) => {
            void retryTranscodeTask(traceId);
          }}
          onRemoveTranscode={(traceId) => {
            void removeTranscodeTask(traceId);
          }}
        />


        <AnimatePresence>
          {shouldRenderMiniControls ? (
            <motion.div
              key="mini-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={miniControlsPresenceTransition}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              {/* Close button - top right circle */}
              <NeonIconButton
                onClick={async () => {
                  await closeContextMenuWindow().catch(() => undefined);
                  try {
                    await desktopCurrentWindow.hide();
                  } catch (err) {
                    console.error("Failed to hide main window:", err);
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                tone="danger"
                size={18}
                radius={999}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  pointerEvents: "auto",
                }}
                title={t("app.actions.hideWindow")}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "currentColor",
                    display: "block",
                    pointerEvents: "none",
                  }}
                />
              </NeonIconButton>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <MainWindowCenterOverlay
          centerOverlayVisual={centerOverlayVisual}
          primaryTask={primaryTask}
          primaryTaskStatusText={primaryTaskStatusText}
          primaryTaskSummaryText={primaryTaskSummaryText}
          onCopyDiagnostic={handleCopyErrorDiagnostic}
          showPrimaryCancel={
            Boolean(
              centerOverlayVisual.kind === "task-progress"
              && primaryTask !== null,
            )
          }
          isPrimaryCancelPending={isPrimaryTaskActionPending}
          primaryTaskTraceId={primaryTask?.task.traceId ?? null}
          onCancelPrimaryTask={(traceId) => {
            if (primaryTask?.kind === "download") {
              void cancelVideoTask(traceId);
            } else {
              void cancelTranscodeTask(traceId);
            }
          }}
        />

        <MainWindowRuntimeIndicator
          visible={shouldShowRuntimeIndicator}
          showSuccess={showRuntimeSuccessIndicator}
          isHovered={isRuntimeIndicatorHovered}
          onHoverChange={setIsRuntimeIndicatorHovered}
          headline={runtimeIndicatorHeadline}
          statusText={runtimeIndicatorStatusText}
          footerText={runtimeIndicatorFooterText}
          title={runtimeIndicatorTitle}
          progressPercent={runtimeIndicatorProgressPercent}
          isIndeterminate={runtimeIndicatorIsIndeterminate}
          shouldRenderRing={runtimeIndicatorShouldRenderRing}
          requiresManualAction={runtimeGateRequiresManualAction}
          reducedMotion={Boolean(shouldReduceMotion)}
          isRetryInFlight={isRuntimeRetryInFlight}
          isRetryFeedbackVisible={isRuntimeRetryFeedbackVisible}
          onRecheck={() => {
            void handleRuntimeDependencyRecheck();
          }}
        />


        <AnimatePresence>
          {shouldRenderMiniControls ? (
            <motion.div
              key="mini-controls-footer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={miniControlsPresenceTransition}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              {/* App update indicator */}
              {shouldShowAppUpdateIndicator && appUpdateInfo ? (
                <button
                  onClick={() => {
                    void handleAppUpdateInstall();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={appUpdatePhase === "downloading" || appUpdatePhase === "installing"}
                  style={{
                    position: "absolute",
                    bottom: 8,
                    right: 28,
                    width: 16,
                    height: 16,
                    border: "none",
                    borderRadius: 4,
                    backgroundColor: "transparent",
                    cursor: appUpdatePhase === "downloading" || appUpdatePhase === "installing" ? "wait" : "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "auto",
                  }}
                  title={appUpdateIndicatorTitle}
                >
                  {appUpdatePhase === "downloading" || appUpdatePhase === "installing" ? (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        border: `1.5px solid ${colors.accentBorder}`,
                        borderTopColor: colors.accentSolid,
                        display: "block",
                        animation: "spin 0.75s linear infinite",
                        transformOrigin: "50% 50%",
                        boxShadow: `0 0 4px ${colors.accentGlow}`,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: appUpdatePhase === "error" ? colors.warningSolid : colors.dangerSolid,
                        display: "block",
                        boxShadow: appUpdatePhase === "error"
                          ? `0 0 6px ${colors.warningGlow}`
                          : `0 0 6px ${colors.dangerGlow}`,
                      }}
                    />
                  )}
                </button>
              ) : null}

              {/* Rename counter reset button - bottom left solid rectangle */}
              {renameMediaOnDownload ? (
                <NeonIconButton
                  onClick={handleResetRenameCounter}
                  onMouseDown={(e) => e.stopPropagation()}
                  size={16}
                  style={{
                    position: "absolute",
                    bottom: 8,
                    left: 8,
                    pointerEvents: "auto",
                  }}
                  title={t("app.actions.resetRenameCounter")}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
                    <rect
                      x="1"
                      y="1"
                      width="8"
                      height="8"
                      fill={isResetCounterActive ? colors.accentSolid : "currentColor"}
                      stroke="none"
                      rx="1"
                      style={{ transition: `fill 0.18s ${COMPACT_EASE}` }}
                    />
                  </svg>
                </NeonIconButton>
              ) : null}

              {/* Settings button - bottom right rectangle */}
              <NeonIconButton
                onClick={() => { void openSettings(); }}
                onMouseDown={(e) => e.stopPropagation()}
                size={16}
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  pointerEvents: "auto",
                }}
                title={t("app.actions.settings")}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
                  <rect
                    x="1"
                    y="1"
                    width="8"
                    height="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    rx="1"
                    style={{ transition: `stroke 0.18s ${COMPACT_EASE}` }}
                  />
                </svg>
              </NeonIconButton>
            </motion.div>
          ) : null}
        </AnimatePresence>
    </MainWindowPresentationSurface>
  );
}

export default App;
