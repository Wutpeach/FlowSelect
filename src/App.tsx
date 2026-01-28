import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Settings, Check } from "lucide-react";

type DropPayload = { paths: string[] };

function App() {
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unlisten = listen<DropPayload>("tauri://file-drop", (event) => {
      const paths = event.payload.paths;
      console.log("Received files:", paths);

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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsHovering(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      data-tauri-drag-region
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      className={`
        w-screen h-screen rounded-2xl overflow-hidden
        flex items-center justify-center relative
        transition-all duration-300
        ${isHovering
          ? "bg-[#3a3a3a] border-2 border-[#6a6aff]"
          : "bg-[#2a2a2a] border border-[#3a3a3a]"
        }
      `}
    >
      {/* Settings 按钮 */}
      <button
        className="absolute top-3 right-3 p-2 text-[#606060] hover:text-[#a0a0a0] transition-colors"
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
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <Check size={48} className="text-[#4ade80]" strokeWidth={3} />
          </motion.div>
        ) : (
          <motion.div
            key="layers"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <Layers
              size={48}
              className={`transition-colors duration-300 ${
                isHovering ? "text-[#8a8aff]" : "text-[#606060]"
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提示文字 */}
      <motion.p
        className="absolute bottom-6 text-xs text-[#505050]"
        animate={{ opacity: isHovering ? 1 : 0.5 }}
      >
        {isHovering ? "Release to drop" : "Drop files here"}
      </motion.p>
    </div>
  );
}

export default App;
