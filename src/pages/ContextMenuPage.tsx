import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { getShadowBackdropStyle, getWindowShellStyle } from "../components/ui/shared-styles";
import {
  desktopCommands,
  desktopCurrentWindow,
  desktopEvents,
} from "../desktop/runtime";

function ContextMenuPage() {
  const { t } = useTranslation("desktop");
  const { theme, colors } = useTheme();
  const [hoveredItem, setHoveredItem] = useState<"open" | "set" | null>(null);
  const dismissArmedRef = useRef(false);

  const requestClose = useCallback(async () => {
    dismissArmedRef.current = false;
    await desktopEvents.emit("context-menu-closed", undefined).catch(() => undefined);
    await desktopCurrentWindow.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    const currentWindow = desktopCurrentWindow;
    let isMounted = true;
    let unlistenFocus: (() => void) | null = null;
    let unlistenBlur: (() => void) | null = null;
    const armDismissTimer = window.setTimeout(() => {
      dismissArmedRef.current = true;
    }, 150);

    const shouldIgnoreDismiss = () => !dismissArmedRef.current;

    currentWindow
      .onFocusChanged(({ payload: focused }) => {
        if (focused || shouldIgnoreDismiss()) {
          return;
        }
        void requestClose();
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
      .onBlur(() => {
        if (shouldIgnoreDismiss()) {
          return;
        }
        void requestClose();
      })
      .then((fn) => {
        if (isMounted) {
          unlistenBlur = fn;
        } else {
          fn();
        }
      })
      .catch((err) => {
        console.error("Failed to listen for context menu blur event:", err);
      });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void requestClose();
      }
    };

    const handleWindowBlur = () => {
      if (shouldIgnoreDismiss()) {
        return;
      }
      void requestClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      isMounted = false;
      dismissArmedRef.current = false;
      clearTimeout(armDismissTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
      if (unlistenFocus) {
        unlistenFocus();
      }
      if (unlistenBlur) {
        unlistenBlur();
      }
    };
  }, [requestClose]);

  const openOutputFolder = async () => {
    try {
      await desktopCommands.invoke<void>("begin_open_output_folder_from_context_menu");
    } catch (err) {
      console.error("Failed to open output folder:", err);
      await requestClose();
    }
  };

  const selectOutputFolder = async () => {
    try {
      await desktopCommands.invoke<void>("begin_pick_output_folder_from_context_menu");
    } catch (err) {
      console.error("Failed to set output folder:", err);
      await requestClose();
    }
  };

  const panelStyle: CSSProperties = getWindowShellStyle(colors, theme, {
    radius: 8,
    borderColor: colors.fieldBorder,
    clip: false,
    includeLightBottomInset: true,
  });

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
    background: hoveredItem === item ? colors.fieldHoverBg : "transparent",
    border: "none",
    borderRadius: 0,
    cursor: "pointer",
    transition: "background-color 0.15s, color 0.15s",
    userSelect: "none",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  return (
    <motion.div
      onContextMenu={(event) => event.preventDefault()}
      initial={false}
      style={{
        width: "100%",
        height: "100%",
        padding: 4,
        boxSizing: "border-box",
        background: "transparent",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          ...getShadowBackdropStyle(colors, {
            radius: 8,
            boxShadow: colors.panelShadowCompact,
            inset: 4,
          }),
        }}
      />
      <motion.div
        initial={{ scale: 0.965, y: -2 }}
        animate={{ scale: 1, y: 0 }}
        transition={{
          duration: 0.16,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          ...panelStyle,
          position: "relative",
          zIndex: 1,
          transformOrigin: "top left",
        }}
      >
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
          {t("contextMenu.openFolder")}
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
          {t("contextMenu.setOutputFolder")}
        </button>
      </motion.div>
    </motion.div>
  );
}

export default ContextMenuPage;
