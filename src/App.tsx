import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
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

const resolveRenameMediaEnabled = (config: Record<string, unknown>): boolean => {
  if (typeof config.renameMediaOnDownload === "boolean") {
    return config.renameMediaOnDownload;
  }
  if (typeof config.videoKeepOriginalName === "boolean") {
    return !config.videoKeepOriginalName;
  }
  return false;
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
  const [outputPath, setOutputPath] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [isPanelHovered, setIsPanelHovered] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    speed: string;
    eta: string;
  } | null>(null);
  const [ytdlpUpdate, setYtdlpUpdate] = useState<{
    current: string;
    latest: string;
    updateAvailable: boolean;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(true);
  const [windowResized, setWindowResized] = useState(false);
  const [showEdgeGlow, setShowEdgeGlow] = useState(true);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const idleTimerRef = useRef<number | null>(null);
  const contextMenuMonitorRef = useRef<number | null>(null);
  const contextMenuMonitorBusyRef = useRef(false);
  const contextMenuMonitorMissesRef = useRef(0);
  const isDraggingRef = useRef(false);
  const downloadCancelledRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanelHoveredRef = useRef(false);

  // Window size constants
  const FULL_SIZE = 200;
  const ICON_SIZE = 80;
  const EDGE_GLOW_TRIGGER_DISTANCE = 112;
  const EDGE_GLOW_RADIUS = 222;
  const EDGE_GLOW_BORDER_WIDTH = 1.75;
  const EDGE_GLOW_FALLOFF_EXPONENT = 0.72;
  const CONTEXT_MENU_WIDTH = 148;
  const CONTEXT_MENU_HEIGHT = 46;
  const CONTEXT_MENU_MARGIN = 8;

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

  const getMacEdgeGlowOpacity = () => {
    const distanceToEdge = Math.min(
      mousePos.x,
      mousePos.y,
      FULL_SIZE - mousePos.x,
      FULL_SIZE - mousePos.y,
    );
    const normalized = Math.max(0, 1 - distanceToEdge / EDGE_GLOW_TRIGGER_DISTANCE);
    return Math.pow(normalized, EDGE_GLOW_FALLOFF_EXPONENT);
  };

  const macEdgeGlowOpacity = getMacEdgeGlowOpacity();

  const getMacEdgeGlowStyle = (): CSSProperties => {
    return {
      position: 'absolute',
      inset: 0,
      borderRadius: 16,
      pointerEvents: 'none',
      padding: EDGE_GLOW_BORDER_WIDTH,
      background: `radial-gradient(
        ${EDGE_GLOW_RADIUS}px circle at ${mousePos.x}px ${mousePos.y}px,
        rgba(59,130,246,1) 0%,
        rgba(96,165,250,0.9) 24%,
        rgba(147,197,253,0.42) 50%,
        rgba(191,219,254,0.18) 66%,
        transparent 84%
      )`,
      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      maskComposite: 'exclude',
      WebkitMaskComposite: 'xor',
      filter: 'drop-shadow(0 0 2.6px rgba(59,130,246,0.78))',
    };
  };

  const applyRuntimeConfig = useCallback((config: Record<string, unknown>) => {
    if (typeof config.outputPath === "string") {
      setOutputPath(config.outputPath);
    }
    setRenameMediaOnDownload(resolveRenameMediaEnabled(config));
  }, []);

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
    const unlistenProgress = listen<{ percent: number; speed: string; eta: string }>(
      "video-download-progress",
      async (event) => {
        // 清除已有的 idle timer，防止下载中被最小化
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        // Set progress immediately (sync) before async operations
        setIsMinimized(false);
        setDownloadProgress(event.payload);
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

        const payload = event.payload;
        const cancelled = downloadCancelledRef.current || isCancelledDownloadError(payload?.error);
        const success = Boolean(payload?.success) && !cancelled;

        downloadCancelledRef.current = false;
        setDownloadCancelled(!success);
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

  // Listen for settings window close to reload config
  useEffect(() => {
    const unlisten = listen("tauri://close-requested", async (event: any) => {
      if (event.windowLabel === "settings") {
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr) as Record<string, unknown>;
        applyRuntimeConfig(config);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [applyRuntimeConfig]);

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
    const unlisten = listen("shortcut-show", async () => {
      // 如果窗口处于图标模式（已缩小），需要先恢复窗口大小
      if (windowResized && !isMacOS) {
        try {
          const win = getCurrentWindow();
          const pos = await win.outerPosition();
          await Promise.all([
            invoke('set_window_size', { width: FULL_SIZE, height: FULL_SIZE }),
            invoke('set_window_position', { x: pos.x, y: pos.y }),
          ]);
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
    console.log(">>> Checking yt-dlp version...");
    invoke<{ current: string; latest: string; updateAvailable: boolean }>("check_ytdlp_version")
      .then((result) => {
        console.log(">>> yt-dlp version check result:", result);
        if (result.updateAvailable) {
          setYtdlpUpdate(result);
        }
      })
      .catch((err) => {
        console.error(">>> yt-dlp version check failed:", err);
      });
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
    if (downloadProgress || isDraggingRef.current || isPanelHoveredRef.current) return;

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
      downloadCancelledRef.current = false; setDownloadCancelled(false);
      setIsProcessing(true);
      try {
        const result = await invoke<{ success: boolean; file_path?: string; error?: string }>(
          "download_video",
          { url: text }
        );
        console.log("Video download result:", result);
        if (!result.success) {
          console.error("Video download failed:", result.error);
          checkSequenceOverflow(result.error);
        }
      } catch (err) {
        console.error("Failed to download video:", err);
        checkSequenceOverflow(err);
      }
      setTimeout(() => setIsProcessing(false), 1000);
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
      downloadCancelledRef.current = false; setDownloadCancelled(false);
      setIsProcessing(true);
      try {
        const result = await invoke<{ success: boolean; file_path?: string; error?: string }>(
          "download_video",
          { url }
        );
        console.log("Video download result:", result);
        if (!result.success) {
          console.error("Video download failed:", result.error);
          checkSequenceOverflow(result.error);
        }
      } catch (err) {
        console.error("Failed to download video:", err);
        checkSequenceOverflow(err);
      }
      setTimeout(() => setIsProcessing(false), 1000);
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

    new WebviewWindow("settings", {
      url: "/settings",
      title: "Settings",
      width: 320,
      height: 400,
      center: true,
      decorations: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      shadow: false,
    });
  };

  const resetRenameCounter = async () => {
    try {
      await invoke<boolean>("reset_rename_counter");
    } catch (err) {
      console.error("Failed to reset rename counter:", err);
    }
  };

  // Handle yt-dlp update
  const handleYtdlpUpdate = async () => {
    setIsUpdating(true);
    try {
      await invoke("update_ytdlp");
      setYtdlpUpdate(null);
    } catch (err) {
      console.error("Failed to update yt-dlp:", err);
    }
    setIsUpdating(false);
  };

  // 右键菜单
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetIdleTimer();

    try {
      await closeContextMenuWindow();

      const currentWindow = getCurrentWindow();
      const [outerPosition, scaleFactor] = await Promise.all([
        currentWindow.outerPosition(),
        currentWindow.scaleFactor(),
      ]);

      const logicalWindowPosition = new PhysicalPosition(outerPosition).toLogical(scaleFactor);
      let x = logicalWindowPosition.x + e.clientX;
      let y = logicalWindowPosition.y + e.clientY;

      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;

      if (x + CONTEXT_MENU_WIDTH > screenWidth) {
        x = screenWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN;
      }
      if (y + CONTEXT_MENU_HEIGHT > screenHeight) {
        y = screenHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_MARGIN;
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
          isMacOS ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: macEdgeGlowOpacity }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.045, ease: 'linear' }}
              style={getMacEdgeGlowStyle()}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: -5,
                borderRadius: 22,
                pointerEvents: 'none',
                background: `conic-gradient(
                  from ${Math.atan2(mousePos.y - 100, mousePos.x - 100) * 180 / Math.PI}deg at ${mousePos.x}px ${mousePos.y}px,
                  transparent 0deg,
                  rgba(59,130,246,1) 22deg,
                  rgba(96,165,250,1) 52deg,
                  rgba(147,197,253,1) 88deg,
                  rgba(147,197,253,0.95) 122deg,
                  rgba(96,165,250,1) 154deg,
                  rgba(59,130,246,1) 186deg,
                  transparent 230deg
                )`,
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
                WebkitMaskComposite: 'xor',
                padding: 5,
                filter: 'blur(2.8px) drop-shadow(0 0 7px rgba(59,130,246,0.5))',
              }}
            />
          )
        )}
      </AnimatePresence>

      {/* Close button - top right circle */}
      <button
        onClick={() => {
          setIsMinimized(true);
          setShowEdgeGlow(false);
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
        title="Minimize to icon"
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
            <span style={{ fontSize: 10, color: colors.progressSpeedText, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>{downloadProgress.speed}</span>
            {/* Cancel download button */}
            <button
              onClick={async () => {
                try {
                  await invoke("cancel_download");
                  setDownloadProgress(null);
                  downloadCancelledRef.current = true;
                  setDownloadCancelled(true);
                  setIsProcessing(true);
                  setTimeout(() => {
                    setIsProcessing(false);
                  }, 1500);
                } catch (err) {
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
          >
            {downloadCancelled ? (
              <X size={48} style={{ color: colors.errorIcon }} strokeWidth={3} />
            ) : (
              <Check size={48} style={{ color: colors.successIcon }} strokeWidth={3} />
            )}
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
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              style={{ width: 10, height: 10 }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <circle cx="5" cy="5" r="4" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="12" strokeDashoffset="4" />
              </svg>
            </motion.div>
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
          onClick={resetRenameCounter}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.querySelector('rect');
            if (rect) rect.style.fill = '#808080';
          }}
          onMouseLeave={(e) => {
            const rect = e.currentTarget.querySelector('rect');
            if (rect) rect.style.fill = '#444444';
          }}
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
              fill="#444444"
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
