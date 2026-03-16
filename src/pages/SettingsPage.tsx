import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, FolderOpen, Keyboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NeonToggle } from "../components/ui/neon-toggle";
import { NeonButton } from "../components/ui/neon-button";
import {
  NeonDropdownField,
  NeonFieldButton,
  NeonHint,
  NeonSection,
  type NeonDropdownOption,
} from "../components/ui";
import { useTheme } from "../contexts/ThemeContext";
import { saveOutputPath } from "../utils/outputPath";
import { APP_VERSION } from "../constants/appVersion";
import { DownloaderDeck } from "./settings/DownloaderDeck";
import type { PinterestDownloaderInfo } from "../types/pinterestDownloader";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies";
import type { YtdlpVersionInfo } from "../types/ytdlp";
import { changeDesktopLanguage } from "../i18n/desktopLanguage";
import {
  FALLBACK_LANGUAGE,
  SUPPORTED_APP_LANGUAGES,
  type AppLanguage,
} from "../i18n/contract";
import { normalizeAppLanguage } from "../i18n/language";
import {
  getRuntimeGateHeadline,
  getRuntimeGateNextLabel,
  getRuntimeGateProgressLabel,
  runtimeGateIsActive,
  runtimeGateNeedsManualAction,
  summarizeRuntimeGateError,
} from "../utils/runtimeDependencyGate";

type RenameRulePreset = "desc_number" | "asc_number" | "prefix_number";

