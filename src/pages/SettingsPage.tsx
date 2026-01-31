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
  const [cookiesEnabled, setCookiesEnabled] = useState(false);
  const [cookiesBrowser, setCookiesBrowser] = useState("chrome");

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await invoke<string>("get_config");
        const config = JSON.parse(configStr);
        if (config.outputPath) {
          setOutputPath(config.outputPath);
        }
        if (config.cookiesEnabled !== undefined) {
          setCookiesEnabled(config.cookiesEnabled);
        }
        if (config.cookiesBrowser) {
          setCookiesBrowser(config.cookiesBrowser);
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

  const toggleCookies = async () => {
    try {
      const newValue = !cookiesEnabled;
      setCookiesEnabled(newValue);
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr);
      config.cookiesEnabled = newValue;
      config.cookiesBrowser = cookiesBrowser;
      await invoke("save_config", { json: JSON.stringify(config) });
    } catch (err) {
      console.error("Failed to toggle cookies:", err);
    }
  };

  const changeCookiesBrowser = async (browser: string) => {
    try {
      setCookiesBrowser(browser);
      const configStr = await invoke<string>("get_config");
      const config = JSON.parse(configStr);
      config.cookiesEnabled = cookiesEnabled;
      config.cookiesBrowser = browser;
      await invoke("save_config", { json: JSON.stringify(config) });
    } catch (err) {
      console.error("Failed to change cookies browser:", err);
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
      backgroundColor: '#1e1e1e',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid #3a3a3a',
    }}>
      {/* Draggable Header */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #3a3a3a',
          backgroundColor: '#252525',
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 500, color: '#e0e0e0', margin: 0 }}>Settings</h2>
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
          <label style={{ fontSize: 11, color: '#808080', marginBottom: 8, display: 'block' }}>
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
              backgroundColor: '#2a2a2a',
              borderRadius: 8,
              border: '1px solid #3a3a3a',
              textAlign: 'left',
              fontSize: 12,
              color: '#a0a0a0',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          >
            <FolderOpen size={14} style={{ color: '#606060', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {outputPath ? truncatePath(outputPath) : "Select folder..."}
            </span>
          </button>
        </div>

        {/* Launch at startup */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: '#808080', marginBottom: 8, display: 'block' }}>
            Launch at startup
          </label>
          <button
            onClick={toggleAutostart}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              backgroundColor: autostart ? '#3b82f6' : '#3a3a3a',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background-color 0.2s',
            }}
          >
            <span style={{
              position: 'absolute',
              top: 4,
              left: autostart ? 24 : 4,
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: 'white',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>

        {/* Video Cookies */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: '#808080', marginBottom: 8, display: 'block' }}>
            Video Cookies
          </label>
          <button
            onClick={toggleCookies}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              backgroundColor: cookiesEnabled ? '#3b82f6' : '#3a3a3a',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background-color 0.2s',
            }}
          >
            <span style={{
              position: 'absolute',
              top: 4,
              left: cookiesEnabled ? 24 : 4,
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: 'white',
              transition: 'left 0.2s',
            }} />
          </button>
          {cookiesEnabled && (
            <select
              value={cookiesBrowser}
              onChange={(e) => changeCookiesBrowser(e.target.value)}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '8px 12px',
                backgroundColor: '#2a2a2a',
                borderRadius: 8,
                fontSize: 12,
                color: '#a0a0a0',
                border: '1px solid #3a3a3a',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="chrome">Chrome</option>
              <option value="edge">Edge</option>
              <option value="firefox">Firefox</option>
              <option value="brave">Brave</option>
            </select>
          )}
        </div>

        {/* Shortcut */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: '#808080', marginBottom: 8, display: 'block' }}>
            Global Shortcut
          </label>
          {isRecording ? (
            <div>
              <div style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                borderRadius: 8,
                fontSize: 12,
                color: '#e0e0e0',
                border: '1px solid #3b82f6',
              }}>
                <Keyboard size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                <span>{recordedKeys || "Press keys..."}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={confirmShortcut}
                  disabled={!recordedKeys}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: '#3b82f6',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'white',
                    border: 'none',
                    cursor: recordedKeys ? 'pointer' : 'not-allowed',
                    opacity: recordedKeys ? 1 : 0.5,
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={cancelRecording}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: '#3a3a3a',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#a0a0a0',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#444'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                >
                  Cancel
                </button>
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
                backgroundColor: '#2a2a2a',
                borderRadius: 8,
                border: '1px solid #3a3a3a',
                textAlign: 'left',
                fontSize: 12,
                color: '#a0a0a0',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
            >
              <Keyboard size={14} style={{ color: '#606060', flexShrink: 0 }} />
              <span>{shortcut || "Click to set..."}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        textAlign: 'center',
        borderTop: '1px solid #3a3a3a',
        backgroundColor: '#252525',
      }}>
        <span style={{ fontSize: 10, color: '#505050' }}>v0.1.0</span>
      </div>
    </div>
  );
}

export default SettingsPage;
