import { useState, useEffect } from "react";
import { createPortal } from 'react-dom';
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Check } from "lucide-react";
import { isVideoUrl } from "./utils/videoUrl";

type DropPayload = {
  paths: string[];
  position: { x: number; y: number };
};

// Helper function to check and show sequence overflow error
const checkSequenceOverflow = (error: unknown): boolean => {
  const errorStr = String(error);
  if (errorStr.includes("序号已用完")) {
    alert("序号已用完，请整理文件夹后重试");
    return true;
  }
  return false;
};

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputPath, setOutputPath] = useState("");
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        console.log("Loaded config:", configStr);
        const config = JSON.parse(configStr);
        if (config.outputPath) {
          setOutputPath(config.outputPath);
        }
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };
    loadConfig();
  }, []);

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
      (event) => setDownloadProgress(event.payload)
    );
    const unlistenComplete = listen("video-download-complete", () => {
      setDownloadProgress(null);
    });
    return () => {
      unlistenProgress.then(fn => fn());
      unlistenComplete.then(fn => fn());
    };
  }, []);

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


  // Handle paste event - check for video URL first, then image URL, then clipboard files
  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();

    const text = e.clipboardData.getData("text/plain");

    // 1. Check if clipboard text is a video URL (highest priority)
    if (text && isVideoUrl(text)) {
      console.log("Pasted video URL:", text);
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

    // Check if it's a video URL (highest priority)
    if (url && isVideoUrl(url)) {
      console.log("Detected video URL:", url);
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
    });
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
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();

    // 菜单尺寸估算
    const menuWidth = 140;
    const menuHeight = 40;

    // 窗口尺寸
    const windowWidth = 200;
    const windowHeight = 200;

    // 计算位置，确保菜单不超出窗口
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth - 8;
    }
    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight - 8;
    }

    setContextMenu({ x, y });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const openOutputFolder = async () => {
    closeContextMenu();
    const path = outputPath || `${await import('@tauri-apps/api/path').then(p => p.desktopDir())}\\FlowSelect_Received`;
    await invoke("open_folder", { path });
  };

  return (
    <motion.div
      data-tauri-drag-region
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        console.log("DragOver types:", e.dataTransfer.types);
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
      onMouseEnter={() => setIsPanelHovered(true)}
      onMouseLeave={() => setIsPanelHovered(false)}
      onContextMenu={handleContextMenu}
      animate={{ scale: isProcessing ? 0.95 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{
        width: 200,
        height: 200,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.3s',
        outline: 'none',
        backgroundColor: (isHovering || downloadProgress) ? '#404040' : '#2a2a2a',
        border: (isHovering || downloadProgress) ? '2px solid #3b82f6' : '1px solid #3a3a3a',
        boxShadow: (isHovering || downloadProgress) ? '0 0 20px rgba(59,130,246,0.5)' : '0 0 0 1px #2a2a2a',
      }}
    >
      {/* Close button - top right circle */}
      <button
        onClick={() => getCurrentWindow().hide()}
        onMouseEnter={(e) => {
          const span = e.currentTarget.querySelector('span');
          if (span) span.style.backgroundColor = '#808080';
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
          opacity: isPanelHovered ? 1 : 0,
          transition: 'opacity 0.2s ease',
          pointerEvents: isPanelHovered ? 'auto' : 'none',
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
                  stroke="#3a3a3a"
                  strokeWidth="4"
                />
                <circle
                  cx="24" cy="24" r="20"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 20}
                  strokeDashoffset={2 * Math.PI * 20 * (1 - downloadProgress.percent / 100)}
                  style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                />
              </svg>
              <span style={{
                position: 'absolute',
                fontSize: 11,
                fontWeight: 500,
                color: '#60a5fa',
                textAlign: 'center',
              }}>
                {Math.round(downloadProgress.percent)}%
              </span>
            </div>
            <span style={{ fontSize: 10, color: '#808080', lineHeight: 1 }}>{downloadProgress.speed}</span>
            {/* Cancel download button */}
            <button
              onClick={async () => {
                try {
                  await invoke("cancel_download");
                  setDownloadProgress(null);
                } catch (err) {
                  console.error("Failed to cancel download:", err);
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)';
                const svg = e.currentTarget.querySelector('svg');
                if (svg) svg.style.color = '#f87171';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                const svg = e.currentTarget.querySelector('svg');
                if (svg) svg.style.color = '#606060';
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
                style={{ color: '#606060', transition: 'color 0.2s' }}
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
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [1, 1.2, 1], opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Check size={48} className="text-green-400" strokeWidth={3} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* yt-dlp update indicator */}
      {ytdlpUpdate && (
        <button
          onClick={handleYtdlpUpdate}
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
            opacity: isPanelHovered ? 1 : 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: isPanelHovered ? 'auto' : 'none',
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

      {/* Settings button - bottom right rectangle */}
      <button
        onClick={openSettings}
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
          opacity: isPanelHovered ? 1 : 0,
          transition: 'opacity 0.2s ease',
          pointerEvents: isPanelHovered ? 'auto' : 'none',
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

      {/* 自定义右键菜单 */}
      {contextMenu && createPortal(
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
            }}
            onClick={closeContextMenu}
          />
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: '#2a2a2a',
              border: '1px solid #3a3a3a',
              borderRadius: 8,
              padding: '4px 0',
              minWidth: 140,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 9999,
            }}
          >
            <button
              onClick={openOutputFolder}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: 13,
                color: '#e0e0e0',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#404040'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Open Folder
            </button>
          </div>
        </>,
        document.body
      )}

    </motion.div>
  );
}

export default App;
