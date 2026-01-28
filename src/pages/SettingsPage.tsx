import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, FolderOpen, Keyboard } from "lucide-react";

function SettingsPage() {
  const [outputPath, setOutputPath] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState("");

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr);
        if (config.outputPath) {
          setOutputPath(config.outputPath);
        }
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };

    const loadAutostart = async () => {
      try {
        const enabled = await invoke<boolean>("get_autostart");
        setAutostart(enabled);
      } catch (err) {
        console.error("Failed to get autostart status:", err);
      }
    };

    loadConfig();
    loadAutostart();

    const loadShortcut = async () => {
      try {
        const current = await invoke<string>("get_current_shortcut");
        setShortcut(current);
      } catch (err) {
        console.error("Failed to load shortcut:", err);
      }
    };
    loadShortcut();
  }, []);

  // Keyboard event listener for shortcut recording
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");

      const key = e.key.toUpperCase();
      if (!["CONTROL", "ALT", "SHIFT", "META"].includes(key)) {
        parts.push(key === " " ? "Space" : key);
      }

      if (parts.length > 0) {
        setRecordedKeys(parts.join("+"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording]);

  const startRecording = () => {
    setRecordedKeys("");
    setIsRecording(true);
  };

  const cancelRecording = () => {
    setIsRecording(false);
    setRecordedKeys("");
  };

  const confirmShortcut = async () => {
    if (!recordedKeys) return;
    try {
      await invoke("register_shortcut", { shortcut: recordedKeys });
      setShortcut(recordedKeys);
      setIsRecording(false);
      setRecordedKeys("");
    } catch (err) {
      console.error("Failed to register shortcut:", err);
    }
  };

  // Save config when outputPath changes
  useEffect(() => {
    if (!outputPath) return;

    const saveConfig = async () => {
      try {
        const config = { outputPath };
        await invoke("save_config", { json: JSON.stringify(config) });
      } catch (err) {
        console.error("Failed to save config:", err);
      }
    };
    saveConfig();
  }, [outputPath]);

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

  const toggleAutostart = async () => {
    try {
      const newValue = !autostart;
      await invoke("set_autostart", { enabled: newValue });
      setAutostart(newValue);
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
    }
  };

  const truncatePath = (path: string, maxLen = 25) => {
    if (path.length <= maxLen) return path;
    return "..." + path.slice(-maxLen);
  };

  const closeWindow = () => {
    getCurrentWindow().close();
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] rounded-2xl overflow-hidden flex flex-col">
      {/* Draggable Header */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-3 border-b border-[#333]"
      >
        <h2 className="text-sm font-medium text-[#e0e0e0]">Settings</h2>
        <button
          onClick={closeWindow}
          className="p-1 text-[#606060] hover:text-[#a0a0a0] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Output Path */}
        <div>
          <label className="text-xs text-[#808080] mb-2 block">
            Output Path
          </label>
          <button
            onClick={selectOutputPath}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#2a2a2a] rounded-lg
                     text-left text-xs text-[#a0a0a0] hover:bg-[#333] transition-colors"
          >
            <FolderOpen size={14} className="text-[#606060] flex-shrink-0" />
            <span className="truncate">
              {outputPath ? truncatePath(outputPath) : "Select folder..."}
            </span>
          </button>
        </div>

        {/* Launch at startup */}
        <div>
          <label className="text-xs text-[#808080] mb-2 block">
            Launch at startup
          </label>
          <button
            onClick={toggleAutostart}
            className={`
              w-12 h-6 rounded-full transition-colors relative
              ${autostart ? "bg-blue-500" : "bg-[#3a3a3a]"}
            `}
          >
            <span
              className={`
                absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                ${autostart ? "left-7" : "left-1"}
              `}
            />
          </button>
        </div>

        {/* Shortcut */}
        <div>
          <label className="text-xs text-[#808080] mb-2 block">
            Global Shortcut
          </label>
          {isRecording ? (
            <div className="space-y-2">
              <div
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#2a2a2a] rounded-lg
                         text-xs text-[#e0e0e0] border border-blue-500"
              >
                <Keyboard size={14} className="text-blue-500 flex-shrink-0" />
                <span>{recordedKeys || "Press keys..."}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={confirmShortcut}
                  disabled={!recordedKeys}
                  className="flex-1 px-3 py-1.5 bg-blue-500 rounded text-xs text-white
                           hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  onClick={cancelRecording}
                  className="flex-1 px-3 py-1.5 bg-[#3a3a3a] rounded text-xs text-[#a0a0a0]
                           hover:bg-[#444] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startRecording}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#2a2a2a] rounded-lg
                       text-left text-xs text-[#a0a0a0] hover:bg-[#333] transition-colors"
            >
              <Keyboard size={14} className="text-[#606060] flex-shrink-0" />
              <span>{shortcut || "Click to set..."}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 text-center border-t border-[#333]">
        <span className="text-[10px] text-[#505050]">v0.1.0</span>
      </div>
    </div>
  );
}

export default SettingsPage;
