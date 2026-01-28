import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Settings, Check, X, FolderOpen } from "lucide-react";

type DropPayload = {
  paths: string[];
  position: { x: number; y: number };
};

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [outputPath, setOutputPath] = useState("");

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

  // Handle paste event - ask backend for clipboard files
  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();

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

  // Handle output path selection
  const selectOutputPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Output Folder",
      });
      if (selected) {
        setOutputPath(selected as string);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  };

  // Truncate path for display
  const truncatePath = (path: string, maxLen = 20) => {
    if (path.length <= maxLen) return path;
    return "..." + path.slice(-maxLen);
  };

  return (
    <motion.div
      data-tauri-drag-region
      tabIndex={0}
      onDragOver={(e) => e.preventDefault()}
      onPaste={handlePaste}
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
      {/* Settings 按钮 */}
      <button
        className="absolute top-2 right-2 p-2 text-[#606060] hover:text-[#a0a0a0] transition-colors z-10"
        onClick={() => setIsSettingsOpen(true)}
      >
        <Settings size={16} />
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

      {/* Settings Overlay */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-0 bg-[#1e1e1e] z-20 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#333]">
              <h2 className="text-sm font-medium text-[#e0e0e0]">Settings</h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 text-[#606060] hover:text-[#a0a0a0] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 py-3">
              <div className="mb-2">
                <label className="text-xs text-[#808080] mb-1 block">Output Path</label>
                <button
                  onClick={selectOutputPath}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] rounded-lg
                           text-left text-xs text-[#a0a0a0] hover:bg-[#333] transition-colors"
                >
                  <FolderOpen size={14} className="text-[#606060] flex-shrink-0" />
                  <span className="truncate">{truncatePath(outputPath)}</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 text-center">
              <span className="text-[10px] text-[#505050]">v0.1.0</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;
