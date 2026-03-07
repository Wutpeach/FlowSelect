import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { desktopDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "framer-motion";
import { useTheme } from "../contexts/ThemeContext";

type AppConfig = {
  outputPath?: string;
};

async function resolveOutputFolderPath(): Promise<string> {
  const configStr = await invoke<string>("get_config");
  const config = JSON.parse(configStr) as AppConfig;
  if (config.outputPath && config.outputPath.trim().length > 0) {
    return config.outputPath;
  }

  const desktop = await desktopDir();
  return join(desktop, "FlowSelect_Received");
}

function ContextMenuPage() {
  const { theme, colors } = useTheme();
  const [hoveredItem, setHoveredItem] = useState<"open" | "set" | null>(null);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let isMounted = true;
    let unlistenFocus: (() => void) | null = null;
    let unlistenTauriBlur: (() => void) | null = null;

    currentWindow
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          void currentWindow.close();
        }
      })
      .then((fn) => {
        if (isMounted) {
          unlistenFocus = fn;
        } else {
          fn();
        }
      })
      .catch((err) => {
        console.error("Failed to listen for context menu focus changes:", err);
      });

    currentWindow
      .listen("tauri://blur", () => {
        void currentWindow.close();
      })
      .then((fn) => {
        if (isMounted) {
          unlistenTauriBlur = fn;
        } else {
          fn();
        }
      })
      .catch((err) => {
        console.error("Failed to listen for context menu blur event:", err);
      });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void currentWindow.close();
      }
    };

    const handleWindowBlur = () => {
      void currentWindow.close();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      isMounted = false;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
      if (unlistenFocus) {
        unlistenFocus();
      }
      if (unlistenTauriBlur) {
        unlistenTauriBlur();
      }
    };
  }, []);

  const openOutputFolder = async () => {
    const currentWindow = getCurrentWindow();
    try {
      const path = await resolveOutputFolderPath();
      await invoke<void>("open_folder", { path });
    } catch (err) {
      console.error("Failed to open output folder:", err);
    } finally {
      await currentWindow.close().catch(() => undefined);
    }
  };

  const selectOutputFolder = async () => {
    const currentWindow = getCurrentWindow();
    try {
      await emit("request-output-path-picker");
    } catch (err) {
      console.error("Failed to set output folder:", err);
    } finally {
      await currentWindow.close().catch(() => undefined);
    }
  };

  const panelStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.borderStart}`,
    borderRadius: 8,
    boxShadow:
      theme === "black"
        ? "0 2px 8px rgba(0,0,0,0.24)"
        : `0 4px 12px ${colors.shadowSpread}`,
    overflow: "hidden",
  };

  const getMenuButtonStyle = (item: "open" | "set"): CSSProperties => ({
    width: "100%",
    flex: 1,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    boxSizing: "border-box",
    textAlign: "left",
    fontSize: 13,
    color: colors.textPrimary,
    background: hoveredItem === item ? colors.bgPrimary : "transparent",
    border: "none",
    borderRadius: 0,
    cursor: "pointer",
    transition: "background-color 0.15s",
    userSelect: "none",
  });

  return (
    <motion.div
      onContextMenu={(event) => event.preventDefault()}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      style={{
        width: "100%",
        height: "100%",
        padding: 0,
        background: "transparent",
      }}
    >
      <div style={panelStyle}>
        <button
          onClick={openOutputFolder}
          style={getMenuButtonStyle("open")}
          onMouseEnter={() => {
            setHoveredItem("open");
          }}
          onMouseLeave={() => {
            setHoveredItem(null);
          }}
        >
          Open Folder
        </button>
        <div
          style={{
            height: 1,
            background: colors.borderStart,
            opacity: 0.9,
          }}
        />
        <button
          onClick={selectOutputFolder}
          style={getMenuButtonStyle("set")}
          onMouseEnter={() => {
            setHoveredItem("set");
          }}
          onMouseLeave={() => {
            setHoveredItem(null);
          }}
        >
          Set Output Folder
        </button>
      </div>
    </motion.div>
  );
}

export default ContextMenuPage;
