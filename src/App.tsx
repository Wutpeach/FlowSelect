import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Settings, Check } from "lucide-react";

type DropPayload = { paths: string[] };

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Tauri 文件拖放事件监听（获取系统路径）
  useEffect(() => {
    const unlisten = listen<DropPayload>("tauri://file-drop", (event) => {
      const paths = event.payload.paths;
      console.log("Tauri file-drop:", paths);

      setIsProcessing(true);
      setIsHovering(false);

      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // HTML5 拖拽事件处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(false);

    // HTML5 方式获取文件（备用）
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      console.log("HTML5 drop:", files.map((f) => f.name));
    }
  };

  return (
    <div
      data-tauri-drag-region
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
      {/* Settings 按钮 - 固定右上角 */}
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
            animate={{
              scale: isHovering ? 1.15 : 1,
            }}
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
