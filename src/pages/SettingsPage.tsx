import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, FolderOpen, Keyboard } from "lucide-react";
import { NeonToggle } from "../components/ui/neon-toggle";
import { NeonButton } from "../components/ui/neon-button";
import { useTheme } from "../contexts/ThemeContext";

type RenameRulePreset = "desc_number" | "asc_number" | "prefix_number";

const DEFAULT_RENAME_RULE_PRESET: RenameRulePreset = "desc_number";
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;
const DEV_MODE_TAP_THRESHOLD = 5;
const DEV_MODE_TAP_RESET_MS = 1500;
const DEV_MODE_HINT_DURATION_MS = 1200;

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
  const versionTapCountRef = useRef(0);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTapHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          setDevMode(config.devMode);
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
    };
  }, []);

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

  // Save config when outputPath changes
  useEffect(() => {
    if (!outputPath) return;

    const saveConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr);
        config.outputPath = outputPath;
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

  const toggleDevModeByVersionTap = async () => {
    const nextValue = !devMode;
    setDevMode(nextValue);
    try {
      await emit("devmode-changed", { enabled: nextValue });
      await invoke("toggle_devtools", { enabled: nextValue });
      showVersionTapHint(nextValue ? "开发模式已开启" : "开发模式已关闭");
    } catch (err) {
      setDevMode(devMode);
      showVersionTapHint("切换开发模式失败");
      console.error("Failed to toggle dev mode from version tap:", err);
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

        {/* Launch at startup */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Launch at startup
          </label>
          <NeonToggle checked={autostart} onChange={toggleAutostart} />
        </div>

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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, color: colors.textSecondary, display: 'block', minHeight: 14, lineHeight: '14px' }}>
                      Rename Preset
                    </label>
                    <select
                      value={renameRulePreset}
                      onChange={(e) => void handleRenameRulePresetChange(e.target.value as RenameRulePreset)}
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
                    >
                      <option value="desc_number">Descending</option>
                      <option value="asc_number">Ascending</option>
                      <option value="prefix_number">Prefix + Sequence</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: colors.textSecondary, display: 'block', minHeight: 14, lineHeight: '14px' }}>
                    Rename Preset
                  </label>
                  <select
                    value={renameRulePreset}
                    onChange={(e) => void handleRenameRulePresetChange(e.target.value as RenameRulePreset)}
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
                  >
                    <option value="desc_number">Descending</option>
                    <option value="asc_number">Ascending</option>
                    <option value="prefix_number">Prefix + Sequence</option>
                  </select>
                </div>
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
                <span>{recordedKeys || "Press keys..."}</span>
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
              <span>{shortcut || "Click to set..."}</span>
            </button>
          )}
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
          v0.1.5
        </span>
        <div style={{ fontSize: 10, color: colors.textSecondary, opacity: 0.65, minHeight: 14, marginTop: 2 }}>
          {versionTapHint}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
