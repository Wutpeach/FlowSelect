import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Settings, Check } from "lucide-react";

type DropPayload = { paths: string[] };

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // 文件悬停在窗口上
    const unlistenHover = listen("tauri://file-drop-hover", () => {
      setIsHovering(true);
    });

    // 文件拖出窗口（取消）
    const unlistenCancelled = listen("tauri://file-drop-cancelled", () => {
      setIsHovering(false);
    });

    // 文件放下
    const unlistenDrop = listen<DropPayload>("tauri://file-drop", (event) => {
      const paths = event.payload.paths;
      console.log("Dropped files:", paths);

      setIsHovering(false);
      setIsProcessing(true);

      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
    });

    return () => {
      unlistenHover.then((fn) => fn());
      unlistenCancelled.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className={`
        w-screen h-screen rounded-2xl overflow-hidden relative
        flex flex-col justify-center items-center gap-2
        transition-all duration-300
        ${isHovering
          ? "bg-[#353535] border-2 border-blue-500"
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
    </div>
  );
}

export default App;
