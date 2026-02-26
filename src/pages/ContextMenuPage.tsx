import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktopDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  const { colors } = useTheme();

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let isMounted = true;
    let unlistenFocus: (() => void) | null = null;

    currentWindow.onFocusChanged(({ payload: focused }) => {
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void currentWindow.close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      isMounted = false;
      window.removeEventListener("keydown", handleKeyDown);
      if (unlistenFocus) {
        unlistenFocus();
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
      await currentWindow.close();
    }
  };

  return (
    <div
      onContextMenu={(event) => event.preventDefault()}
      style={{
        width: "100%",
        height: "100%",
        padding: 4,
        borderRadius: 8,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <button
        onClick={openOutputFolder}
        style={{
          width: "100%",
          height: "100%",
          padding: "8px 12px",
          textAlign: "left",
          fontSize: 13,
          color: colors.textPrimary,
          background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
          border: `1px solid ${colors.borderStart}`,
          borderRadius: 8,
          cursor: "pointer",
          boxShadow: `0 4px 12px ${colors.shadowSpread}`,
          transition: "background-color 0.15s",
          userSelect: "none",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = colors.bgPrimary;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`;
        }}
      >
        Open Folder
      </button>
    </div>
  );
}

export default ContextMenuPage;
