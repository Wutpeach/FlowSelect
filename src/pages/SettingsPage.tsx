import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, FolderOpen, Keyboard } from "lucide-react";
import { NeonToggle } from "../components/ui/neon-toggle";
import { NeonButton } from "../components/ui/neon-button";
import { NeonCard, NeonFieldButton, NeonHint, NeonSection } from "../components/ui";
import { useTheme } from "../contexts/ThemeContext";
import { saveOutputPath } from "../utils/outputPath";
import { APP_VERSION } from "../constants/appVersion";
import type { YtdlpVersionInfo } from "../types/ytdlp";

type RenameRulePreset = "desc_number" | "asc_number" | "prefix_number";
type ClipDownloadMode = "fast" | "precise";

const DEFAULT_RENAME_RULE_PRESET: RenameRulePreset = "desc_number";
const RENAME_RULE_PRESET_OPTIONS: Array<{ value: RenameRulePreset; label: string }> = [
  { value: "desc_number", label: "Descending" },
  { value: "asc_number", label: "Ascending" },
  { value: "prefix_number", label: "Prefix + Sequence" },
];
const CLIP_DOWNLOAD_MODE_OPTIONS: Array<{
  value: ClipDownloadMode;
  label: string;
  description: string;
}> = [
  { value: "fast", label: "Fast", description: "Keyframe-aligned slicing (recommended)." },
  { value: "precise", label: "Precise", description: "Accurate cut points, usually slower." },
];
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;
const VERSION_TAP_THRESHOLD = 5;
const VERSION_TAP_RESET_MS = 1500;
const VERSION_TAP_HINT_DURATION_MS = 2200;
const SHORTCUT_KEY_ALIASES: Record<string, string> = {
  CONTROL: "Ctrl",
  CTRL: "Ctrl",
  ALT: "Alt",
  OPTION: "Alt",
  SHIFT: "Shift",
  META: "Meta",
  COMMAND: "Meta",
  CMD: "Meta",
  COMMANDORCONTROL: "CommandOrControl",
  CMDORCTRL: "CommandOrControl",
  ESCAPE: "Esc",
  " ": "Space",
};

const normalizeShortcutToken = (token: string): string => {
  const normalized = token.trim();
  if (!normalized) return "";
  const alias = SHORTCUT_KEY_ALIASES[normalized.toUpperCase()];
  if (alias) return alias;
  return normalized.length === 1 ? normalized.toUpperCase() : normalized;
};

const formatShortcutForDisplay = (shortcut: string, isMacOS: boolean): string => {
  if (!shortcut) return "";
  const tokens = shortcut
    .split("+")
    .map((token) => normalizeShortcutToken(token))
    .filter(Boolean);

  if (isMacOS) {
    const macSymbols: Record<string, string> = {
      CommandOrControl: "⌘",
      Meta: "⌘",
      Shift: "⇧",
      Alt: "⌥",
      Ctrl: "⌃",
    };
    return tokens.map((token) => macSymbols[token] ?? token.toUpperCase()).join("+");
  }

  const windowsLabels: Record<string, string> = {
    CommandOrControl: "Ctrl",
    Meta: "Win",
  };
  return tokens.map((token) => windowsLabels[token] ?? token).join("+");
};

const isModifierKey = (key: string): boolean => {
  const normalized = normalizeShortcutToken(key);
  return ["Ctrl", "Alt", "Shift", "Meta", "CommandOrControl"].includes(normalized);
};

const sanitizeRenameAffix = (raw: string): string => {
  const cleaned = raw
    .trim()
    .replace(ILLEGAL_FILENAME_CHARS, "_")
    .replace(/[\n\r\t]/g, " ");
  return cleaned
    .slice(0, 100)
    .replace(/^[.\s]+|[.\s]+$/g, "");
};

const getParentDirectory = (filePath: string): string => {
  const normalized = filePath.trim().replace(/[\\/]+$/, "");
  if (!normalized) return "";

  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex <= 0) return "";

  // Preserve Windows drive roots like `C:\`.
  if (/^[A-Za-z]:$/.test(normalized.slice(0, separatorIndex))) {
    return `${normalized.slice(0, separatorIndex)}\\`;
  }

  return normalized.slice(0, separatorIndex);
};

const resolveClipDownloadMode = (config: Record<string, unknown>): ClipDownloadMode => {
  return config.clipDownloadMode === "precise" ? "precise" : "fast";
};

