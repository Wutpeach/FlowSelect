import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, FolderOpen, Keyboard } from "lucide-react";
import { NeonToggle } from "../components/ui/neon-toggle";
import { NeonButton } from "../components/ui/neon-button";
import { useTheme } from "../contexts/ThemeContext";

function SettingsPage() {
  const { theme, colors, setTheme } = useTheme();
  const [outputPath, setOutputPath] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState("");
  const [videoSeparateFolder, setVideoSeparateFolder] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [aePortalEnabled, setAePortalEnabled] = useState(false);
  const [aeExePath, setAeExePath] = useState("");

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr);
        if (config.outputPath) {
          setOutputPath(config.outputPath);
        }
        if (config.videoSeparateFolder !== undefined) {
          setVideoSeparateFolder(config.videoSeparateFolder);
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

  const toggleVideoSeparateFolder = async () => {
    const newValue = !videoSeparateFolder;
    setVideoSeparateFolder(newValue);
    const configStr = await invoke<string>("get_config");
    const config = JSON.parse(configStr);
    config.videoSeparateFolder = newValue;
    config.videoKeepOriginalName = newValue;
    await invoke("save_config", { json: JSON.stringify(config) });
  };

  const toggleDevMode = async () => {
    const newValue = !devMode;
    setDevMode(newValue);
    // 不保存到配置文件，仅通知主窗口 + 切换 devtools
    await emit("devmode-changed", { enabled: newValue });
    await invoke("toggle_devtools", { enabled: newValue });
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

        {/* Video Separate Folder */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Save Videos to Separate Folder
          </label>
          <NeonToggle checked={videoSeparateFolder} onChange={toggleVideoSeparateFolder} />
        </div>

        {/* Developer Mode */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, display: 'block' }}>
            Developer Mode (F12 DevTools)
          </label>
          <NeonToggle checked={devMode} onChange={toggleDevMode} />
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
        <span style={{ fontSize: 10, color: colors.textSecondary }}>v0.1.2</span>
      </div>
    </div>
  );
}

export default SettingsPage;
