import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon, FolderOpenIcon, KeyboardIcon } from "../components/icons/AppIcons";
import { NeonButton } from "../components/ui/neon-button";
import {
  NeonCard,
  NeonDropdownField,
  NeonFieldButton,
  NeonHint,
  NeonIconButton,
  NeonInput,
  NeonSection,
  NeonToggle,
  type NeonDropdownOption,
} from "../components/ui";
import { useTheme } from "../contexts/ThemeContext";
import {
  desktopCommands,
  desktopCurrentWindow,
  desktopEvents,
  desktopSystem,
  desktopUpdater,
  desktopWindows,
} from "../desktop/runtime";
import {
  COMPACT_EASE,
  getContinuousCornerStyle,
  getFieldSurfaceStyle,
  getCompactLabelStyle,
  getNoticeStyle,
  WINDOW_NO_DRAG_REGION_STYLE,
  getWindowBodyStyle,
  getWindowHeaderStyle,
  getSelectableOptionStyle,
  getStatusDotStyle,
  getWindowShellStyle,
} from "../components/ui/shared-styles";
import { saveOutputPath } from "../utils/outputPath";
import { APP_VERSION } from "../constants/appVersion";
import { DownloaderDeck } from "./settings/DownloaderDeck";
import { DownloaderCardContent } from "./settings/DownloaderCardContent";
import type { GalleryDlInfo } from "../types/galleryDl";
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
  APP_UPDATE_PRERELEASE_CONFIG_KEY,
  parseDesktopAppConfig,
  resolveReceivePrereleaseUpdates,
} from "../updates/appUpdatePreferences";
import {
  getMissingRuntimeComponentsFromStatus,
  getRuntimeGateHeadline,
  getRuntimeGateNextLabel,
  getRuntimeGateProgressLabel,
  runtimeGateIsActive,
  runtimeGateNeedsManualAction,
  summarizeRuntimeGateError,
} from "../utils/runtimeDependencyGate";
import type { AppUpdateInfo, AppUpdatePhase } from "../types/appUpdate";

type RenameRulePreset = "desc_number" | "asc_number" | "prefix_number";
type SettingsTab = "general" | "downloads" | "plugins" | "advanced";

const DEFAULT_RENAME_RULE_PRESET: RenameRulePreset = "desc_number";
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;
const VERSION_TAP_HINT_DURATION_MS = 2200;
const COMPACT_THEME_BUTTON_HEIGHT = 34;
const COMPACT_THEME_BUTTON_PADDING = "6px 10px";
const COMPACT_SHORTCUT_ACTION_HEIGHT = 32;
const COMPACT_SHORTCUT_ACTION_MIN_WIDTH = 74;
const COMPACT_SHORTCUT_ACTION_PADDING = "6px 12px";
const UI_LAB_WINDOW_WIDTH = 420;
const UI_LAB_WINDOW_HEIGHT = 560;
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