const buildRenamePreview = (
  preset: RenameRulePreset,
  prefixRaw: string,
  suffixRaw: string,
): string => {
  const number = preset === "asc_number" ? "1" : "99";
  const parts: string[] = [];
  if (preset === "prefix_number") {
    const safePrefix = sanitizeRenameAffix(prefixRaw);
    if (safePrefix) {
      parts.push(safePrefix);
    }
  }
  parts.push(number);
  const safeSuffix = sanitizeRenameAffix(suffixRaw);
  if (safeSuffix) {
    parts.push(safeSuffix);
  }
  return `${parts.join("_")}.mp4`;
};

function SettingsPage() {
  const { theme, colors, setTheme } = useTheme();
  const isMacOS = navigator.userAgent.toLowerCase().includes("mac");
  const [outputPath, setOutputPath] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [clipDownloadMode, setClipDownloadMode] = useState<ClipDownloadMode>("fast");
  const [renameRulePreset, setRenameRulePreset] = useState<RenameRulePreset>(DEFAULT_RENAME_RULE_PRESET);
  const [renamePrefix, setRenamePrefix] = useState("");
  const [renameSuffix, setRenameSuffix] = useState("");
  const [aePortalEnabled, setAePortalEnabled] = useState(false);
  const [aeExePath, setAeExePath] = useState("");
  const [versionTapHint, setVersionTapHint] = useState("");
  const [ytdlpInfo, setYtdlpInfo] = useState<YtdlpVersionInfo | null>(null);
  const [isUpdatingYtdlp, setIsUpdatingYtdlp] = useState(false);
  const [ytdlpHint, setYtdlpHint] = useState("");
  const [renamePresetMenuOpen, setRenamePresetMenuOpen] = useState(false);
  const [hoveredRenamePreset, setHoveredRenamePreset] = useState<RenameRulePreset | null>(null);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const versionTapCountRef = useRef(0);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTapHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytdlpHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportLogExportInFlightRef = useRef(false);
  const renamePresetMenuRef = useRef<HTMLDivElement | null>(null);

  const showYtdlpHint = useCallback((message: string) => {
    setYtdlpHint(message);
    if (ytdlpHintTimerRef.current) {
      clearTimeout(ytdlpHintTimerRef.current);
    }
    ytdlpHintTimerRef.current = setTimeout(() => {
      setYtdlpHint("");
      ytdlpHintTimerRef.current = null;
    }, 2000);
  }, []);

  const refreshYtdlpVersion = useCallback(async () => {
    try {
      const versionInfo = await invoke<YtdlpVersionInfo>("check_ytdlp_version");
      setYtdlpInfo(versionInfo);
    } catch (err) {
      console.error("Failed to check yt-dlp version:", err);
      setYtdlpInfo(null);
    }
  }, []);

  const ytdlpCurrentVersion = ytdlpInfo?.current ?? "Unknown";
  const ytdlpStatus = (() => {
    if (!ytdlpInfo) {
      return {
        color: colors.textSecondary,
        message: "Version check unavailable.",
      };
    }

    if (ytdlpInfo.updateAvailable === true && ytdlpInfo.latest) {
      return {
        color: colors.dangerText,
        message: `Update available: ${ytdlpInfo.latest}`,
      };
    }

    if (ytdlpInfo.latest) {
      return {
        color: colors.textSecondary,
        message: "Already up to date.",
      };
    }

    return {
      color: colors.textSecondary,
      message: "Latest version check unavailable. Showing local version only.",
    };
  })();

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr) as Record<string, unknown>;
        if (typeof config.outputPath === "string") {
          setOutputPath(config.outputPath);
        }
        setClipDownloadMode(resolveClipDownloadMode(config));
        if (typeof config.renameMediaOnDownload === "boolean") {
          setRenameMediaOnDownload(config.renameMediaOnDownload);
        } else if (typeof config.videoKeepOriginalName === "boolean") {
          setRenameMediaOnDownload(!config.videoKeepOriginalName);
        }
        const rawPreset = config.renameRulePreset;
        if (rawPreset === "desc_number" || rawPreset === "asc_number" || rawPreset === "prefix_number") {
          setRenameRulePreset(rawPreset);
        } else {
          setRenameRulePreset(DEFAULT_RENAME_RULE_PRESET);
        }
        if (typeof config.renamePrefix === "string") {
          setRenamePrefix(config.renamePrefix);
        }
        if (typeof config.renameSuffix === "string") {
          setRenameSuffix(config.renameSuffix);
        }
        if (typeof config.aePortalEnabled === "boolean") {
          setAePortalEnabled(config.aePortalEnabled);
        }
        if (typeof config.aeExePath === "string") {
          setAeExePath(config.aeExePath);
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
    void refreshYtdlpVersion();

    const loadShortcut = async () => {
      try {
        const current = await invoke<string>("get_current_shortcut");
        setShortcut(current);
      } catch (err) {
        console.error("Failed to load shortcut:", err);
      }
    };
    loadShortcut();
  }, [refreshYtdlpVersion]);

  useEffect(() => {
    const unlisten = listen<{ path: string }>("output-path-changed", (event) => {
      setOutputPath(event.payload.path);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Keyboard event listener for shortcut recording
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (isMacOS) {
        if (e.metaKey) parts.push("CommandOrControl");
        if (e.ctrlKey) parts.push("Ctrl");
      } else {
        if (e.ctrlKey) parts.push("CommandOrControl");
        if (e.metaKey) parts.push("Meta");
      }
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");

      const key = normalizeShortcutToken(e.key);
      if (key && !isModifierKey(key)) {
        parts.push(key);
      }

      if (parts.length > 0) {
        setRecordedKeys(parts.join("+"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, isMacOS]);

  useEffect(() => {
    return () => {
      if (versionTapTimerRef.current) {
        clearTimeout(versionTapTimerRef.current);
        versionTapTimerRef.current = null;
      }
      if (versionTapHintTimerRef.current) {
        clearTimeout(versionTapHintTimerRef.current);
        versionTapHintTimerRef.current = null;
      }
      if (ytdlpHintTimerRef.current) {
        clearTimeout(ytdlpHintTimerRef.current);
        ytdlpHintTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!renamePresetMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const menuEl = renamePresetMenuRef.current;
      if (!menuEl) return;
      if (menuEl.contains(event.target as Node)) return;
      setRenamePresetMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRenamePresetMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [renamePresetMenuOpen]);

  useEffect(() => {
    if (!renamePresetMenuOpen) {
      setHoveredRenamePreset(null);
    }
  }, [renamePresetMenuOpen]);

  useEffect(() => {
    const unlisten = listen<{ source: "main" | "settings" }>("ytdlp-version-refresh", (event) => {
      if (event.payload.source === "settings") {
        return;
      }
      void refreshYtdlpVersion();
      if (event.payload.source === "main") {
        showYtdlpHint("yt-dlp updated from main window");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshYtdlpVersion, showYtdlpHint]);

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
      // 保存到配置
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr);
      config.shortcut = recordedKeys;
      await invoke("save_config", { json: JSON.stringify(config) });

      setShortcut(recordedKeys);
      setIsRecording(false);
      setRecordedKeys("");
    } catch (err) {
      console.error("Failed to register shortcut:", err);
    }
  };

  const selectOutputPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Output Folder",
      });
      if (typeof selected === "string") {
        await saveOutputPath(selected);
        setOutputPath(selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  };

  const handleYtdlpUpdate = async () => {
    setIsUpdatingYtdlp(true);
    try {
      const latestVersion = await invoke<string>("update_ytdlp");
      await emit("ytdlp-version-refresh", { source: "settings" });
      await refreshYtdlpVersion();
      showYtdlpHint(`yt-dlp updated to ${latestVersion}`);
    } catch (err) {
      console.error("Failed to update yt-dlp:", err);
      showYtdlpHint("Failed to update yt-dlp");
    } finally {
      setIsUpdatingYtdlp(false);
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

  const toggleRenameMediaOnDownload = async () => {
    try {
      const newValue = !renameMediaOnDownload;
      setRenameMediaOnDownload(newValue);
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr);
      config.renameMediaOnDownload = newValue;
      config.videoKeepOriginalName = !newValue;
      await invoke<void>("save_config", { json: JSON.stringify(config) });
      await emit("rename-setting-changed", { enabled: newValue });
    } catch (err) {
      console.error("Failed to toggle rename media:", err);
    }
  };

  const handleClipDownloadModeChange = async (mode: ClipDownloadMode) => {
    if (mode === clipDownloadMode) return;
    const previousMode = clipDownloadMode;
    setClipDownloadMode(mode);
    try {
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr);
      config.clipDownloadMode = mode;
      await invoke<void>("save_config", { json: JSON.stringify(config) });
    } catch (err) {
      setClipDownloadMode(previousMode);
      console.error("Failed to save clip download mode:", err);
    }
  };

  const saveRenameRuleConfig = async (
    updates: Partial<{
      renameRulePreset: RenameRulePreset;
      renamePrefix: string;
      renameSuffix: string;
    }>,
  ) => {
    try {
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr);
      if (updates.renameRulePreset !== undefined) {
        config.renameRulePreset = updates.renameRulePreset;
      }
      if (updates.renamePrefix !== undefined) {
        config.renamePrefix = updates.renamePrefix;
      }
      if (updates.renameSuffix !== undefined) {
        config.renameSuffix = updates.renameSuffix;
      }
      await invoke<void>("save_config", { json: JSON.stringify(config) });
    } catch (err) {
      console.error("Failed to save rename rule config:", err);
    }
  };

  const handleRenameRulePresetChange = async (value: RenameRulePreset) => {
    setRenameRulePreset(value);
    await saveRenameRuleConfig({ renameRulePreset: value });
  };

  const handleRenamePrefixChange = async (value: string) => {
    setRenamePrefix(value);
    await saveRenameRuleConfig({ renamePrefix: value });
  };

  const handleRenameSuffixChange = async (value: string) => {
    setRenameSuffix(value);
    await saveRenameRuleConfig({ renameSuffix: value });
  };

  const showVersionTapHint = (message: string) => {
    setVersionTapHint(message);
    if (versionTapHintTimerRef.current) {
      clearTimeout(versionTapHintTimerRef.current);
    }
    versionTapHintTimerRef.current = setTimeout(() => {
      setVersionTapHint("");
      versionTapHintTimerRef.current = null;
    }, VERSION_TAP_HINT_DURATION_MS);
  };

  const exportSupportLogByVersionTap = async () => {
    if (supportLogExportInFlightRef.current) return;
    supportLogExportInFlightRef.current = true;
    try {
      const logPath = await invoke<string>("export_support_log");
      const fileName = logPath.split(/[/\\]/).pop() ?? logPath;
      const logDir = getParentDirectory(logPath);

      if (logDir) {
        try {
          await invoke<void>("open_folder", { path: logDir });
          showVersionTapHint(`诊断日志已生成并打开目录：${fileName}`);
        } catch (openErr) {
          showVersionTapHint(`诊断日志已生成：${fileName}`);
          console.error("Failed to open support log folder:", openErr);
        }
      } else {
        showVersionTapHint(`诊断日志已生成：${fileName}`);
      }
    } catch (err) {
      showVersionTapHint("生成诊断日志失败");
      console.error("Failed to export support log from version tap:", err);
    } finally {
      supportLogExportInFlightRef.current = false;
    }
  };

  const handleVersionClick = () => {
    versionTapCountRef.current += 1;
    const remaining = VERSION_TAP_THRESHOLD - versionTapCountRef.current;

    if (versionTapTimerRef.current) {
      clearTimeout(versionTapTimerRef.current);
    }
    versionTapTimerRef.current = setTimeout(() => {
      versionTapCountRef.current = 0;
      versionTapTimerRef.current = null;
      setVersionTapHint("");
    }, VERSION_TAP_RESET_MS);

    if (remaining === 1) {
      showVersionTapHint("再点一下生成诊断日志");
    }

    if (versionTapCountRef.current >= VERSION_TAP_THRESHOLD) {
      versionTapCountRef.current = 0;
      if (versionTapTimerRef.current) {
        clearTimeout(versionTapTimerRef.current);
        versionTapTimerRef.current = null;
      }
      void exportSupportLogByVersionTap();
    }
  };

  const toggleAePortal = async () => {
    const newValue = !aePortalEnabled;
    setAePortalEnabled(newValue);
    const configStr = await invoke<string>("get_config");
    const config = JSON.parse(configStr);
    config.aePortalEnabled = newValue;
    await invoke("save_config", { json: JSON.stringify(config) });
  };

  const selectAeExePath = async () => {
    const selected = await open({
      filters: [{ name: "Executable", extensions: ["exe"] }],
      title: "Select AfterFX.exe",
    });
    if (selected) {
      setAeExePath(selected as string);
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr);
      config.aeExePath = selected;
      await invoke("save_config", { json: JSON.stringify(config) });
    }
  };

  const truncatePath = (path: string, maxLen = 25) => {
    if (path.length <= maxLen) return path;
    return "..." + path.slice(-maxLen);
  };

  const closeWindow = () => {
    getCurrentWindow().close();
  };

  const renamePreview = buildRenamePreview(renameRulePreset, renamePrefix, renameSuffix);
  const renamePresetTriggerBorderColor = renamePresetMenuOpen ? colors.fieldBorderStrong : colors.fieldBorder;
  const renamePresetPopupBorderColor = colors.fieldBorder;
  const renamePresetLabel =
    RENAME_RULE_PRESET_OPTIONS.find((option) => option.value === renameRulePreset)?.label ??
    RENAME_RULE_PRESET_OPTIONS[0].label;
  const nestedLabelStyle: CSSProperties = {
    fontSize: 11,
    color: colors.textSecondary,
    display: 'block',
    minHeight: 14,
    lineHeight: '14px',
    letterSpacing: 0.18,
  };
  const compactFieldStyle: CSSProperties = {
    width: '100%',
    height: 36,
    boxSizing: 'border-box',
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${colors.fieldBorder}`,
    background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    color: colors.textPrimary,
    fontSize: 12,
    outline: 'none',
    boxShadow: `inset 0 1px 0 ${colors.fieldInset}`,
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  };
  const panelStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    border: 'none',
    boxShadow: `inset 0 0 0 1px ${colors.borderStart}, ${colors.panelShadow}`,
  };
  const getSelectableOptionStyle = (active: boolean): CSSProperties => ({
    borderRadius: 8,
    border: active ? `1px solid ${colors.accentBorder}` : `1px solid ${colors.fieldBorder}`,
    backgroundColor: active ? colors.accentSurface : 'transparent',
    boxShadow: active ? `inset 0 0 0 1px ${colors.accentBorder}` : `inset 0 1px 0 ${colors.fieldInset}`,
    color: active ? colors.accentText : colors.textSecondary,
    cursor: 'pointer',
    transition: 'border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease',
  });
  const spinnerStyle: CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: `1.5px solid ${colors.accentBorder}`,
    borderTopColor: colors.accentSolid,
    animation: 'spin 0.75s linear infinite',
    transformOrigin: '50% 50%',
  };
  const statusDotStyle: CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: colors.dangerSolid,
    boxShadow: `0 0 6px ${colors.dangerGlow}`,
    flexShrink: 0,
  };

  const renderRenamePresetField = () => (
    <div
      ref={renamePresetMenuRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}
    >
      <label style={nestedLabelStyle}>
        Rename Preset
      </label>
      <NeonFieldButton
        onClick={() =>
          setRenamePresetMenuOpen((prev) => {
            const nextOpen = !prev;
            if (!nextOpen) setHoveredRenamePreset(null);
            return nextOpen;
          })
        }
        trailingContent={
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            {renamePresetMenuOpen ? "▴" : "▾"}
          </span>
        }
        active={renamePresetMenuOpen}
        style={{
          height: 36,
          padding: "0 10px",
          border: `1px solid ${renamePresetTriggerBorderColor}`,
          boxShadow: renamePresetMenuOpen
            ? `inset 0 0 0 1px ${colors.fieldBorderStrong}, ${colors.panelShadow}`
            : `inset 0 1px 0 ${colors.fieldInset}`,
        }}
      >
        {renamePresetLabel}
      </NeonFieldButton>
      {renamePresetMenuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            borderRadius: 8,
            border: `1px solid ${renamePresetPopupBorderColor}`,
            backgroundColor: colors.bgSecondary,
            overflow: 'hidden',
            zIndex: 20,
            boxShadow: colors.panelShadowStrong,
          }}
        >
          {RENAME_RULE_PRESET_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setRenamePresetMenuOpen(false);
                setHoveredRenamePreset(null);
                void handleRenameRulePresetChange(option.value);
              }}
              onMouseEnter={() => setHoveredRenamePreset(option.value)}
              onMouseLeave={() => setHoveredRenamePreset((current) => (current === option.value ? null : current))}
              style={{
                width: '100%',
                height: 34,
                padding: '0 10px',
                border: 'none',
                borderBottom:
                  index === RENAME_RULE_PRESET_OPTIONS.length - 1
                    ? 'none'
                    : `1px solid ${colors.borderEnd}`,
                backgroundColor:
                  renameRulePreset === option.value
                    ? colors.accentSurfaceStrong
                    : hoveredRenamePreset === option.value
                      ? colors.fieldHoverBg
                      : colors.bgSecondary,
                color: colors.textPrimary,
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={panelStyle}>
      {/* Draggable Header */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.borderStart}`,
          background: 'transparent',
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary, margin: 0 }}>Settings</h2>
        <button
          onClick={closeWindow}
          onMouseEnter={() => setIsCloseHovered(true)}
          onMouseLeave={() => setIsCloseHovered(false)}
          style={{
            padding: 4,
            color: isCloseHovered ? colors.controlMutedHover : colors.controlMuted,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.18s ease',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        padding: 16,
        overflowY: 'auto',
        scrollbarWidth: 'none',  // Firefox
        msOverflowStyle: 'none', // IE/Edge
      }} className="hide-scrollbar">
        {/* Theme */}
        <NeonSection title="Theme">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setTheme('black')}
              style={{
                flex: 1,
                padding: '8px 12px',
                ...getSelectableOptionStyle(theme === 'black'),
                fontSize: 12,
              }}
            >
              Black
            </button>
            <button
              onClick={() => setTheme('white')}
              style={{
                flex: 1,
                padding: '8px 12px',
                ...getSelectableOptionStyle(theme === 'white'),
                fontSize: 12,
              }}
            >
              White
            </button>
          </div>
        </NeonSection>

        {/* Output Path */}
        <NeonSection title="Output Folder">
          <NeonFieldButton
            onClick={selectOutputPath}
            leadingIcon={<FolderOpen size={14} />}
          >
            {outputPath ? truncatePath(outputPath) : "Choose a folder..."}
          </NeonFieldButton>
        </NeonSection>

        {/* Shortcut */}
        <NeonSection
          title="Global Shortcut"
          hint="Use one shortcut to open FlowSelect from anywhere."
        >
          {isRecording ? (
            <div>
              <div style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                borderRadius: 8,
                textAlign: 'left',
                fontSize: 12,
                cursor: 'default',
                transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, color 0.18s ease',
                boxSizing: 'border-box',
                color: colors.textPrimary,
                border: `1px solid ${colors.accentBorder}`,
                boxShadow: `inset 0 0 0 1px ${colors.accentBorder}`,
              }}>
                <Keyboard size={14} style={{ color: colors.accentText, flexShrink: 0 }} />
                <span>{formatShortcutForDisplay(recordedKeys, isMacOS) || "Press your shortcut"}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, boxSizing: 'border-box' }}>
                <NeonButton
                  variant="default"
                  size="sm"
                  onClick={confirmShortcut}
                  disabled={!recordedKeys}
                  className="flex-1"
                >
                  Confirm
                </NeonButton>
                <NeonButton
                  variant="ghost"
                  size="sm"
                  onClick={cancelRecording}
                  className="flex-1"
                >
                  Cancel
                </NeonButton>
              </div>
            </div>
          ) : (
            <NeonFieldButton
              onClick={startRecording}
              leadingIcon={<Keyboard size={14} />}
            >
              {formatShortcutForDisplay(shortcut, isMacOS) || "Click to record shortcut"}
            </NeonFieldButton>
          )}
        </NeonSection>

        {/* Launch at startup */}
        <NeonSection title="Launch at startup">
          <NeonToggle checked={autostart} onChange={toggleAutostart} />
        </NeonSection>

        {/* Media Rename */}
        <NeonSection
          title="Rename downloaded media"
          hint="Apply a naming rule to new downloads instead of keeping the source name."
        >
          <NeonToggle checked={renameMediaOnDownload} onChange={toggleRenameMediaOnDownload} />
          {renameMediaOnDownload && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {renameRulePreset === "prefix_number" ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={nestedLabelStyle}>
                      Prefix
                    </label>
                    <input
                      type="text"
                      value={renamePrefix}
                      onChange={(e) => void handleRenamePrefixChange(e.target.value)}
                      placeholder="Flow"
                      style={compactFieldStyle}
                    />
                  </div>
                  {renderRenamePresetField()}
                </div>
              ) : (
                renderRenamePresetField()
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={nestedLabelStyle}>
                  Suffix
                </label>
                <input
                  type="text"
                  value={renameSuffix}
                  onChange={(e) => void handleRenameSuffixChange(e.target.value)}
                  placeholder="done"
                  style={compactFieldStyle}
                />
              </div>

              <div style={{ padding: '2px 0' }}>
                <NeonHint style={{ marginBottom: 4 }}>Preview</NeonHint>
                <div style={{ fontSize: 12, color: colors.textSecondary, opacity: 0.82, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {renamePreview}
                </div>
              </div>
            </div>
          )}
        </NeonSection>

        {/* Slice Download Mode */}
        <NeonSection title="Clip download mode">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {CLIP_DOWNLOAD_MODE_OPTIONS.map((option) => {
              const active = clipDownloadMode === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => void handleClipDownloadModeChange(option.value)}
                  style={{
                    ...getSelectableOptionStyle(active),
                    padding: '8px 10px',
                    textAlign: 'left',
                    display: 'grid',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{option.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.82 }}>{option.description}</span>
                </button>
              );
            })}
          </div>
          <NeonHint style={{ marginTop: 6 }}>
            Applies only to new clip downloads.
          </NeonHint>
        </NeonSection>

        {/* AE Portal */}
        <NeonSection
          title="After Effects auto-import"
          hint="Open finished media in After Effects after download."
        >
          <NeonToggle checked={aePortalEnabled} onChange={toggleAePortal} />
          {aePortalEnabled && (
            <NeonFieldButton
              onClick={selectAeExePath}
              leadingIcon={<FolderOpen size={14} />}
              style={{ marginTop: 8 }}
            >
              {aeExePath ? truncatePath(aeExePath) : "Choose AfterFX.exe..."}
            </NeonFieldButton>
          )}
        </NeonSection>

        {/* yt-dlp Version */}
        <NeonSection title="yt-dlp version">
          <NeonCard
            className="grid gap-2 rounded-lg p-0"
            style={{ padding: '10px 12px', borderRadius: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: colors.textPrimary }}>
                Installed: {ytdlpCurrentVersion}
              </span>
              {ytdlpInfo?.updateAvailable ? (
                <span
                  style={statusDotStyle}
                  title="Update available"
                />
              ) : null}
            </div>
            <NeonHint
              size="sm"
              tone={ytdlpInfo?.updateAvailable ? "accent" : "default"}
              style={{ color: ytdlpStatus.color, opacity: 1 }}
            >
              {ytdlpStatus.message}
            </NeonHint>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleYtdlpUpdate}
                disabled={isUpdatingYtdlp}
                style={{
                  minWidth: 96,
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: `1px solid ${isUpdatingYtdlp ? colors.accentBorder : colors.fieldBorder}`,
                  backgroundColor: isUpdatingYtdlp ? colors.accentSurface : 'transparent',
                  color: isUpdatingYtdlp ? colors.accentText : colors.textSecondary,
                  cursor: isUpdatingYtdlp ? 'wait' : 'pointer',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: isUpdatingYtdlp ? `inset 0 0 0 1px ${colors.accentBorder}` : `inset 0 1px 0 ${colors.fieldInset}`,
                  transition: 'border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease',
                }}
              >
                {isUpdatingYtdlp ? (
                  <span style={spinnerStyle} />
                ) : null}
                {isUpdatingYtdlp ? "Updating..." : "Update yt-dlp"}
              </button>
              <NeonHint style={{ opacity: 0.85 }}>
                You can also start this update from the red badge in the main window.
              </NeonHint>
            </div>
            {ytdlpHint ? (
              <NeonHint style={{ opacity: 0.85 }}>
                {ytdlpHint}
              </NeonHint>
            ) : null}
          </NeonCard>
        </NeonSection>

      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        textAlign: 'center',
        borderTop: `1px solid ${colors.borderStart}`,
        background: 'transparent',
      }}>
        <span
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleVersionClick}
          style={{
            fontSize: 10,
            color: colors.textSecondary,
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {`v${APP_VERSION}`}
        </span>
        <div style={{ fontSize: 10, color: colors.textSecondary, opacity: 0.65, minHeight: 14, marginTop: 2 }}>
          {versionTapHint}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
