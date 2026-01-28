import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Settings, Check } from "lucide-react";

type DropPayload = {
  paths: string[];
  position: { x: number; y: number };
};

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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
        await invoke("process_files", { paths });
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
  }, []);

  // Handle paste event
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const items = e.clipboardData?.items;

    if (items) {
      const fileItems: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log("Paste item:", {
          kind: item.kind,
          type: item.type,
        });

        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            fileItems.push(file.name);
            console.log("Pasted file:", file.name, file.type, file.size);
          }
        }
      }

      if (fileItems.length > 0) {
        console.log("Pasted files:", fileItems);
        setIsProcessing(true);

        invoke("process_files", { paths: fileItems }).catch((err) => {
          console.error("Failed to process pasted files:", err);
        });

        setTimeout(() => setIsProcessing(false), 1000);
      } else {
        console.log("No files in clipboard");
      }
    }
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
        onClick={() => console.log("Settings clicked")}
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