const DEFAULT_RENAME_RULE_PRESET: RenameRulePreset = "desc_number";
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
  const { t, i18n } = useTranslation(["desktop", "common"]);
  const { theme, colors, setTheme } = useTheme();
  const isMacOS = navigator.userAgent.toLowerCase().includes("mac");
  const [outputPath, setOutputPath] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [renameRulePreset, setRenameRulePreset] = useState<RenameRulePreset>(DEFAULT_RENAME_RULE_PRESET);
  const [renamePrefix, setRenamePrefix] = useState("");
  const [renameSuffix, setRenameSuffix] = useState("");
  const [aePortalEnabled, setAePortalEnabled] = useState(false);
  const [aeExePath, setAeExePath] = useState("");
  const [versionTapHint, setVersionTapHint] = useState("");
  const [ytdlpInfo, setYtdlpInfo] = useState<YtdlpVersionInfo | null>(null);
  const [pinterestInfo, setPinterestInfo] = useState<PinterestDownloaderInfo | null>(null);
  const [runtimeDependencyStatus, setRuntimeDependencyStatus] =
    useState<RuntimeDependencyStatusSnapshot | null>(null);
  const [runtimeDependencyGateState, setRuntimeDependencyGateState] =
    useState<RuntimeDependencyGateStatePayload | null>(null);
  const [isUpdatingYtdlp, setIsUpdatingYtdlp] = useState(false);
  const [ytdlpHint, setYtdlpHint] = useState("");
  const [pinterestHint, setPinterestHint] = useState("");
  const [runtimeHint, setRuntimeHint] = useState("");
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const versionTapCountRef = useRef(0);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTapHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytdlpHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinterestHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runtimeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportLogExportInFlightRef = useRef(false);
  const currentLanguage = normalizeAppLanguage(i18n.resolvedLanguage) ?? FALLBACK_LANGUAGE;
  const languageOptions: Array<NeonDropdownOption<AppLanguage>> = SUPPORTED_APP_LANGUAGES.map((value) => ({
    value,
    label: t(`common:language.${value}`),
  }));
  const renameRulePresetOptions: Array<NeonDropdownOption<RenameRulePreset>> = [
    {
      value: "desc_number",
      label: t("desktop:settings.rename.options.descending"),
    },
    {
      value: "asc_number",
      label: t("desktop:settings.rename.options.ascending"),
    },
    {
      value: "prefix_number",
      label: t("desktop:settings.rename.options.prefixSequence"),
    },
  ];

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

  const showPinterestHint = useCallback((message: string) => {
    setPinterestHint(message);
    if (pinterestHintTimerRef.current) {
      clearTimeout(pinterestHintTimerRef.current);
    }
    pinterestHintTimerRef.current = setTimeout(() => {
      setPinterestHint("");
      pinterestHintTimerRef.current = null;
    }, 2200);
  }, []);

  const showRuntimeHint = useCallback((message: string) => {
    setRuntimeHint(message);
    if (runtimeHintTimerRef.current) {
      clearTimeout(runtimeHintTimerRef.current);
    }
    runtimeHintTimerRef.current = setTimeout(() => {
      setRuntimeHint("");
      runtimeHintTimerRef.current = null;
    }, 2200);
  }, []);

  const refreshRuntimeDependencyStatus = useCallback(async () => {
    try {
      const status = await invoke<RuntimeDependencyStatusSnapshot>("get_runtime_dependency_status");
      setRuntimeDependencyStatus(status);
      return status;
    } catch (err) {
      console.error("Failed to load runtime dependency status:", err);
      setRuntimeDependencyStatus(null);
      return null;
    }
  }, []);

  const refreshYtdlpVersion = useCallback(async () => {
    const status = await refreshRuntimeDependencyStatus();
    if (!status || status.ytDlp.state !== "ready") {
      setYtdlpInfo(null);
      return null;
    }

    try {
      const versionInfo = await invoke<YtdlpVersionInfo>("check_ytdlp_version");
      setYtdlpInfo(versionInfo);
      return versionInfo;
    } catch (err) {
      console.error("Failed to check yt-dlp version:", err);
      setYtdlpInfo(null);
      return null;
    }
  }, [refreshRuntimeDependencyStatus]);

  const refreshPinterestDownloaderInfo = useCallback(async () => {
    try {
      const info = await invoke<PinterestDownloaderInfo>("get_pinterest_downloader_info");
      setPinterestInfo(info);
    } catch (err) {
      console.error("Failed to load Pinterest downloader info:", err);
      setPinterestInfo(null);
    }
  }, []);

  const refreshRuntimeDependencyGateState = useCallback(async () => {
    try {
      const state = await invoke<RuntimeDependencyGateStatePayload>("refresh_runtime_dependency_gate_state");
      setRuntimeDependencyGateState(state);
      return state;
    } catch (err) {
      console.error("Failed to refresh runtime dependency gate state:", err);
      setRuntimeDependencyGateState(null);
      return null;
    }
  }, []);

  const ytdlpCurrentVersion = ytdlpInfo?.current ?? t("desktop:settings.downloaders.unknown");
  const ytdlpStatus = (() => {
    if (!ytdlpInfo) {
      return {
        color: colors.textSecondary,
        message: t("desktop:settings.downloaders.ytdlp.checkUnavailable"),
      };
    }

    if (ytdlpInfo.updateAvailable === true && ytdlpInfo.latest) {
      return {
        color: colors.dangerText,
        message: t("desktop:settings.downloaders.ytdlp.updateAvailable", {
          version: ytdlpInfo.latest,
        }),
      };
    }

    if (ytdlpInfo.latest) {
      return {
        color: colors.textSecondary,
        message: t("desktop:settings.downloaders.ytdlp.upToDate"),
      };
    }

    return {
      color: colors.textSecondary,
      message: t("desktop:settings.downloaders.ytdlp.localVersionOnly"),
    };
  })();
  const pinterestCurrentVersion = pinterestInfo?.current ?? t("desktop:settings.downloaders.unknown");
  const pinterestStatusMessage = (() => {
    if (!pinterestInfo) {
      return t("desktop:settings.downloaders.pinterest.detailsUnavailable");
    }
    return t("desktop:settings.downloaders.pinterest.managedByApp");
  })();
  const runtimeGatePhase = runtimeDependencyGateState?.phase ?? "idle";
  const runtimeGatePhaseLabel = t(`desktop:settings.downloaders.runtime.phase.${runtimeGatePhase}`);
  const runtimeGateIsBusy = runtimeGateIsActive(runtimeGatePhase);
  const runtimeGateRequiresManualAction = runtimeGateNeedsManualAction(runtimeGatePhase)
    || (
      !runtimeGateIsBusy
      && (
        (runtimeDependencyGateState?.missingComponents.length ?? 0) > 0
        || runtimeDependencyStatus === null
      )
    );
  const runtimeGateHeadline = getRuntimeGateHeadline(t, runtimeDependencyGateState);
  const runtimeGateProgressLabel = getRuntimeGateProgressLabel(t, runtimeDependencyGateState);
  const runtimeGateNextLabel = getRuntimeGateNextLabel(t, runtimeDependencyGateState);
  const runtimeGateErrorSummary = summarizeRuntimeGateError(runtimeDependencyGateState?.lastError);
  const runtimeGateColor = (() => {
    switch (runtimeGatePhase) {
      case "ready":
        return colors.textSecondary;
      case "awaiting_confirmation":
      case "blocked_by_user":
      case "failed":
        return colors.warningText;
      case "checking":
      case "downloading":
        return colors.warningText;
      default:
        return colors.textSecondary;
    }
  })();
  const runtimeMissingComponents = runtimeDependencyGateState?.missingComponents ?? [];
  const runtimeSummaryMessage = (() => {
    if (!runtimeDependencyStatus) {
      return t("desktop:settings.downloaders.runtime.unavailable");
    }
    if (runtimeMissingComponents.length === 0) {
      return t("desktop:settings.downloaders.runtime.allReady");
    }
    return t("desktop:settings.downloaders.runtime.missingItems", {
      items: runtimeMissingComponents.join(", "),
    });
  })();
  const runtimeDescriptionText = runtimeHint
    || (
      runtimeGateIsBusy
        ? runtimeGateHeadline
        : runtimeGateRequiresManualAction
          ? t("desktop:settings.downloaders.runtime.mainWindowRetryHint")
          : t("desktop:settings.downloaders.runtime.description")
    );
  const runtimeDetailText = (() => {
    if (runtimeGateRequiresManualAction) {
      return runtimeGateErrorSummary ?? runtimeSummaryMessage;
    }

    if (runtimeGateProgressLabel && runtimeGateNextLabel) {
      return `${runtimeGateProgressLabel} · ${runtimeGateNextLabel}`;
    }

    return runtimeGateProgressLabel ?? runtimeGateNextLabel ?? runtimeSummaryMessage;
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
    void refreshPinterestDownloaderInfo();
    void refreshRuntimeDependencyStatus();
    void refreshRuntimeDependencyGateState();

    const loadShortcut = async () => {
      try {
        const current = await invoke<string>("get_current_shortcut");
        setShortcut(current);
      } catch (err) {
        console.error("Failed to load shortcut:", err);
      }
    };
    loadShortcut();
  }, [
    refreshPinterestDownloaderInfo,
    refreshRuntimeDependencyGateState,
    refreshRuntimeDependencyStatus,
    refreshYtdlpVersion,
  ]);

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
      if (pinterestHintTimerRef.current) {
        clearTimeout(pinterestHintTimerRef.current);
        pinterestHintTimerRef.current = null;
      }
      if (runtimeHintTimerRef.current) {
        clearTimeout(runtimeHintTimerRef.current);
        runtimeHintTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ source: "main" | "settings" }>("ytdlp-version-refresh", (event) => {
      if (event.payload.source === "settings") {
        return;
      }
      void refreshYtdlpVersion();
      if (event.payload.source === "main") {
        showYtdlpHint(t("desktop:settings.downloaders.ytdlp.updatedFromMain"));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshYtdlpVersion, showYtdlpHint, t]);

  useEffect(() => {
    const unlisten = listen<RuntimeDependencyGateStatePayload>(
      "runtime-dependency-gate-state",
      (event) => {
        setRuntimeDependencyGateState(event.payload);
        void refreshRuntimeDependencyStatus();
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshRuntimeDependencyStatus]);

  const startRecording = () => {
    setRecordedKeys("");
    setIsRecording(true);
  };

  const cancelRecording = () => {
    setIsRecording(false);
    setRecordedKeys("");
  };

  const handleLanguageChange = async (nextLanguage: AppLanguage) => {
    if (currentLanguage === nextLanguage) {
      return;
    }

    try {
      await changeDesktopLanguage(nextLanguage);
    } catch (err) {
      console.error("Failed to change app language:", err);
    }
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
        title: t("desktop:settings.outputFolder.dialogTitle"),
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
      showYtdlpHint(t("desktop:settings.downloaders.ytdlp.updatedTo", { version: latestVersion }));
    } catch (err) {
      console.error("Failed to update yt-dlp:", err);
      showYtdlpHint(t("desktop:settings.downloaders.ytdlp.updateFailed"));
    } finally {
      setIsUpdatingYtdlp(false);
    }
  };

  const openFlowSelectReleases = async () => {
    try {
      await openUrl("https://github.com/Wutpeach/FlowSelect/releases");
    } catch (err) {
      console.error("Failed to open FlowSelect releases:", err);
      showPinterestHint(t("desktop:settings.downloaders.pinterest.openReleasesFailed"));
    }
  };

  const handleRuntimeDependencyRecheck = async () => {
    const [status, gate] = await Promise.all([
      refreshRuntimeDependencyStatus(),
      refreshRuntimeDependencyGateState(),
    ]);
    if (status && gate) {
      showRuntimeHint(t("desktop:settings.downloaders.runtime.refreshed"));
      return;
    }
    showRuntimeHint(t("desktop:settings.downloaders.runtime.refreshFailed"));
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
          showVersionTapHint(
            t("desktop:settings.supportLog.exportedAndOpened", { fileName }),
          );
        } catch (openErr) {
          showVersionTapHint(t("desktop:settings.supportLog.exported", { fileName }));
          console.error("Failed to open support log folder:", openErr);
        }
      } else {
        showVersionTapHint(t("desktop:settings.supportLog.exported", { fileName }));
      }
    } catch (err) {
      showVersionTapHint(t("desktop:settings.supportLog.failed"));
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
      showVersionTapHint(t("desktop:settings.supportLog.exportReady"));
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
      filters: [{ name: t("desktop:settings.aePortal.executableFilter"), extensions: ["exe"] }],
      title: t("desktop:settings.aePortal.dialogTitle"),
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
  const runtimeStatusDotStyle: CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: colors.warningSolid,
    boxShadow: `0 0 6px ${colors.warningGlow}`,
    flexShrink: 0,
  };
  const downloaderCards = [
    {
      id: "ytdlp",
      title: "yt-dlp",
      body: (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12, color: colors.textPrimary }}>
              {t("desktop:settings.downloaders.ytdlp.version", { version: ytdlpCurrentVersion })}
            </span>
            {ytdlpInfo?.updateAvailable ? (
              <span
                style={statusDotStyle}
                title={ytdlpStatus.message}
              />
            ) : null}
          </div>
          <span
            style={{
              fontSize: 11,
              color: ytdlpHint ? colors.accentText : colors.textSecondary,
              opacity: 0.94,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ytdlpHint || t("desktop:settings.downloaders.ytdlp.description")}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 10,
                color: ytdlpStatus.color,
                opacity: 0.85,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {ytdlpStatus.message}
            </span>
            <NeonButton
              type="button"
              variant={isUpdatingYtdlp ? "outline" : "ghost"}
              size="sm"
              onClick={handleYtdlpUpdate}
              disabled={isUpdatingYtdlp}
              style={{
                minWidth: 78,
                fontSize: 11,
                gap: 6,
                padding: '5px 10px',
                cursor: isUpdatingYtdlp ? 'wait' : 'pointer',
              }}
            >
              {isUpdatingYtdlp ? (
                <span style={spinnerStyle} />
              ) : null}
              {isUpdatingYtdlp
                ? t("desktop:settings.downloaders.ytdlp.updating")
                : t("desktop:settings.downloaders.ytdlp.button")}
            </NeonButton>
          </div>
        </>
      ),
    },
    {
      id: "pinterest",
      title: "pin-dlp",
      body: (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: colors.textPrimary }}>
              {t("desktop:settings.downloaders.pinterest.version", { version: pinterestCurrentVersion })}
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              color: pinterestHint ? colors.accentText : colors.textSecondary,
              opacity: 0.94,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {pinterestHint || t("desktop:settings.downloaders.pinterest.description")}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 10,
                color: colors.textSecondary,
                opacity: 0.85,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {pinterestStatusMessage}
            </span>
            <NeonButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void openFlowSelectReleases()}
              style={{ minWidth: 78, fontSize: 11, padding: '5px 10px' }}
            >
              {t("desktop:settings.downloaders.pinterest.releasesButton")}
            </NeonButton>
          </div>
        </>
      ),
    },
    {
      id: "runtime",
      title: "runtime",
      body: (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: colors.textPrimary }}>
              {t("desktop:settings.downloaders.runtime.phaseLabel", { phase: runtimeGatePhaseLabel })}
            </span>
            {(runtimeGatePhase === "awaiting_confirmation"
              || runtimeGatePhase === "blocked_by_user"
              || runtimeGatePhase === "failed") ? (
              <span style={runtimeStatusDotStyle} />
            ) : null}
          </div>
          <span
            style={{
              fontSize: 11,
              color: runtimeGateIsBusy ? colors.warningText : colors.textSecondary,
              opacity: 0.94,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {runtimeDescriptionText}
          </span>
          {runtimeGateIsBusy ? (
            <div
              style={{
                width: "100%",
                height: 5,
                borderRadius: 999,
                overflow: "hidden",
                background: `linear-gradient(90deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                boxShadow: `inset 0 0 0 1px ${colors.warningBorder}`,
              }}
            >
              <div
                style={{
                  width: runtimeDependencyGateState?.progressPercent != null
                    ? `${Math.max(8, Math.min(100, runtimeDependencyGateState.progressPercent))}%`
                    : "38%",
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${colors.warningSolid} 0%, ${colors.warningText} 100%)`,
                  boxShadow: `0 0 12px ${colors.warningGlow}`,
                  animation: runtimeDependencyGateState?.progressPercent == null
                    ? "shimmer 1.2s ease-in-out infinite"
                    : "none",
                  transition: runtimeDependencyGateState?.progressPercent == null
                    ? "none"
                    : "width 0.22s ease",
                }}
              />
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 10,
                color: runtimeGateColor,
                opacity: 0.85,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={runtimeDetailText}
            >
              {runtimeDetailText}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <NeonButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRuntimeDependencyRecheck()}
                style={{ minWidth: 62, fontSize: 11, padding: "5px 8px" }}
              >
                {t("desktop:settings.downloaders.runtime.recheckButton")}
              </NeonButton>
            </div>
          </div>
        </>
      ),
    },
  ];

  const renderRenamePresetField = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={nestedLabelStyle}>
        {t("desktop:settings.rename.preset")}
      </label>
      <NeonDropdownField
        options={renameRulePresetOptions}
        value={renameRulePreset}
        onChange={handleRenameRulePresetChange}
      />
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
        <h2 style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary, margin: 0 }}>
          {t("desktop:settings.title")}
        </h2>
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
        <NeonSection title={t("desktop:settings.theme.title")}>
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
              {t("desktop:settings.theme.black")}
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
              {t("desktop:settings.theme.white")}
            </button>
          </div>
        </NeonSection>

        <NeonSection
          title={t("desktop:settings.language.title")}
          hint={t("desktop:settings.language.hint")}
        >
          <NeonDropdownField
            options={languageOptions}
            value={currentLanguage}
            onChange={handleLanguageChange}
          />
        </NeonSection>

        {/* Output Path */}
        <NeonSection title={t("desktop:settings.outputFolder.title")}>
          <NeonFieldButton
            onClick={selectOutputPath}
            leadingIcon={<FolderOpen size={14} />}
          >
            {outputPath ? truncatePath(outputPath) : t("desktop:settings.outputFolder.choose")}
          </NeonFieldButton>
        </NeonSection>

        {/* Shortcut */}
        <NeonSection
          title={t("desktop:settings.shortcut.title")}
          hint={t("desktop:settings.shortcut.hint")}
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
                <span>
                  {formatShortcutForDisplay(recordedKeys, isMacOS) || t("desktop:settings.shortcut.press")}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, boxSizing: 'border-box' }}>
                <NeonButton
                  variant="default"
                  size="sm"
                  onClick={confirmShortcut}
                  disabled={!recordedKeys}
                  className="flex-1"
                >
                  {t("desktop:settings.shortcut.confirm")}
                </NeonButton>
                <NeonButton
                  variant="ghost"
                  size="sm"
                  onClick={cancelRecording}
                  className="flex-1"
                >
                  {t("desktop:settings.shortcut.cancel")}
                </NeonButton>
              </div>
            </div>
          ) : (
            <NeonFieldButton
              onClick={startRecording}
              leadingIcon={<Keyboard size={14} />}
            >
              {formatShortcutForDisplay(shortcut, isMacOS) || t("desktop:settings.shortcut.clickToRecord")}
            </NeonFieldButton>
          )}
        </NeonSection>

        {/* Launch at startup */}
        <NeonSection title={t("desktop:settings.launchAtStartup.title")}>
          <NeonToggle checked={autostart} onChange={toggleAutostart} />
        </NeonSection>

        {/* Media Rename */}
        <NeonSection
          title={t("desktop:settings.rename.title")}
          hint={t("desktop:settings.rename.hint")}
        >
          <NeonToggle checked={renameMediaOnDownload} onChange={toggleRenameMediaOnDownload} />
          {renameMediaOnDownload && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {renameRulePreset === "prefix_number" ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={nestedLabelStyle}>
                      {t("desktop:settings.rename.prefix")}
                    </label>
                    <input
                      type="text"
                      value={renamePrefix}
                      onChange={(e) => void handleRenamePrefixChange(e.target.value)}
                      placeholder={t("desktop:settings.rename.prefixPlaceholder")}
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
                  {t("desktop:settings.rename.suffix")}
                </label>
                <input
                  type="text"
                  value={renameSuffix}
                  onChange={(e) => void handleRenameSuffixChange(e.target.value)}
                  placeholder={t("desktop:settings.rename.suffixPlaceholder")}
                  style={compactFieldStyle}
                />
              </div>

              <div style={{ padding: '2px 0' }}>
                <NeonHint style={{ marginBottom: 4 }}>{t("desktop:settings.rename.preview")}</NeonHint>
                <div style={{ fontSize: 12, color: colors.textSecondary, opacity: 0.82, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {renamePreview}
                </div>
              </div>
            </div>
          )}
        </NeonSection>

        {/* AE Portal */}
        <NeonSection
          title={t("desktop:settings.aePortal.title")}
          hint={t("desktop:settings.aePortal.hint")}
        >
          <NeonToggle checked={aePortalEnabled} onChange={toggleAePortal} />
          {aePortalEnabled && (
            <NeonFieldButton
              onClick={selectAeExePath}
              leadingIcon={<FolderOpen size={14} />}
              style={{ marginTop: 8 }}
            >
              {aeExePath ? truncatePath(aeExePath) : t("desktop:settings.aePortal.chooseExe")}
            </NeonFieldButton>
          )}
        </NeonSection>

        <NeonSection title={t("desktop:settings.downloaders.title")}>
          <DownloaderDeck cards={downloaderCards} />
        </NeonSection>

      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
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
        <div style={{
          fontSize: 10,
          color: colors.textSecondary,
          opacity: 0.65,
          minHeight: versionTapHint ? 12 : 0,
          marginTop: versionTapHint ? 2 : 0,
          lineHeight: 1.2,
        }}>
          {versionTapHint}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
