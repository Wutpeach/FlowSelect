import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Check } from "lucide-react";

type DropPayload = {
  paths: string[];
  position: { x: number; y: number };
};

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputPath, setOutputPath] = useState("");
  const [isPanelHovered, setIsPanelHovered] = useState(false);

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
        const config = { outputPath };
        await invoke("save_config", { json: JSON.stringify(config) });
        console.log("Saved config:", config);
      } catch (err) {
        console.error("Failed to save config:", err);
      }
    };
    saveConfig();
  }, [outputPath]);

  useEffect(() => {
    // Tauri v2: drag-enter
    const unlistenEnter = listen("tauri://drag-enter", (event) => {
      console.log("Event triggered: drag-enter", event.payload);
      setIsHovering(true);
    });

    // Tauri v2: drag-leave
    const unlistenLeave = listen("tauri://drag-leave", (event) => {
      console.log("Event triggered: drag-leave", event.payload);
      setIsHovering(false);
    });

    // Tauri v2: drag-drop
    const unlistenDrop = listen<DropPayload>("tauri://drag-drop", async (event) => {
      console.log("Event triggered: drag-drop", event.payload);
      const paths = event.payload.paths;
      console.log("Dropped files:", paths);

      setIsHovering(false);
      setIsProcessing(true);

      try {
        await invoke("process_files", { 
          paths, 
          targetDir: outputPath || null 
        });
      } catch (err) {
        console.error("Failed to process files:", err);
      }

      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
    });

    return () => {
      unlistenEnter.then((fn) => fn());
      unlistenLeave.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
    };
  }, [outputPath]);

  // Handle paste event - check for image URL first, then clipboard files
  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();

    // 1. Check if clipboard text is an image URL
    const text = e.clipboardData.getData("text/plain");
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

    // Debug logging
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
            const file = e.dataTransfer.files[0];
            try {
              const arrayBuffer = await file.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
              );
              const mimeType = file.type || "image/jpeg";
              const dataUrl = `data:${mimeType};base64,${base64}`;
              const saveResult = await invoke<string>("save_data_url", {
                dataUrl,
                targetDir: outputPath || null,
              });
              console.log("Save from dataTransfer.files result:", saveResult);
            } catch (fileErr) {
              console.error("Failed to read from dataTransfer.files:", fileErr);
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
      }

      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // If URL not recognized but files exist, try reading from dataTransfer.files
    if (e.dataTransfer.files.length > 0) {
      console.log("URL not recognized, trying dataTransfer.files...");
      setIsProcessing(true);
      const file = e.dataTransfer.files[0];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const mimeType = file.type || "image/gif";
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const saveResult = await invoke<string>("save_data_url", {
          dataUrl,
          targetDir: outputPath || null,
        });
        console.log("Save from dataTransfer.files result:", saveResult);
      } catch (fileErr) {
        console.error("Failed to read from dataTransfer.files:", fileErr);
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
      animate={{ scale: isProcessing ? 0.95 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`
        w-[200px] h-[200px] rounded-2xl overflow-hidden relative
        flex flex-col justify-center items-center gap-2
        transition-colors duration-300 outline-none
        ${isHovering
          ? "bg-[#404040] border-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
          : "bg-[#2a2a2a] border border-[#3a3a3a]"
        }
      `}
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
        {isProcessing ? (
          <motion.div
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [1, 1.2, 1], opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Check size={48} className="text-green-400" strokeWidth={3} />
          </motion.div>
        ) : (
          <motion.div
            key="layers"
            animate={{ scale: isHovering ? 1.15 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Layers
              size={48}
              className={`transition-colors duration-200 ${
                isHovering ? "text-blue-400" : "text-[#606060]"
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提示文字 */}
      <p
        className={`text-xs transition-colors duration-200 ${
          isHovering ? "text-blue-400" : "text-[#505050]"
        }`}
      >
        {isHovering ? "Release to drop" : "Drop files here"}
      </p>

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

    </motion.div>
  );
}

export default App;
