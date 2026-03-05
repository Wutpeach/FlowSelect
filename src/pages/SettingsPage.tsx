import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, FolderOpen, Keyboard } from "lucide-react";
import { NeonToggle } from "../components/ui/neon-toggle";
import { NeonButton } from "../components/ui/neon-button";
import { useTheme } from "../contexts/ThemeContext";

type RenameRulePreset = "desc_number" | "asc_number" | "prefix_number";
type YtdlpVersionInfo = {
  current: string;
  latest: string;
  updateAvailable: boolean;
};

const DEFAULT_RENAME_RULE_PRESET: RenameRulePreset = "desc_number";
const RENAME_RULE_PRESET_OPTIONS: Array<{ value: RenameRulePreset; label: string }> = [
  { value: "desc_number", label: "Descending" },
  { value: "asc_number", label: "Ascending" },
  { value: "prefix_number", label: "Prefix + Sequence" },
];
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;
const DEV_MODE_TAP_THRESHOLD = 5;
const DEV_MODE_TAP_RESET_MS = 1500;
const DEV_MODE_HINT_DURATION_MS = 1200;
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
  const isWindows = navigator.userAgent.toLowerCase().includes("windows");
  const [outputPath, setOutputPath] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [renameRulePreset, setRenameRulePreset] = useState<RenameRulePreset>(DEFAULT_RENAME_RULE_PRESET);
  const [renamePrefix, setRenamePrefix] = useState("");
  const [renameSuffix, setRenameSuffix] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [aePortalEnabled, setAePortalEnabled] = useState(false);
  const [aeExePath, setAeExePath] = useState("");
  const [versionTapHint, setVersionTapHint] = useState("");
  const [ytdlpInfo, setYtdlpInfo] = useState<YtdlpVersionInfo | null>(null);
  const [isUpdatingYtdlp, setIsUpdatingYtdlp] = useState(false);
  const [ytdlpHint, setYtdlpHint] = useState("");
  const [renamePresetMenuOpen, setRenamePresetMenuOpen] = useState(false);
  const [hoveredRenamePreset, setHoveredRenamePreset] = useState<RenameRulePreset | null>(null);
  const versionTapCountRef = useRef(0);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTapHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytdlpHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devModeToggleInFlightRef = useRef(false);
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

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr);
        if (config.outputPath) {
          setOutputPath(config.outputPath);
        }
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
        if (config.devMode !== undefined) {
          setDevMode(isWindows ? false : config.devMode);
        }
        if (config.aePortalEnabled !== undefined) {
          setAePortalEnabled(config.aePortalEnabled);
        }
        if (config.aeExePath) {
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
  }, [isWindows, refreshYtdlpVersion]);

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

  const saveOutputPath = async (nextOutputPath: string) => {
    try {
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr) as Record<string, unknown>;
      const previousOutputPath =
        typeof config.outputPath === "string" ? config.outputPath : "";

      if (previousOutputPath === nextOutputPath) {
        return;
      }

      config.outputPath = nextOutputPath;
      await invoke<void>("save_config", { json: JSON.stringify(config) });
      await emit("output-path-changed", { path: nextOutputPath });
      try {
        await invoke<boolean>("reset_rename_counter");
      } catch (err) {
        console.error("Failed to reset rename counter after output path change:", err);
      }
    } catch (err) {
      console.error("Failed to save output path:", err);
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
        setOutputPath(selected);
        await saveOutputPath(selected);
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
    }, DEV_MODE_HINT_DURATION_MS);
  };

  const persistDevModeConfig = async (enabled: boolean) => {
    const configStr = await invoke<string>("get_config");
    const config = JSON.parse(configStr);
    config.devMode = enabled;
    await invoke<void>("save_config", { json: JSON.stringify(config) });
  };

  const toggleDevModeByVersionTap = async () => {
    if (devModeToggleInFlightRef.current) return;
    devModeToggleInFlightRef.current = true;
    const previousValue = devMode;
    const nextValue = isWindows ? true : !previousValue;
    setDevMode(nextValue);
    try {
      await Promise.all([
        emit("devmode-changed", { enabled: nextValue }),
        invoke<void>("toggle_devtools", { enabled: nextValue }),
      ]);
      await persistDevModeConfig(isWindows ? false : nextValue);
      showVersionTapHint(nextValue ? "开发模式已开启" : "开发模式已关闭");
    } catch (err) {
      setDevMode(previousValue);
      showVersionTapHint("切换开发模式失败");
      console.error("Failed to toggle dev mode from version tap:", err);
    } finally {
      devModeToggleInFlightRef.current = false;
    }
  };

  const handleVersionClick = () => {
    versionTapCountRef.current += 1;
    const remaining = DEV_MODE_TAP_THRESHOLD - versionTapCountRef.current;

    if (versionTapTimerRef.current) {
      clearTimeout(versionTapTimerRef.current);
    }
    versionTapTimerRef.current = setTimeout(() => {
      versionTapCountRef.current = 0;
      versionTapTimerRef.current = null;
      setVersionTapHint("");
    }, DEV_MODE_TAP_RESET_MS);

    if (remaining === 1) {
      showVersionTapHint("再点一下切换开发模式");
    }

    if (versionTapCountRef.current >= DEV_MODE_TAP_THRESHOLD) {
      versionTapCountRef.current = 0;
      if (versionTapTimerRef.current) {
        clearTimeout(versionTapTimerRef.current);
        versionTapTimerRef.current = null;
      }
      void toggleDevModeByVersionTap();
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
  const renamePresetTriggerBorderColor = colors.borderStart;
  const renamePresetPopupBorderColor = colors.borderStart;
  const renamePresetLabel =
    RENAME_RULE_PRESET_OPTIONS.find((option) => option.value === renameRulePreset)?.label ??
    RENAME_RULE_PRESET_OPTIONS[0].label;

  const renderRenamePresetField = () => (
    <div
      ref={renamePresetMenuRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}
    >
      <label style={{ fontSize: 11, color: colors.textSecondary, display: 'block', minHeight: 14, lineHeight: '14px' }}>
        Rename Preset
      </label>
      <button
        type="button"
        onClick={() =>
          setRenamePresetMenuOpen((prev) => {
            const nextOpen = !prev;
            if (!nextOpen) setHoveredRenamePreset(null);
            return nextOpen;
          })
        }
        style={{
          width: '100%',
          height: 36,
          boxSizing: 'border-box',
          padding: '0 10px',
          borderRadius: 8,
          border: `1px solid ${renamePresetTriggerBorderColor}`,
          background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
          color: colors.textPrimary,
          fontSize: 12,
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <span>{renamePresetLabel}</span>
        <span style={{ fontSize: 11, color: colors.textSecondary }}>
          {renamePresetMenuOpen ? '▴' : '▾'}
        </span>
      </button>
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
            boxShadow: theme === "black"
              ? '0 8px 20px rgba(0,0,0,0.45)'
              : '0 8px 20px rgba(0,0,0,0.18)',
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
                    : `1px solid ${theme === "black" ? colors.borderEnd : colors.borderStart}`,
                backgroundColor:
                  renameRulePreset === option.value
                    ? theme === "black"
                      ? 'rgba(59,130,246,0.2)'
                      : 'rgba(59,130,246,0.12)'
                    : hoveredRenamePreset === option.value
                      ? theme === "black"
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.06)'
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
    <div style={{
      width: '100%',
      height: '100%',
      background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      border: 'none',
      boxShadow: `inset 0 0 0 1px ${colors.borderStart}, 0 2px 4px rgba(0,0,0,0.1)`,
    }}>
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
          style={{
            padding: 4,
            color: '#606060',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#a0a0a0'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#606060'}
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
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Theme
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setTheme('black')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: theme === 'black' ? '1px solid #3b82f6' : `1px solid ${colors.borderStart}`,
                backgroundColor: theme === 'black' ? 'rgba(59,130,246,0.1)' : 'transparent',
                color: theme === 'black' ? '#3b82f6' : colors.textSecondary,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Black
            </button>
            <button
              onClick={() => setTheme('white')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: theme === 'white' ? '1px solid #3b82f6' : `1px solid ${colors.borderStart}`,
                backgroundColor: theme === 'white' ? 'rgba(59,130,246,0.1)' : 'transparent',
                color: theme === 'white' ? '#3b82f6' : colors.textSecondary,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              White
            </button>
          </div>
        </div>

        {/* Output Path */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Output Path
          </label>
          <button
            onClick={selectOutputPath}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
              borderRadius: 8,
              border: `1px solid ${colors.borderStart}`,
              textAlign: 'left',
              fontSize: 12,
              color: colors.textSecondary,
              cursor: 'pointer',
            }}
          >
            <FolderOpen size={14} style={{ color: colors.textSecondary, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {outputPath ? truncatePath(outputPath) : "Select folder..."}
            </span>
          </button>
        </div>

        {/* Shortcut */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Global Shortcut
          </label>
          {isRecording ? (
            <div>
              <div style={{
                width: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                borderRadius: 8,
                fontSize: 12,
                color: colors.textPrimary,
                border: '1px solid #3b82f6',
              }}>
                <Keyboard size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                <span>{formatShortcutForDisplay(recordedKeys, isMacOS) || "Press keys..."}</span>
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
            <button
              onClick={startRecording}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                borderRadius: 8,
                border: `1px solid ${colors.borderStart}`,
                textAlign: 'left',
                fontSize: 12,
                color: colors.textSecondary,
                cursor: 'pointer',
              }}
            >
              <Keyboard size={14} style={{ color: colors.textSecondary, flexShrink: 0 }} />
              <span>{formatShortcutForDisplay(shortcut, isMacOS) || "Click to set..."}</span>
            </button>
          )}
        </div>

        {/* Launch at startup */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Launch at startup
          </label>
          <NeonToggle checked={autostart} onChange={toggleAutostart} />
        </div>

        {/* Media Rename */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Enable Rename on Download
          </label>
          <NeonToggle checked={renameMediaOnDownload} onChange={toggleRenameMediaOnDownload} />
          {renameMediaOnDownload && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {renameRulePreset === "prefix_number" ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, color: colors.textSecondary, display: 'block', minHeight: 14, lineHeight: '14px' }}>
                      Prefix
                    </label>
                    <input
                      type="text"
                      value={renamePrefix}
                      onChange={(e) => void handleRenamePrefixChange(e.target.value)}
                      placeholder="Flow"
                      style={{
                        width: '100%',
                        height: 36,
                        boxSizing: 'border-box',
                        padding: '0 10px',
                        borderRadius: 8,
                        border: `1px solid ${colors.borderStart}`,
                        background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                        color: colors.textPrimary,
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                  </div>
                  {renderRenamePresetField()}
                </div>
              ) : (
                renderRenamePresetField()
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: colors.textSecondary, display: 'block', minHeight: 14, lineHeight: '14px' }}>
                  Suffix
                </label>
                <input
                  type="text"
                  value={renameSuffix}
                  onChange={(e) => void handleRenameSuffixChange(e.target.value)}
                  placeholder="done"
                  style={{
                    width: '100%',
                    height: 36,
                    boxSizing: 'border-box',
                    padding: '0 10px',
                    borderRadius: 8,
                    border: `1px solid ${colors.borderStart}`,
                    background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                    color: colors.textPrimary,
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ padding: '2px 0' }}>
                <div style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 4 }}>
                  Preview
                </div>
                <div style={{ fontSize: 12, color: colors.textSecondary, opacity: 0.82, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {renamePreview}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* AE Portal */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            AE Portal (Auto Import to After Effects)
          </label>
          <NeonToggle checked={aePortalEnabled} onChange={toggleAePortal} />
          {aePortalEnabled && (
            <button
              onClick={selectAeExePath}
              style={{
                marginTop: 8,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                borderRadius: 8,
                border: `1px solid ${colors.borderStart}`,
                textAlign: 'left',
                fontSize: 12,
                color: colors.textSecondary,
                cursor: 'pointer',
              }}
            >
              <FolderOpen size={14} style={{ color: colors.textSecondary, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {aeExePath ? truncatePath(aeExePath) : "Select AfterFX.exe..."}
              </span>
            </button>
          )}
        </div>

        {/* yt-dlp Version */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            yt-dlp Version
          </label>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.borderStart}`,
              background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: colors.textPrimary }}>
                Current: {ytdlpInfo?.current ?? "Unknown"}
              </span>
              {ytdlpInfo?.updateAvailable ? (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)',
                    flexShrink: 0,
                  }}
                  title="Update available"
                />
              ) : null}
            </div>
            {ytdlpInfo?.updateAvailable ? (
              <div style={{ fontSize: 11, color: '#ef4444' }}>
                Update available: {ytdlpInfo.latest}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: colors.textSecondary }}>
                Already up to date.
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleYtdlpUpdate}
                disabled={isUpdatingYtdlp}
                style={{
                  minWidth: 96,
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: `1px solid ${colors.borderStart}`,
                  backgroundColor: isUpdatingYtdlp ? 'rgba(59,130,246,0.08)' : 'transparent',
                  color: isUpdatingYtdlp ? '#3b82f6' : colors.textSecondary,
                  cursor: isUpdatingYtdlp ? 'wait' : 'pointer',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {isUpdatingYtdlp ? (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      border: '1.5px solid rgba(59, 130, 246, 0.22)',
                      borderTopColor: '#3b82f6',
                      animation: 'spin 0.75s linear infinite',
                      transformOrigin: '50% 50%',
                    }}
                  />
                ) : null}
                {isUpdatingYtdlp ? "Updating..." : "Update yt-dlp"}
              </button>
              <span style={{ fontSize: 10, color: colors.textSecondary, opacity: 0.85 }}>
                You can also update from the red dot in main window.
              </span>
            </div>
            {ytdlpHint ? (
              <div style={{ fontSize: 10, color: colors.textSecondary, opacity: 0.85 }}>
                {ytdlpHint}
              </div>
            ) : null}
          </div>
        </div>

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
          v0.1.8
        </span>
        <div style={{ fontSize: 10, color: colors.textSecondary, opacity: 0.65, minHeight: 14, marginTop: 2 }}>
          {versionTapHint}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
