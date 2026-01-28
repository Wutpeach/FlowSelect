import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Settings, Check } from "lucide-react";

type DropPayload = {
  paths: string[];
  position: { x: number; y: number };
};

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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
        onClick={openSettings}
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

    </motion.div>
  );
}

export default App;