const summarizeAppUpdateError = (error: unknown): string | null => {
  const errorString = String(error ?? "").trim();
  if (!errorString) {
    return null;
  }

  const firstLine = errorString
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
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

const getLeafName = (filePath: string): string => {
  const normalized = filePath.trim().replace(/[\\/]+$/, "");
  if (!normalized) {
    return "";
  }

  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
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
  const isDevBuild = import.meta.env.DEV;
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
  const [extensionInjectionDebugEnabled, setExtensionInjectionDebugEnabled] = useState(false);
  const [receivePrereleaseUpdates, setReceivePrereleaseUpdates] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [hoveredSettingsTab, setHoveredSettingsTab] = useState<SettingsTab | null>(null);
  const [supportLogHint, setSupportLogHint] = useState("");
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [appUpdatePhase, setAppUpdatePhase] = useState<AppUpdatePhase>("idle");
  const [appUpdateError, setAppUpdateError] = useState<string | null>(null);
  const [hasCheckedForAppUpdate, setHasCheckedForAppUpdate] = useState(false);
  const [ytdlpInfo, setYtdlpInfo] = useState<YtdlpVersionInfo | null>(null);
  const [galleryDlInfo, setGalleryDlInfo] = useState<GalleryDlInfo | null>(null);
  const [runtimeDependencyStatus, setRuntimeDependencyStatus] =
    useState<RuntimeDependencyStatusSnapshot | null>(null);
  const [runtimeDependencyGateState, setRuntimeDependencyGateState] =
    useState<RuntimeDependencyGateStatePayload | null>(null);
  const [isUpdatingYtdlp, setIsUpdatingYtdlp] = useState(false);
  const [isUpdatingGalleryDl, setIsUpdatingGalleryDl] = useState(false);
  const [ytdlpHint, setYtdlpHint] = useState("");
  const [galleryDlHint, setGalleryDlHint] = useState("");
  const [runtimeHint, setRuntimeHint] = useState("");
  const [hoveredThemeOption, setHoveredThemeOption] = useState<"black" | "white" | null>(null);
  const [hoveredShortcutAction, setHoveredShortcutAction] = useState<"confirm" | "cancel" | null>(null);
  const supportLogHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytdlpHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const galleryDlHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const showGalleryDlHint = useCallback((message: string) => {
    setGalleryDlHint(message);
    if (galleryDlHintTimerRef.current) {
      clearTimeout(galleryDlHintTimerRef.current);
    }
    galleryDlHintTimerRef.current = setTimeout(() => {
      setGalleryDlHint("");
      galleryDlHintTimerRef.current = null;
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
      const status = await desktopCommands.invoke<RuntimeDependencyStatusSnapshot>("get_runtime_dependency_status");
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
      const versionInfo = await desktopCommands.invoke<YtdlpVersionInfo>("check_ytdlp_version");
      setYtdlpInfo(versionInfo);
      return versionInfo;
    } catch (err) {
      console.error("Failed to check yt-dlp version:", err);
      setYtdlpInfo(null);
      return null;
    }
  }, [refreshRuntimeDependencyStatus]);

  const refreshGalleryDlInfo = useCallback(async () => {
    try {
      const info = await desktopCommands.invoke<GalleryDlInfo>("get_gallery_dl_info");
      setGalleryDlInfo(info);
    } catch (err) {
      console.error("Failed to load gallery-dl info:", err);
      setGalleryDlInfo(null);
    }
  }, []);

  const refreshRuntimeDependencyGateState = useCallback(async () => {
    try {
      const state = await desktopCommands.invoke<RuntimeDependencyGateStatePayload>("refresh_runtime_dependency_gate_state");
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
    const hasCurrentVersion = ytdlpInfo.current !== "missing" && ytdlpInfo.current !== "unknown";

    if (ytdlpInfo.updateAvailable === true && ytdlpInfo.latest) {
      return {
        color: colors.dangerText,
        message: t("desktop:settings.downloaders.ytdlp.updateAvailable", {
          version: ytdlpInfo.latest,
        }),
      };
    }

    if (ytdlpInfo.latest && hasCurrentVersion) {
      return {
        color: colors.textSecondary,
        message: t("desktop:settings.downloaders.ytdlp.upToDate"),
      };
    }

    if (!hasCurrentVersion) {
      return {
        color: colors.textSecondary,
        message: t("desktop:settings.downloaders.ytdlp.checkUnavailable"),
      };
    }

    return {
      color: colors.textSecondary,
      message: t("desktop:settings.downloaders.ytdlp.localVersionOnly"),
    };
  })();
  const galleryDlCurrentVersion = galleryDlInfo?.current ?? t("desktop:settings.downloaders.unknown");
  const galleryDlStatus = (() => {
    if (!galleryDlInfo) {
      return {
        color: colors.textSecondary,
        message: t("desktop:settings.downloaders.galleryDl.checkUnavailable"),
      };
    }
    const hasCurrentVersion = galleryDlInfo.current !== "missing" && galleryDlInfo.current !== "unknown";

    if (galleryDlInfo.updateAvailable === true && galleryDlInfo.latest) {
      return {
        color: colors.dangerText,
        message: t("desktop:settings.downloaders.galleryDl.updateAvailable", {
          version: galleryDlInfo.latest,
        }),
      };
    }

    if (galleryDlInfo.latest && hasCurrentVersion) {
      return {
        color: colors.textSecondary,
        message: t("desktop:settings.downloaders.galleryDl.upToDate"),
      };
    }

    if (!hasCurrentVersion) {
      return {
        color: colors.textSecondary,
        message: t("desktop:settings.downloaders.galleryDl.checkUnavailable"),
      };
    }

    return {
      color: colors.textSecondary,
      message: t("desktop:settings.downloaders.galleryDl.localVersionOnly"),
    };
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
  const runtimeMissingComponents = runtimeDependencyGateState?.missingComponents.length
    ? runtimeDependencyGateState.missingComponents
    : getMissingRuntimeComponentsFromStatus(runtimeDependencyStatus);
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
        const configStr = await desktopCommands.invoke<string>("get_config");
        const config = parseDesktopAppConfig(configStr);
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
        if (typeof config.extensionInjectionDebugEnabled === "boolean") {
          setExtensionInjectionDebugEnabled(config.extensionInjectionDebugEnabled);
        }
        setReceivePrereleaseUpdates(resolveReceivePrereleaseUpdates(config));
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };

    const loadAutostart = async () => {
      try {
        const enabled = await desktopCommands.invoke<boolean>("get_autostart");
        setAutostart(enabled);
      } catch (err) {
        console.error("Failed to get autostart status:", err);
      }
    };

    loadConfig();
    loadAutostart();
    void refreshYtdlpVersion();
    void refreshGalleryDlInfo();
    void refreshRuntimeDependencyStatus();
    void refreshRuntimeDependencyGateState();

    const loadShortcut = async () => {
      try {
        const current = await desktopCommands.invoke<string>("get_current_shortcut");
        setShortcut(current);
      } catch (err) {
        console.error("Failed to load shortcut:", err);
      }
    };
    loadShortcut();
  }, [
    refreshGalleryDlInfo,
    refreshRuntimeDependencyGateState,
    refreshRuntimeDependencyStatus,
    refreshYtdlpVersion,
  ]);

  useEffect(() => {
    if (!isDevBuild) {
      return;
    }

    let cancelled = false;
    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    const preloadUiLabPage = () => {
      if (cancelled) {
        return;
      }

      void import("./UiLabPage").catch((err) => {
        if (!cancelled) {
          console.error("Failed to preload UI Lab page:", err);
        }
      });
    };

    if (typeof window.requestAnimationFrame === "function") {
      firstFrameId = window.requestAnimationFrame(() => {
        firstFrameId = null;
        secondFrameId = window.requestAnimationFrame(() => {
          secondFrameId = null;
          preloadUiLabPage();
        });
      });
    } else {
      preloadUiLabPage();
    }

    return () => {
      cancelled = true;
      if (firstFrameId !== null) {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [isDevBuild]);

  useEffect(() => {
    const unlisten = desktopEvents.on<{ path: string }>("output-path-changed", (event) => {
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
      if (supportLogHintTimerRef.current) {
        clearTimeout(supportLogHintTimerRef.current);
        supportLogHintTimerRef.current = null;
      }
      if (ytdlpHintTimerRef.current) {
        clearTimeout(ytdlpHintTimerRef.current);
        ytdlpHintTimerRef.current = null;
      }
      if (galleryDlHintTimerRef.current) {
        clearTimeout(galleryDlHintTimerRef.current);
        galleryDlHintTimerRef.current = null;
      }
      if (runtimeHintTimerRef.current) {
        clearTimeout(runtimeHintTimerRef.current);
        runtimeHintTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const unlisten = desktopEvents.on<{ source: "main" | "settings" }>("ytdlp-version-refresh", (event) => {
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
    const unlisten = desktopEvents.on<RuntimeDependencyGateStatePayload>(
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
      await desktopCommands.invoke("register_shortcut", { shortcut: recordedKeys });
      // 保存到配置
      const configStr = await desktopCommands.invoke<string>("get_config");
      const config = JSON.parse(configStr);
      config.shortcut = recordedKeys;
      await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });

      setShortcut(recordedKeys);
      setIsRecording(false);
      setRecordedKeys("");
    } catch (err) {
      console.error("Failed to register shortcut:", err);
    }
  };

  const selectOutputPath = async () => {
    try {
      const selected = await desktopSystem.openDialog({
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
      const latestVersion = await desktopCommands.invoke<string>("update_ytdlp");
      await desktopEvents.emit("ytdlp-version-refresh", { source: "settings" });
      await refreshYtdlpVersion();
      showYtdlpHint(t("desktop:settings.downloaders.ytdlp.updatedTo", { version: latestVersion }));
    } catch (err) {
      console.error("Failed to update yt-dlp:", err);
      showYtdlpHint(t("desktop:settings.downloaders.ytdlp.updateFailed"));
    } finally {
      setIsUpdatingYtdlp(false);
    }
  };

  const handleGalleryDlUpdate = async () => {
    setIsUpdatingGalleryDl(true);
    try {
      const latestVersion = await desktopCommands.invoke<string>("update_gallery_dl");
      await refreshGalleryDlInfo();
      showGalleryDlHint(t("desktop:settings.downloaders.galleryDl.updatedTo", { version: latestVersion }));
    } catch (err) {
      console.error("Failed to update gallery-dl:", err);
      showGalleryDlHint(t("desktop:settings.downloaders.galleryDl.updateFailed"));
    } finally {
      setIsUpdatingGalleryDl(false);
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
      await desktopCommands.invoke("set_autostart", { enabled: newValue });
      setAutostart(newValue);
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
    }
  };

  const toggleRenameMediaOnDownload = async () => {
    try {
      const newValue = !renameMediaOnDownload;
      setRenameMediaOnDownload(newValue);
      const configStr = await desktopCommands.invoke<string>("get_config");
      const config = parseDesktopAppConfig(configStr);
      config.renameMediaOnDownload = newValue;
      config.videoKeepOriginalName = !newValue;
      await desktopCommands.invoke<void>("save_config", { json: JSON.stringify(config) });
      await desktopEvents.emit("rename-setting-changed", { enabled: newValue });
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
      const configStr = await desktopCommands.invoke<string>("get_config");
      const config = parseDesktopAppConfig(configStr);
      if (updates.renameRulePreset !== undefined) {
        config.renameRulePreset = updates.renameRulePreset;
      }
      if (updates.renamePrefix !== undefined) {
        config.renamePrefix = updates.renamePrefix;
      }
      if (updates.renameSuffix !== undefined) {
        config.renameSuffix = updates.renameSuffix;
      }
      await desktopCommands.invoke<void>("save_config", { json: JSON.stringify(config) });
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

  const showSupportLogHint = (message: string) => {
    setSupportLogHint(message);
    if (supportLogHintTimerRef.current) {
      clearTimeout(supportLogHintTimerRef.current);
    }
    supportLogHintTimerRef.current = setTimeout(() => {
      setSupportLogHint("");
      supportLogHintTimerRef.current = null;
    }, VERSION_TAP_HINT_DURATION_MS);
  };

  const handleSupportLogExport = async () => {
    if (supportLogExportInFlightRef.current) return;
    supportLogExportInFlightRef.current = true;
    try {
      const logPath = await desktopCommands.invoke<string>("export_support_log");
      const logDir = getParentDirectory(logPath);
      const fileName = getLeafName(logPath);
      setSupportLogHint("");

      if (logDir) {
        try {
          await desktopCommands.invoke<void>("open_folder", { path: logDir });
          showSupportLogHint(t("desktop:settings.supportLog.exportedAndOpened", { fileName }));
        } catch (openErr) {
          console.error("Failed to open support log folder:", openErr);
          showSupportLogHint(t("desktop:settings.supportLog.exported", { fileName }));
        }
      } else {
        showSupportLogHint(t("desktop:settings.supportLog.exported", { fileName }));
      }
    } catch (err) {
      showSupportLogHint(t("desktop:settings.supportLog.failed"));
      console.error("Failed to export support log:", err);
    } finally {
      supportLogExportInFlightRef.current = false;
    }
  };

  const toggleReceivePrereleaseUpdates = async () => {
    const previousValue = receivePrereleaseUpdates;
    const nextValue = !previousValue;

    try {
      setReceivePrereleaseUpdates(nextValue);
      const configStr = await desktopCommands.invoke<string>("get_config");
      const config = parseDesktopAppConfig(configStr);
      config[APP_UPDATE_PRERELEASE_CONFIG_KEY] = nextValue;
      await desktopCommands.invoke<void>("save_config", { json: JSON.stringify(config) });
      await desktopEvents.emit("app-update-preference-changed", {
        receivePrereleaseUpdates: nextValue,
      });
    } catch (err) {
      setReceivePrereleaseUpdates(previousValue);
      console.error("Failed to toggle prerelease app updates:", err);
    }
  };

  const handleAppUpdateCheck = useCallback(async () => {
    if (appUpdatePhase === "checking" || appUpdatePhase === "downloading" || appUpdatePhase === "installing") {
      return;
    }

    setHasCheckedForAppUpdate(true);
    setAppUpdateError(null);
    setAppUpdatePhase("checking");

    try {
      const nextUpdate = await desktopUpdater.check();
      setAppUpdateInfo(nextUpdate);
      setAppUpdatePhase(nextUpdate ? "available" : "idle");
    } catch (err) {
      console.error("Failed to check app update:", err);
      setAppUpdateInfo(null);
      setAppUpdateError(summarizeAppUpdateError(err));
      setAppUpdatePhase("error");
    }
  }, [appUpdatePhase]);

  const handleAppUpdateInstall = useCallback(async () => {
    if (!appUpdateInfo || appUpdatePhase === "downloading" || appUpdatePhase === "installing") {
      return;
    }

    setAppUpdateError(null);
    setAppUpdatePhase("downloading");

    try {
      await desktopUpdater.downloadAndInstall();
      setAppUpdatePhase("installing");
      await desktopSystem.relaunch();
    } catch (err) {
      console.error("Failed to install app update:", err);
      setAppUpdateError(summarizeAppUpdateError(err));
      setAppUpdatePhase("error");
    }
  }, [appUpdateInfo, appUpdatePhase]);

  const toggleAePortal = async () => {
    const newValue = !aePortalEnabled;
    setAePortalEnabled(newValue);
    const configStr = await desktopCommands.invoke<string>("get_config");
    const config = parseDesktopAppConfig(configStr);
    config.aePortalEnabled = newValue;
    await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
  };

  const toggleExtensionInjectionDebug = async () => {
    const previousValue = extensionInjectionDebugEnabled;
    const newValue = !previousValue;
    try {
      setExtensionInjectionDebugEnabled(newValue);
      const configStr = await desktopCommands.invoke<string>("get_config");
      const config = parseDesktopAppConfig(configStr);
      config.extensionInjectionDebugEnabled = newValue;
      await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
    } catch (err) {
      setExtensionInjectionDebugEnabled(previousValue);
      console.error("Failed to toggle extension injection debug mode:", err);
    }
  };

  const selectAeExePath = async () => {
    const selected = await desktopSystem.openDialog({
      filters: [{ name: t("desktop:settings.aePortal.executableFilter"), extensions: ["exe"] }],
      title: t("desktop:settings.aePortal.dialogTitle"),
    });
    if (selected) {
      setAeExePath(selected as string);
      const configStr = await desktopCommands.invoke<string>("get_config");
      const config = parseDesktopAppConfig(configStr);
      config.aeExePath = selected;
      await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
    }
  };

  const truncatePath = (path: string, maxLen = 25) => {
    if (path.length <= maxLen) return path;
    return "..." + path.slice(-maxLen);
  };

  const closeWindow = () => {
    void desktopCurrentWindow.close().catch((err) => {
      console.error("Failed to close settings window:", err);
    });
  };

  const openUiLab = async () => {
    if (!isDevBuild) {
      return;
    }

    if (await desktopWindows.has("ui-lab")) {
      await desktopWindows.focus("ui-lab");
      return;
    }

    await desktopWindows.openUiLab({
      title: t("desktop:settings.uiLab.windowTitle"),
      width: UI_LAB_WINDOW_WIDTH,
      height: UI_LAB_WINDOW_HEIGHT,
      alwaysOnTop: true,
    });
  };

  const renamePreview = buildRenamePreview(renameRulePreset, renamePrefix, renameSuffix);
  const settingsShellRadius = 16;
  const panelStyle: CSSProperties = getWindowShellStyle(colors, theme, {
    radius: settingsShellRadius,
    includeLightBottomInset: true,
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
  const statusDotStyle: CSSProperties = getStatusDotStyle(colors.dangerSolid, colors.dangerGlow);
  const runtimeStatusDotStyle: CSSProperties = getStatusDotStyle(colors.warningSolid, colors.warningGlow);
  const getShortcutActionStyle = (
    action: "confirm" | "cancel",
    enabled = true,
  ): CSSProperties => ({
    flex: "1 1 0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    userSelect: "none",
    ...getSelectableOptionStyle(
      colors,
      action === "confirm" && enabled,
      hoveredShortcutAction === action && enabled,
    ),
    minWidth: COMPACT_SHORTCUT_ACTION_MIN_WIDTH,
    minHeight: COMPACT_SHORTCUT_ACTION_HEIGHT,
    padding: COMPACT_SHORTCUT_ACTION_PADDING,
    fontSize: 11,
    lineHeight: 1,
    opacity: enabled ? 1 : 0.5,
    cursor: enabled ? "pointer" : "not-allowed",
  });
  const downloaderCards = [
    {
      id: "ytdlp",
      title: "yt-dlp",
      body: (
        <DownloaderCardContent
          versionLabel={t("desktop:settings.downloaders.ytdlp.version", { version: ytdlpCurrentVersion })}
          description={ytdlpHint || t("desktop:settings.downloaders.ytdlp.description")}
          descriptionTone={ytdlpHint ? "accent" : "default"}
          statusText={ytdlpStatus.message}
          statusColor={ytdlpStatus.color}
          indicator={ytdlpInfo?.updateAvailable ? <span style={statusDotStyle} /> : undefined}
          action={(
            <NeonButton
              type="button"
              variant={isUpdatingYtdlp ? "outline" : "ghost"}
              size="sm"
              onClick={handleYtdlpUpdate}
              disabled={isUpdatingYtdlp}
              style={{
                minWidth: 78,
                minHeight: 28,
                fontSize: 10.5,
                gap: 6,
                padding: "4px 10px",
                cursor: isUpdatingYtdlp ? "wait" : "pointer",
              }}
            >
              {isUpdatingYtdlp ? (
                <span style={spinnerStyle} />
              ) : null}
              {isUpdatingYtdlp
                ? t("desktop:settings.downloaders.ytdlp.updating")
                : t("desktop:settings.downloaders.ytdlp.button")}
            </NeonButton>
          )}
        />
      ),
    },
    {
      id: "runtime",
      title: "runtime",
      body: (
        <DownloaderCardContent
          versionLabel={t("desktop:settings.downloaders.runtime.phaseLabel", { phase: runtimeGatePhaseLabel })}
          description={runtimeDescriptionText}
          descriptionTone={runtimeGateIsBusy ? "warning" : "default"}
          statusText={runtimeDetailText}
          statusColor={runtimeGateColor}
          indicator={(
            runtimeGatePhase === "awaiting_confirmation"
            || runtimeGatePhase === "blocked_by_user"
            || runtimeGatePhase === "failed"
          ) ? <span style={runtimeStatusDotStyle} /> : undefined}
          progressContent={runtimeGateIsBusy ? (
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
          ) : undefined}
          action={(
            <NeonButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRuntimeDependencyRecheck()}
              style={{ minWidth: 62, minHeight: 28, fontSize: 10.5, padding: "4px 8px" }}
            >
              {t("desktop:settings.downloaders.runtime.recheckButton")}
            </NeonButton>
          )}
        />
      ),
    },
    {
      id: "gallery-dl",
      title: "gallery-dl",
      body: (
        <DownloaderCardContent
          versionLabel={t("desktop:settings.downloaders.galleryDl.version", { version: galleryDlCurrentVersion })}
          description={galleryDlHint || t("desktop:settings.downloaders.galleryDl.description")}
          descriptionTone={galleryDlHint ? "accent" : "default"}
          statusText={galleryDlStatus.message}
          statusColor={galleryDlStatus.color}
          indicator={galleryDlInfo?.updateAvailable ? <span style={statusDotStyle} /> : undefined}
          action={(
            <NeonButton
              type="button"
              variant={isUpdatingGalleryDl ? "outline" : "ghost"}
              size="sm"
              onClick={handleGalleryDlUpdate}
              disabled={isUpdatingGalleryDl}
              style={{
                minWidth: 78,
                minHeight: 28,
                fontSize: 10.5,
                gap: 6,
                padding: "4px 10px",
                cursor: isUpdatingGalleryDl ? "wait" : "pointer",
              }}
            >
              {isUpdatingGalleryDl ? (
                <span style={spinnerStyle} />
              ) : null}
              {isUpdatingGalleryDl
                ? t("desktop:settings.downloaders.galleryDl.updating")
                : t("desktop:settings.downloaders.galleryDl.button")}
            </NeonButton>
          )}
        />
      ),
    },
  ];

  const renderRenamePresetField = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={getCompactLabelStyle(colors)}>
        {t("desktop:settings.rename.preset")}
      </label>
      <NeonDropdownField
        options={renameRulePresetOptions}
        value={renameRulePreset}
        onChange={handleRenameRulePresetChange}
      />
    </div>
  );

  const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: t("desktop:settings.tabs.general") },
    { id: "downloads", label: t("desktop:settings.tabs.downloads") },
    { id: "plugins", label: t("desktop:settings.tabs.plugins") },
    { id: "advanced", label: t("desktop:settings.tabs.advanced") },
  ];

  const getPluginStatusPillStyle = (
    tone: "active" | "muted",
  ): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 20,
    padding: "0 8px",
    ...getContinuousCornerStyle(999),
    border: `1px solid ${tone === "active" ? colors.accentBorder : colors.fieldBorder}`,
    background: tone === "active"
      ? `linear-gradient(180deg, ${colors.accentSurfaceStrong} 0%, ${colors.accentSurface} 100%)`
      : `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgSecondary} 100%)`,
    color: tone === "active" ? colors.textPrimary : colors.textSecondary,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.04em",
    lineHeight: 1,
    whiteSpace: "nowrap",
  });

  const settingsTabChromeStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "0 10px",
    borderBottom: `1px solid ${colors.borderStart}`,
    ...WINDOW_NO_DRAG_REGION_STYLE,
  };

  const getSettingsTabStyle = (tab: SettingsTab): CSSProperties => ({
    flex: "1 1 0",
    minWidth: 0,
    minHeight: 38,
    padding: "11px 4px 12px",
    fontSize: 11,
    lineHeight: 1,
    fontWeight: activeTab === tab ? 600 : 500,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    borderBottom: `1.5px solid ${activeTab === tab ? colors.accentBorder : "transparent"}`,
    marginBottom: -1,
    textAlign: "center",
    transition: [
      `color 0.18s ${COMPACT_EASE}`,
      `border-color 0.18s ${COMPACT_EASE}`,
      `opacity 0.18s ${COMPACT_EASE}`,
    ].join(", "),
    color: activeTab === tab
      ? colors.textPrimary
      : hoveredSettingsTab === tab
        ? colors.textPrimary
        : colors.textSecondary,
    opacity: activeTab === tab ? 1 : 0.86,
  });

  const appVersionStatusText = (() => {
    if (appUpdateError) {
      return appUpdateError;
    }
    if (appUpdatePhase === "checking") {
      return t("desktop:settings.versionCard.status.checking");
    }
    if (appUpdatePhase === "downloading") {
      return t("desktop:settings.versionCard.status.downloading");
    }
    if (appUpdatePhase === "installing") {
      return t("desktop:settings.versionCard.status.installing");
    }
    if (appUpdateInfo) {
      return t("desktop:settings.versionCard.status.available", { version: appUpdateInfo.latest });
    }
    if (hasCheckedForAppUpdate) {
      return t("desktop:settings.versionCard.status.upToDate");
    }
    return t("desktop:settings.versionCard.status.idle");
  })();

  const appVersionStatusColor = appUpdateError
    ? colors.dangerText
    : appUpdateInfo
      ? colors.warningText
      : colors.textSecondary;

  const renderGeneralTab = (): ReactNode => (
    <>
      <NeonSection title={t("desktop:settings.theme.title")}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setTheme("black")}
            onMouseEnter={() => setHoveredThemeOption("black")}
            onMouseLeave={() => setHoveredThemeOption((current) => (current === "black" ? null : current))}
            style={{
              flex: 1,
              ...getSelectableOptionStyle(colors, theme === "black", hoveredThemeOption === "black"),
              minHeight: COMPACT_THEME_BUTTON_HEIGHT,
              padding: COMPACT_THEME_BUTTON_PADDING,
              fontSize: 11.5,
              lineHeight: 1,
            }}
          >
            {t("desktop:settings.theme.black")}
          </button>
          <button
            type="button"
            onClick={() => setTheme("white")}
            onMouseEnter={() => setHoveredThemeOption("white")}
            onMouseLeave={() => setHoveredThemeOption((current) => (current === "white" ? null : current))}
            style={{
              flex: 1,
              ...getSelectableOptionStyle(colors, theme === "white", hoveredThemeOption === "white"),
              minHeight: COMPACT_THEME_BUTTON_HEIGHT,
              padding: COMPACT_THEME_BUTTON_PADDING,
              fontSize: 11.5,
              lineHeight: 1,
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

      <NeonSection
        title={t("desktop:settings.shortcut.title")}
        hint={t("desktop:settings.shortcut.hint")}
      >
        {isRecording ? (
          <div>
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                ...getFieldSurfaceStyle(colors, {
                  active: true,
                  highlighted: true,
                  padding: "10px 12px",
                }),
                textAlign: "left",
                fontSize: 12,
                cursor: "default",
                boxSizing: "border-box",
                color: colors.textPrimary,
              }}
            >
              <KeyboardIcon size={14} style={{ color: colors.accentText, flexShrink: 0 }} />
              <span>
                {formatShortcutForDisplay(recordedKeys, isMacOS) || t("desktop:settings.shortcut.press")}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                boxSizing: "border-box",
              }}
            >
              <button
                type="button"
                onClick={confirmShortcut}
                disabled={!recordedKeys}
                onMouseEnter={() => {
                  if (recordedKeys) {
                    setHoveredShortcutAction("confirm");
                  }
                }}
                onMouseLeave={() => setHoveredShortcutAction((current) => (current === "confirm" ? null : current))}
                style={getShortcutActionStyle("confirm", Boolean(recordedKeys))}
              >
                {t("desktop:settings.shortcut.confirm")}
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                onMouseEnter={() => setHoveredShortcutAction("cancel")}
                onMouseLeave={() => setHoveredShortcutAction((current) => (current === "cancel" ? null : current))}
                style={getShortcutActionStyle("cancel")}
              >
                {t("desktop:settings.shortcut.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <NeonFieldButton
            onClick={startRecording}
            leadingIcon={<KeyboardIcon size={14} />}
          >
            {formatShortcutForDisplay(shortcut, isMacOS) || t("desktop:settings.shortcut.clickToRecord")}
          </NeonFieldButton>
        )}
      </NeonSection>

      <NeonSection title={t("desktop:settings.launchAtStartup.title")}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            ...getFieldSurfaceStyle(colors, {
              padding: "10px 12px",
              height: 0,
            }),
          }}
        >
          <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
              {t("desktop:settings.launchAtStartup.title")}
            </span>
            <span
              style={{
                fontSize: 10.5,
                lineHeight: 1.4,
                color: colors.textSecondary,
                opacity: 0.82,
              }}
            >
              {t("desktop:settings.launchAtStartup.hint")}
            </span>
          </div>
          <NeonToggle checked={autostart} onChange={toggleAutostart} />
        </div>
      </NeonSection>
    </>
  );

  const renderDownloadsTab = (): ReactNode => (
    <>
      <NeonSection title={t("desktop:settings.outputFolder.title")}>
        <NeonFieldButton
          onClick={selectOutputPath}
          leadingIcon={<FolderOpenIcon size={14} />}
        >
          {outputPath ? truncatePath(outputPath) : t("desktop:settings.outputFolder.choose")}
        </NeonFieldButton>
      </NeonSection>

      <NeonSection
        title={t("desktop:settings.rename.title")}
        hint={t("desktop:settings.rename.hint")}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            ...getFieldSurfaceStyle(colors, {
              padding: "10px 12px",
              height: 0,
            }),
          }}
        >
          <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
              {t("desktop:settings.rename.title")}
            </span>
            <span
              style={{
                fontSize: 10.5,
                lineHeight: 1.4,
                color: colors.textSecondary,
                opacity: 0.82,
              }}
            >
              {t("desktop:settings.rename.hint")}
            </span>
          </div>
          <NeonToggle checked={renameMediaOnDownload} onChange={toggleRenameMediaOnDownload} />
        </div>
        {renameMediaOnDownload ? (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {renameRulePreset === "prefix_number" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={getCompactLabelStyle(colors)}>
                    {t("desktop:settings.rename.prefix")}
                  </label>
                  <NeonInput
                    value={renamePrefix}
                    onChange={(event) => void handleRenamePrefixChange(event.target.value)}
                    placeholder={t("desktop:settings.rename.prefixPlaceholder")}
                  />
                </div>
                {renderRenamePresetField()}
              </div>
            ) : (
              renderRenamePresetField()
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={getCompactLabelStyle(colors)}>
                {t("desktop:settings.rename.suffix")}
              </label>
              <NeonInput
                value={renameSuffix}
                onChange={(event) => void handleRenameSuffixChange(event.target.value)}
                placeholder={t("desktop:settings.rename.suffixPlaceholder")}
              />
            </div>

            <div style={{ padding: "2px 0" }}>
              <NeonHint style={{ marginBottom: 4 }}>{t("desktop:settings.rename.preview")}</NeonHint>
              <div
                style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                  opacity: 0.82,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {renamePreview}
              </div>
            </div>
          </div>
        ) : null}
      </NeonSection>
    </>
  );

  const renderPluginsTab = (): ReactNode => (
    <>
      <div style={{ ...getNoticeStyle(colors), marginBottom: 18 }}>
        {t("desktop:settings.pluginsPage.intro")}
      </div>

      <NeonSection
        title={t("desktop:settings.pluginsPage.installed.title")}
        hint={t("desktop:settings.pluginsPage.installed.hint")}
      >
        <NeonCard
          style={{
            padding: "12px",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
                {t("desktop:settings.aePortal.title")}
              </span>
              <div
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.45,
                  color: colors.textSecondary,
                  opacity: 0.82,
                }}
              >
                {t("desktop:settings.aePortal.hint")}
              </div>
            </div>
            <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
              <span style={getPluginStatusPillStyle(aePortalEnabled ? "active" : "muted")}>
                {aePortalEnabled
                  ? t("desktop:settings.pluginsPage.status.enabled")
                  : t("desktop:settings.pluginsPage.status.available")}
              </span>
              <NeonToggle checked={aePortalEnabled} onChange={toggleAePortal} />
            </div>
          </div>

          {aePortalEnabled ? (
            <NeonFieldButton
              onClick={selectAeExePath}
              leadingIcon={<FolderOpenIcon size={14} />}
            >
              {aeExePath ? truncatePath(aeExePath) : t("desktop:settings.aePortal.chooseExe")}
            </NeonFieldButton>
          ) : null}
        </NeonCard>

        <NeonCard
          style={{
            padding: "12px",
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
                {t("desktop:settings.pluginsPage.future.title")}
              </span>
              <div
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.45,
                  color: colors.textSecondary,
                  opacity: 0.82,
                }}
              >
                {t("desktop:settings.pluginsPage.future.hint")}
              </div>
            </div>
            <span style={getPluginStatusPillStyle("muted")}>
              {t("desktop:settings.pluginsPage.status.comingSoon")}
            </span>
          </div>

          <div
            style={{
              fontSize: 10.5,
              lineHeight: 1.45,
              color: colors.textSecondary,
              opacity: 0.78,
            }}
          >
            {t("desktop:settings.pluginsPage.future.body")}
          </div>
        </NeonCard>
      </NeonSection>
    </>
  );

  const renderAdvancedTab = (): ReactNode => (
    <>
      <NeonSection title={t("desktop:settings.versionCard.title")}>
        <NeonCard
          style={{
            padding: "10px 12px",
            display: "grid",
            gap: 8,
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
              {t("desktop:settings.versionCard.appName")}
            </span>
            <span style={{ fontSize: 10, color: colors.textSecondary }}>
              {t("desktop:settings.versionCard.currentLabel")}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
            {`v${APP_VERSION}`}
          </div>
          <div style={{ fontSize: 10.5, lineHeight: 1.35, color: appVersionStatusColor }}>
            {appVersionStatusText}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <NeonButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleAppUpdateCheck()}
              disabled={appUpdatePhase === "checking" || appUpdatePhase === "downloading" || appUpdatePhase === "installing"}
              style={{ minWidth: 76, padding: "4px 10px", fontSize: 10.5 }}
            >
              {appUpdatePhase === "checking"
                ? t("desktop:settings.versionCard.checkingButton")
                : t("desktop:settings.versionCard.checkButton")}
            </NeonButton>
            <NeonButton
              type="button"
              variant={appUpdateInfo ? "default" : "outline"}
              size="sm"
              onClick={() => void handleAppUpdateInstall()}
              disabled={!appUpdateInfo || appUpdatePhase === "downloading" || appUpdatePhase === "installing"}
              style={{ minWidth: 76, padding: "4px 10px", fontSize: 10.5 }}
            >
              {appUpdatePhase === "downloading" || appUpdatePhase === "installing"
                ? t("desktop:settings.versionCard.updatingButton")
                : t("desktop:settings.versionCard.updateButton")}
            </NeonButton>
          </div>
        </NeonCard>
      </NeonSection>

      <NeonSection
        title={t("desktop:settings.appUpdates.title")}
        hint={t("desktop:settings.appUpdates.hint")}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            ...getFieldSurfaceStyle(colors, {
              padding: "10px 12px",
              height: 0,
            }),
          }}
        >
          <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
              {t("desktop:settings.appUpdates.title")}
            </span>
            <span
              style={{
                fontSize: 10.5,
                lineHeight: 1.4,
                color: colors.textSecondary,
                opacity: 0.82,
              }}
            >
              {t("desktop:settings.appUpdates.hint")}
            </span>
          </div>
          <NeonToggle
            checked={receivePrereleaseUpdates}
            onChange={toggleReceivePrereleaseUpdates}
          />
        </div>
      </NeonSection>

      <NeonSection
        title={t("desktop:settings.supportLog.title")}
        hint={supportLogHint || t("desktop:settings.supportLog.hint")}
      >
        <NeonFieldButton
          onClick={() => void handleSupportLogExport()}
          trailingContent={(
            <span style={{ fontSize: 10.5, color: colors.accentText }}>
              {t("desktop:settings.supportLog.action")}
            </span>
          )}
        >
          {t("desktop:settings.supportLog.button")}
        </NeonFieldButton>
      </NeonSection>

      <NeonSection title={t("desktop:settings.downloaders.title")}>
        <DownloaderDeck cards={downloaderCards} />
      </NeonSection>

      {isDevBuild ? (
        <NeonSection
          title={t("desktop:settings.uiLab.developerSectionTitle")}
          hint={t("desktop:settings.uiLab.developerSectionHint")}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  lineHeight: 1.2,
                  color: colors.textSecondary,
                }}
              >
                {t("desktop:settings.uiLab.injectionDebug.title")}
              </span>
              <NeonToggle
                checked={extensionInjectionDebugEnabled}
                onChange={toggleExtensionInjectionDebug}
              />
            </div>

            <NeonButton onClick={() => void openUiLab()}>
              {t("desktop:settings.uiLab.developerButton")}
            </NeonButton>
          </div>
        </NeonSection>
      ) : null}
    </>
  );

  const renderActiveTab = (): ReactNode => {
    switch (activeTab) {
      case "general":
        return renderGeneralTab();
      case "downloads":
        return renderDownloadsTab();
      case "plugins":
        return renderPluginsTab();
      case "advanced":
        return renderAdvancedTab();
      default:
        return null;
    }
  };

  return (
    <div style={panelStyle}>
      {/* Draggable Header */}
      <div
        style={getWindowHeaderStyle(colors, {
          dragRegion: true,
        })}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
          {t("desktop:settings.title")}
        </h2>
        <NeonIconButton
          onClick={closeWindow}
          tone="danger"
          size={20}
          style={{
            ...WINDOW_NO_DRAG_REGION_STYLE,
            marginRight: -2,
          }}
        >
          <CloseIcon size={16} />
        </NeonIconButton>
      </div>

      <div style={settingsTabChromeStyle} role="tablist" aria-label={t("desktop:settings.title")}>
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              id={`settings-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              onMouseEnter={() => setHoveredSettingsTab(tab.id)}
              onMouseLeave={() => setHoveredSettingsTab((current) => (current === tab.id ? null : current))}
              style={getSettingsTabStyle(tab.id)}
            >
              {tab.label}
            </button>
          ))}
      </div>

      <div style={getWindowBodyStyle({ padding: "16px 18px 18px", gap: 0 })} className="hide-scrollbar">
        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          {renderActiveTab()}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
