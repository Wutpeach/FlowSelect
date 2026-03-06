import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X } from "lucide-react";
import { isVideoUrl } from "./utils/videoUrl";
import { useTheme } from "./contexts/ThemeContext";

// Helper function to check and show sequence overflow error
const checkSequenceOverflow = (error: unknown): boolean => {
  const errorStr = String(error);
  if (errorStr.includes("序号已用完")) {
    alert("序号已用完，请整理文件夹后重试");
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

type YtdlpVersionInfo = {
  current: string;
  latest: string;
  updateAvailable: boolean;
};

type DownloadStage = "preparing" | "downloading" | "merging" | "post_processing";

type DownloadProgressPayload = {
  percent: number;
  stage: DownloadStage;
  speed: string;
  eta: string;
};

type DownloadResult = {
  success: boolean;
  file_path?: string;
  error?: string;
};

type VideoQueueItem = {
  id: number;
  url: string;
};

const DOWNLOAD_STAGE_LABEL: Record<DownloadStage, string> = {
  preparing: "Preparing...",
  downloading: "Downloading...",
  merging: "Merging...",
  post_processing: "Post-processing...",
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
  const stageLabel = DOWNLOAD_STAGE_LABEL[effectiveStage];
  const speedText = progress.speed.trim();
  const etaText = progress.eta.trim();
  const hasEta = etaText.length > 0 && etaText !== "N/A";

  if (effectiveStage !== "downloading") {
    if (speedText && speedText !== stageLabel) {
      return speedText;
    }
    return stageLabel;
  }

  if (!speedText || speedText === stageLabel) {
    if (hasEta) {
      return `${stageLabel} ETA ${etaText}`;
    }
    return stageLabel;
  }

  if (hasEta) {
    return `${stageLabel} ${speedText} · ETA ${etaText}`;
  }
  return `${stageLabel} ${speedText}`;
};

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
  const { colors } = useTheme();
  const isMacOS = navigator.userAgent.toLowerCase().includes("mac");
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadCancelled, setDownloadCancelled] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [isPanelHovered, setIsPanelHovered] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressPayload | null>(null);
  const [downloadStage, setDownloadStage] = useState<DownloadStage | null>(null);
  const [, setPendingVideoTasks] = useState<VideoQueueItem[]>([]);
  const [, setActiveVideoTask] = useState<VideoQueueItem | null>(null);
  const [videoTaskCount, setVideoTaskCount] = useState(0);
  const [queuedVideoTaskCount, setQueuedVideoTaskCount] = useState(0);
  const [backendVideoTaskCount, setBackendVideoTaskCount] = useState(0);
  const [isCancellingDownload, setIsCancellingDownload] = useState(false);
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
  const idleTimerRef = useRef<number | null>(null);
  const resetCounterFeedbackTimerRef = useRef<number | null>(null);
  const contextMenuMonitorRef = useRef<number | null>(null);
  const contextMenuMonitorBusyRef = useRef(false);
  const contextMenuMonitorMissesRef = useRef(0);
  const isDraggingRef = useRef(false);
  const downloadCancelledRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanelHoveredRef = useRef(false);
  const pendingVideoTasksRef = useRef<VideoQueueItem[]>([]);
  const activeVideoTaskRef = useRef<VideoQueueItem | null>(null);
  const videoQueueRunnerRef = useRef(false);
  const videoQueueSeqRef = useRef(1);

  // Window size constants
  const FULL_SIZE = 200;
  const ICON_SIZE = 80;
  const EDGE_GLOW_TRIGGER_DISTANCE = 112;
  const EDGE_GLOW_RADIUS = 222;
  const EDGE_GLOW_BORDER_WIDTH = 1.75;
  const EDGE_GLOW_FALLOFF_EXPONENT = 0.72;
  const WINDOW_EDGE_PADDING = 8;
  const CONTEXT_MENU_WIDTH = 148;
  const CONTEXT_MENU_HEIGHT = 46;
  const SETTINGS_WINDOW_WIDTH = 320;
  const SETTINGS_WINDOW_HEIGHT = 400;
  const SETTINGS_WINDOW_GAP = 16;

  const clearContextMenuMonitor = useCallback(() => {
    if (contextMenuMonitorRef.current !== null) {
      clearInterval(contextMenuMonitorRef.current);
      contextMenuMonitorRef.current = null;
    }
    contextMenuMonitorBusyRef.current = false;
    contextMenuMonitorMissesRef.current = 0;
  }, []);

  const closeContextMenuWindow = useCallback(async () => {
    const existing = await WebviewWindow.getByLabel("context-menu");
    if (existing) {
      await existing.close().catch(() => undefined);
    }
    clearContextMenuMonitor();
  }, [clearContextMenuMonitor]);

  const startContextMenuMonitor = useCallback(() => {
    clearContextMenuMonitor();
    contextMenuMonitorRef.current = window.setInterval(async () => {
      if (contextMenuMonitorBusyRef.current) {
        return;
      }
      contextMenuMonitorBusyRef.current = true;
      try {
        const contextMenu = await WebviewWindow.getByLabel("context-menu");
        if (!contextMenu) {
          contextMenuMonitorMissesRef.current += 1;
          if (contextMenuMonitorMissesRef.current >= 8) {
            clearContextMenuMonitor();
          }
          return;
        }
        contextMenuMonitorMissesRef.current = 0;

        const [mainFocused, menuFocused] = await Promise.all([
          getCurrentWindow().isFocused().catch(() => false),
          contextMenu.isFocused().catch(() => false),
        ]);

        if (!mainFocused && !menuFocused) {
          await closeContextMenuWindow().catch(() => undefined);
        }
      } finally {
        contextMenuMonitorBusyRef.current = false;
      }
    }, 200);
  }, [clearContextMenuMonitor, closeContextMenuWindow]);

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

  const getEdgeGlowOpacity = () => {
    const distanceToEdge = Math.min(
      mousePos.x,
      mousePos.y,
      FULL_SIZE - mousePos.x,
      FULL_SIZE - mousePos.y,
    );
    const normalized = Math.max(0, 1 - distanceToEdge / EDGE_GLOW_TRIGGER_DISTANCE);
    return Math.pow(normalized, EDGE_GLOW_FALLOFF_EXPONENT);
  };

  const edgeGlowOpacity = getEdgeGlowOpacity();

  const getEdgeGlowStyle = (): CSSProperties => {
    return {
      position: 'absolute',
      inset: 0,
      borderRadius: 16,
      pointerEvents: 'none',
      border: `${EDGE_GLOW_BORDER_WIDTH}px solid transparent`,
      background: `
        linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%) padding-box,
        radial-gradient(
          ${EDGE_GLOW_RADIUS}px circle at ${mousePos.x}px ${mousePos.y}px,
          rgba(59,130,246,1) 0%,
          rgba(96,165,250,0.9) 24%,
          rgba(147,197,253,0.42) 50%,
          rgba(191,219,254,0.18) 66%,
          transparent 84%
        ) border-box
      `,
      filter: 'drop-shadow(0 0 2.6px rgba(59,130,246,0.78))',
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
      setYtdlpUpdate(result.updateAvailable ? result : null);
    } catch (err) {
      console.error(">>> yt-dlp version check failed:", err);
    }
  }, []);

  const syncVideoQueueCounts = useCallback((
    activeTask: VideoQueueItem | null = activeVideoTaskRef.current,
    pendingTasks: VideoQueueItem[] = pendingVideoTasksRef.current,
  ) => {
    setQueuedVideoTaskCount(pendingTasks.length);
    setVideoTaskCount(pendingTasks.length + (activeTask ? 1 : 0));
  }, []);

  const updatePendingVideoTasks = useCallback((tasks: VideoQueueItem[]) => {
    pendingVideoTasksRef.current = tasks;
    setPendingVideoTasks(tasks);
    syncVideoQueueCounts(activeVideoTaskRef.current, tasks);
  }, [syncVideoQueueCounts]);

  const processVideoQueue = useCallback(async () => {
    if (videoQueueRunnerRef.current) {
      return;
    }

    videoQueueRunnerRef.current = true;
    try {
      while (pendingVideoTasksRef.current.length > 0) {
        const [task, ...restTasks] = pendingVideoTasksRef.current;
        updatePendingVideoTasks(restTasks);

        activeVideoTaskRef.current = task;
        setActiveVideoTask(task);
        syncVideoQueueCounts(task, restTasks);

        downloadCancelledRef.current = false;
        setDownloadCancelled(false);
        setIsCancellingDownload(false);

        try {
          const result = await invoke<DownloadResult>("download_video", { url: task.url });
          if (!result.success) {
            console.error("Video download failed:", result.error);
            checkSequenceOverflow(result.error);
          }
        } catch (err) {
          console.error("Failed to download video:", err);
          checkSequenceOverflow(err);
        } finally {
          activeVideoTaskRef.current = null;
          setActiveVideoTask(null);
          syncVideoQueueCounts(null, pendingVideoTasksRef.current);
        }
      }
    } finally {
      videoQueueRunnerRef.current = false;
    }
  }, [syncVideoQueueCounts, updatePendingVideoTasks]);

  const enqueueVideoDownload = useCallback((url: string) => {
    const task: VideoQueueItem = {
      id: videoQueueSeqRef.current++,
      url,
    };
    const nextTasks = [...pendingVideoTasksRef.current, task];
    updatePendingVideoTasks(nextTasks);
    void processVideoQueue();
  }, [processVideoQueue, updatePendingVideoTasks]);

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
      clearContextMenuMonitor();
    };
  }, [clearContextMenuMonitor]);

  useEffect(() => {
    return () => {
      if (resetCounterFeedbackTimerRef.current !== null) {
        clearTimeout(resetCounterFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mainWindow = getCurrentWindow();
    let isMounted = true;
    let unlistenFocus: (() => void) | null = null;

    mainWindow
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          return;
        }
        void closeContextMenuWindow()
          .catch((err) => {
            console.error("Failed to close context menu on main focus:", err);
          });
      })
      .then((fn) => {
        if (isMounted) {
          unlistenFocus = fn;
        } else {
          fn();
        }
      })
      .catch((err) => {
        console.error("Failed to listen for main focus changes:", err);
      });

    return () => {
      isMounted = false;
      if (unlistenFocus) {
        unlistenFocus();
      }
    };
  }, [closeContextMenuWindow]);

  // Save config when outputPath changes
  useEffect(() => {
    if (!outputPath) return;

    const saveConfig = async () => {
      try {
        // Read existing config first, then merge update
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr);
        config.outputPath = outputPath;
        await invoke("save_config", { json: JSON.stringify(config) });
        console.log("Saved config:", config);
      } catch (err) {
        console.error("Failed to save config:", err);
      }
    };
    saveConfig();
  }, [outputPath]);

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
        setDownloadProgress(payload);
        setDownloadStage((currentStage) =>
          advanceDownloadStage(currentStage, payload.stage, payload.percent)
        );
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
    const unlistenComplete = listen<{ success: boolean; file_path?: string | null; error?: string | null }>(
      "video-download-complete",
      (event) => {
        console.log(">>> [Frontend] video-download-complete received:", event);
        setDownloadProgress(null);
        setDownloadStage(null);
        setIsCancellingDownload(false);

        const payload = event.payload;
        const cancelled = downloadCancelledRef.current || isCancelledDownloadError(payload?.error);
        const success = Boolean(payload?.success) && !cancelled;
        const errorSummary = summarizeDownloadError(payload?.error);

        downloadCancelledRef.current = false;
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
          if (!isDraggingRef.current && !isPanelHoveredRef.current) {
            idleTimerRef.current = window.setTimeout(() => {
              if (isDraggingRef.current || isPanelHoveredRef.current) return;
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
  }, [isMacOS]);

  // Listen for output path changes from settings window
  useEffect(() => {
    const unlisten = listen<{ path: string }>("output-path-changed", (event) => {
      setOutputPath(event.payload.path);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

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
      if (!downloadProgress && !isDraggingRef.current && !isPanelHoveredRef.current) {
        idleTimerRef.current = window.setTimeout(() => {
          if (isDraggingRef.current || isPanelHoveredRef.current) return;
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
  }, [windowResized, downloadProgress, isMacOS]);

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
    const unlisten = listen<{ count: number }>("video-queue-count", (event) => {
      const nextCount = Number.isFinite(event.payload.count) ? Math.max(0, Math.floor(event.payload.count)) : 0;
      setBackendVideoTaskCount(nextCount);
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
    if (downloadProgress || activeVideoTaskRef.current || isDraggingRef.current || isPanelHoveredRef.current) return;

    idleTimerRef.current = window.setTimeout(() => {
      if (isDraggingRef.current || isPanelHoveredRef.current) return;
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

  // Handle window drag start - prevents minimize during drag
  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只响应左键

    const existingContextMenu = await WebviewWindow.getByLabel("context-menu");
    if (existingContextMenu) {
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
      downloadCancelledRef.current = false;
      setDownloadCancelled(false);
      setDownloadErrorMessage(null);
      enqueueVideoDownload(text);
      return;
    }

    // 2. Check if clipboard text is an image URL
    if (text && isImageUrl(text)) {
      console.log("Pasted image URL:", text);
      downloadCancelledRef.current = false; setDownloadCancelled(false);
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
        downloadCancelledRef.current = false; setDownloadCancelled(false);
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
            title: "确认素材导出路径",
          });

          if (selected && typeof selected === "string") {
            console.log("用户选择的路径:", selected);
            setOutputPath(selected);
            downloadCancelledRef.current = false; setDownloadCancelled(false);
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

    // Check for URL in dataTransfer
    // Note: text/uri-list may return "about:blank#blocked" due to security policy
    let url = e.dataTransfer.getData("text/uri-list");
    if (!url || url === "about:blank#blocked" || url.startsWith("about:")) {
      url = e.dataTransfer.getData("text/plain");
    }

    // === 优先处理本地文件 file:// URL ===
    if (url && url.startsWith("file://")) {
      const localPath = decodeURIComponent(url.replace("file:///", ""));
      console.log("Detected local file URL:", localPath);
      downloadCancelledRef.current = false; setDownloadCancelled(false);
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
    if (url && url.includes('pinterest.com/pin/')) {
      console.log("Detected Pinterest pin URL, extracting image from HTML");
      const html = e.dataTransfer.getData("text/html");

      // Extract highest resolution image from srcset
      // Priority: originals > 736x > 474x > 236x
      const srcsetMatch = html.match(/srcset="([^"]+)"/);
      if (srcsetMatch) {
        const srcset = srcsetMatch[1];
        // Find originals URL or highest resolution
        const originalsMatch = srcset.match(/(https:\/\/i\.pinimg\.com\/originals\/[^\s,]+)/);
        const fallbackMatch = srcset.match(/(https:\/\/i\.pinimg\.com\/736x\/[^\s,]+)/);

        const imageUrl = originalsMatch?.[1] || fallbackMatch?.[1];

        if (imageUrl) {
          console.log("Extracted Pinterest image URL:", imageUrl);
          downloadCancelledRef.current = false; setDownloadCancelled(false);
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
      console.log("Could not extract image URL from Pinterest");
      return;
    }

    // Check if it's a video URL (highest priority)
    if (url && isVideoUrl(url)) {
      console.log("Detected video URL:", url);
      downloadCancelledRef.current = false;
      setDownloadCancelled(false);
      setDownloadErrorMessage(null);
      enqueueVideoDownload(url);
      return;
    }

    // Check if it's an image URL
    if (url && isImageUrl(url)) {
      console.log("Detected image URL:", url);
      downloadCancelledRef.current = false; setDownloadCancelled(false);
      setIsProcessing(true);

      try {
        // Distinguish between Data URL, file:// URL, and HTTP URL
        if (url.startsWith("data:image/")) {
          const result = await invoke<string>("save_data_url", {
            dataUrl: url,
            targetDir: outputPath || null,
          });
          console.log("Save data URL result:", result);
        } else if (url.startsWith("file://")) {
          // Convert file:// URL to local path
          const localPath = decodeURIComponent(url.replace("file:///", ""));
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
            url,
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
      downloadCancelledRef.current = false; setDownloadCancelled(false);
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
    const existingContextMenu = await WebviewWindow.getByLabel("context-menu");
    if (existingContextMenu) {
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
      title: "Settings",
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
        title: "Context Menu",
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
        focus: false,
        parent: "main",
      });
      startContextMenuMonitor();
    } catch (err) {
      console.error("Failed to open context menu window:", err);
    }
  };

  const containerBoxShadow = downloadProgress
    ? `inset 0 0 0 1px ${colors.borderStart}, inset 0 0 12px rgba(59,130,246,0.35), 0 2px 4px rgba(0,0,0,0.1)`
    : isHovering
      ? `inset 0 0 0 1px ${colors.borderStart}, 0 2px 4px rgba(0,0,0,0.1), 0 0 12px rgba(59,130,246,0.4)`
      : `inset 0 0 0 1px ${colors.borderStart}, 0 2px 4px rgba(0,0,0,0.1)`;
  const downloadStatusText = downloadProgress
    ? getDownloadStatusText(downloadProgress, downloadStage)
    : "";
  const combinedVideoTaskCount = videoTaskCount + backendVideoTaskCount;
  const combinedQueuedVideoTaskCount =
    queuedVideoTaskCount + Math.max(backendVideoTaskCount - 1, 0);
  const queueStatusText = isCancellingDownload
    ? "Cancelling current task..."
    : combinedQueuedVideoTaskCount > 0
      ? `${combinedQueuedVideoTaskCount} queued`
      : "";
  const showVideoTaskBadge = combinedVideoTaskCount > 1;

  return (
    <motion.div
      ref={containerRef}
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        console.log("DragOver types:", e.dataTransfer.types);
        resetIdleTimer();
        // Show hover state for URL drops too
        const hasUrl = e.dataTransfer.types.includes("text/uri-list")
                    || e.dataTransfer.types.includes("text/plain");
        if (hasUrl && !isHovering) {
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

      {showVideoTaskBadge ? (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            minWidth: 28,
            height: 28,
            borderRadius: 14,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.queueBadgeBg,
            color: colors.queueBadgeText,
            border: `1px solid ${colors.queueBadgeBorder}`,
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1,
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 30,
            boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
          }}
          aria-label={`Video tasks: ${combinedVideoTaskCount}`}
        >
          {combinedVideoTaskCount}
        </div>
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
        onMouseEnter={(e) => {
          const span = e.currentTarget.querySelector('span');
          if (span) span.style.backgroundColor = '#ef4444';
        }}
        onMouseLeave={(e) => {
          const span = e.currentTarget.querySelector('span');
          if (span) span.style.backgroundColor = '#444444';
        }}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 16,
          height: 16,
          border: 'none',
          borderRadius: 4,
          backgroundColor: 'transparent',
          cursor: 'pointer',
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
        title="Hide window"
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: '#444444',
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
                {downloadProgress.percent < 0 ? '...' : `${Math.round(downloadProgress.percent)}%`}
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
                if (isCancellingDownload) {
                  return;
                }
                try {
                  downloadCancelledRef.current = true;
                  setDownloadCancelled(true);
                  setDownloadErrorMessage("Cancelling download...");
                  setIsCancellingDownload(true);
                  await invoke<boolean>("cancel_download");
                } catch (err) {
                  setIsCancellingDownload(false);
                  console.error("Failed to cancel download:", err);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.progressCancelHoverBg;
                const svg = e.currentTarget.querySelector('svg');
                if (svg) svg.style.color = colors.progressCancelHoverIcon;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                const svg = e.currentTarget.querySelector('svg');
                if (svg) svg.style.color = colors.progressCancelIcon;
              }}
              style={{
                margin: 0,
                marginTop: 4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                opacity: isCancellingDownload ? 0.6 : 1,
              }}
              title="Cancel download"
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
          title={isUpdating ? "Updating..." : `Update yt-dlp: ${ytdlpUpdate.current} → ${ytdlpUpdate.latest}`}
        >
          {isUpdating ? (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '1.5px solid rgba(59, 130, 246, 0.22)',
                borderTopColor: '#3b82f6',
                display: 'block',
                animation: 'spin 0.75s linear infinite',
                transformOrigin: '50% 50%',
                boxShadow: '0 0 4px rgba(59, 130, 246, 0.35)',
              }}
            />
          ) : (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                display: 'block',
                boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)',
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
            position: 'absolute',
            bottom: 8,
            left: 8,
            width: 16,
            height: 16,
            border: 'none',
            borderRadius: 4,
            backgroundColor: 'transparent',
            cursor: 'pointer',
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
          title="Reset rename counter"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
            <rect
              x="1"
              y="1"
              width="8"
              height="8"
              fill={isResetCounterActive ? '#3b82f6' : (isResetCounterHovered ? '#808080' : '#444444')}
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
        onMouseEnter={(e) => {
          const rect = e.currentTarget.querySelector('rect');
          if (rect) rect.style.stroke = '#808080';
        }}
        onMouseLeave={(e) => {
          const rect = e.currentTarget.querySelector('rect');
          if (rect) rect.style.stroke = '#444444';
        }}
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          width: 16,
          height: 16,
          border: 'none',
          borderRadius: 4,
          backgroundColor: 'transparent',
          cursor: 'pointer',
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
        title="Settings"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
          <rect
            x="1"
            y="1"
            width="8"
            height="8"
            fill="none"
            stroke="#444444"
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
