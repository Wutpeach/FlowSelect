import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FolderOpenIcon,
  KeyboardIcon,
  SearchIcon,
} from "../components/icons/AppIcons";
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
import { getSettingsPageSwitchMotion } from "../components/ui/motion";
import { useTheme } from "../contexts/ThemeContext";
import {
  desktopCommands,
  desktopCurrentWindow,
  desktopEvents,
  desktopSystem,
  desktopUpdater,
} from "../desktop/runtime";
import { saveConfigPatch } from "../desktop/config";
import {
  COMPACT_EASE,
  getContinuousCornerStyle,
  getFieldSurfaceStyle,
  getCompactLabelStyle,
  getShadowBackdropStyle,
  WINDOW_NO_DRAG_REGION_STYLE,
  getWindowBodyStyle,
  getWindowHeaderStyle,
  getSelectableOptionStyle,
  getWindowShellStyle,
} from "../components/ui/shared-styles";
import { saveOutputPath } from "../utils/outputPath";
import { APP_VERSION } from "../constants/appVersion";
import { MACOS_SECONDARY_WINDOW_SHADOW_GUTTER } from "../constants/windowMetrics";
import { changeDesktopLanguage } from "../i18n/desktopLanguage";
import {
  FALLBACK_LANGUAGE,
  SUPPORTED_APP_LANGUAGES,
  type AppLanguage,
} from "../i18n/contract";
import { normalizeAppLanguage } from "../i18n/language";
import {
  normalizeManualNetworkProxyUrl,
  normalizeNetworkProxyMode,
  type NetworkProxyMode,
  type NetworkProxyStatePayload,
} from "../config/networkProxy";
import {
  APP_UPDATE_PRERELEASE_CONFIG_KEY,
  parseDesktopAppConfig,
  resolveReceivePrereleaseUpdates,
} from "../updates/appUpdatePreferences";
import type { AppUpdateInfo, AppUpdatePhase, AppUpdateStatePayload } from "../types/appUpdate";
import { SITE_SESSION_LOGOS } from "../site-session-icons";
import type {
  SiteSessionRegistryEntry,
  SiteSessionState,
  SiteSessionStateChangedPayload,
} from "../types/siteSession";

type RenameRulePreset = "desc_number" | "asc_number" | "prefix_number";
type SettingsPageId = "hub" | "appearance" | "saving" | "sites" | "plugins" | "system";
type SettingsDetailPageId = Exclude<SettingsPageId, "hub">;
type SiteLoginBadgeTone = "ready" | "danger" | "muted";
type SiteSessionAction = "sync" | "clear";
type SettingsNavigationDirection = "forward" | "back";

type SettingsHubDestination = {
  id: SettingsDetailPageId;
  title: string;
  summary: string;
  searchText: string;
  matchSummary: string;
  attentionTone: "accent" | "danger" | "warning" | null;
};

type SiteLoginBadgeModel = {
  id: string;
  icon: ReactNode;
  label: string;
  statusLabel: string;
  detailLabel: string | null;
  tone: SiteLoginBadgeTone;
  disabled: boolean;
  canSync: boolean;
  canClear: boolean;
  onClick: () => void;
};

const DEFAULT_RENAME_RULE_PRESET: RenameRulePreset = "desc_number";
const SETTINGS_PAGE_IDS = new Set<SettingsPageId>([
  "hub",
  "appearance",
  "saving",
  "sites",
  "plugins",
  "system",
]);
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;
const VERSION_TAP_HINT_DURATION_MS = 2200;
const COMPACT_THEME_BUTTON_HEIGHT = 34;
const COMPACT_THEME_BUTTON_PADDING = "6px 10px";
const COMPACT_SHORTCUT_ACTION_HEIGHT = 32;
const COMPACT_SHORTCUT_ACTION_MIN_WIDTH = 74;
const COMPACT_SHORTCUT_ACTION_PADDING = "6px 12px";
const SETTINGS_HUB_SEARCH_HEIGHT = 34;
const SETTINGS_HUB_DESTINATION_MIN_HEIGHT = 54;
const SETTINGS_HUB_SEARCH_TO_LIST_GAP = 14;
const SETTINGS_HUB_DESTINATION_GAP = 9;
const NETWORK_PROXY_SAVE_DEBOUNCE_MS = 650;
const formatSiteSessionSyncSource = (state: SiteSessionState | undefined): string | null => {
  const source = state?.lastSyncSource;
  if (!source) {
    return null;
  }

  const parts = [source.browser, source.profileLabel]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return source.extensionId ? "browser extension" : null;
};

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

const resolveInitialSettingsPage = (): SettingsPageId => {
  if (typeof window === "undefined") {
    return "hub";
  }

  const hashQuery = window.location.hash.includes("?")
    ? `?${window.location.hash.split("?").slice(1).join("?")}`
    : "";
  const page = new URLSearchParams(window.location.search).get("docsPage")
    ?? new URLSearchParams(hashQuery).get("docsPage");
  return page && SETTINGS_PAGE_IDS.has(page as SettingsPageId)
    ? page as SettingsPageId
    : "hub";
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
  const shouldReduceMotion = useReducedMotion();
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
  const [networkProxyMode, setNetworkProxyMode] = useState<NetworkProxyMode>("system");
  const [networkProxyInput, setNetworkProxyInput] = useState("");
  const [networkProxyInputInvalid, setNetworkProxyInputInvalid] = useState(false);
  const [networkProxySavePending, setNetworkProxySavePending] = useState(false);
  const [networkProxyState, setNetworkProxyState] =
    useState<NetworkProxyStatePayload | null>(null);
  const [siteSessionRegistryEntries, setSiteSessionRegistryEntries] =
    useState<SiteSessionRegistryEntry[]>([]);
  const [siteSessionStates, setSiteSessionStates] =
    useState<Partial<Record<string, SiteSessionState>>>({});
  const [siteSessionErrors, setSiteSessionErrors] =
    useState<Partial<Record<string, string | null>>>({});
  const [busySiteSessionAction, setBusySiteSessionAction] =
    useState<{ siteId: string; action: SiteSessionAction } | null>(null);
  const [activePage, setActivePage] = useState<SettingsPageId>(resolveInitialSettingsPage);
  const [settingsNavigationDirection, setSettingsNavigationDirection] =
    useState<SettingsNavigationDirection>("forward");
  const [hoveredHubDestination, setHoveredHubDestination] = useState<SettingsDetailPageId | null>(null);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [supportLogHint, setSupportLogHint] = useState("");
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [appUpdatePhase, setAppUpdatePhase] = useState<AppUpdatePhase>("idle");
  const [appUpdateError, setAppUpdateError] = useState<string | null>(null);
  const [hasCheckedForAppUpdate, setHasCheckedForAppUpdate] = useState(false);
  const [hoveredThemeOption, setHoveredThemeOption] = useState<"black" | "white" | null>(null);
  const [hoveredShortcutAction, setHoveredShortcutAction] = useState<"confirm" | "cancel" | null>(null);
  const [hoveredSavingAction, setHoveredSavingAction] = useState<"outputFolder" | null>(null);
  const supportLogHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkProxySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportLogExportInFlightRef = useRef(false);

  const applyAppUpdateState = useCallback((nextState: AppUpdateStatePayload) => {
    setAppUpdateInfo(nextState.info);
    setAppUpdatePhase(nextState.phase);
    setAppUpdateError(nextState.error);
    if (nextState.checkedAtMs !== null) {
      setHasCheckedForAppUpdate(true);
    }
  }, []);
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
        const parsedProxyMode = normalizeNetworkProxyMode(config.networkProxyMode);
        setNetworkProxyMode(parsedProxyMode);
        if (typeof config.networkProxyUrl === "string") {
          setNetworkProxyInput(config.networkProxyUrl);
          setNetworkProxyInputInvalid(parsedProxyMode === "manual"
            && !normalizeManualNetworkProxyUrl(config.networkProxyUrl));
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

    const loadShortcut = async () => {
      try {
        const current = await desktopCommands.invoke<string>("get_current_shortcut");
        setShortcut(current);
      } catch (err) {
        console.error("Failed to load shortcut:", err);
      }
    };
    loadShortcut();
  }, []);

  useEffect(() => {
    void desktopUpdater.getState()
      .then(applyAppUpdateState)
      .catch((err) => {
        console.error("Failed to load app update state:", err);
      });

    let cleanup: (() => void) | null = null;
    void desktopEvents.on<AppUpdateStatePayload>(
      "app-update-state",
      (event) => {
        applyAppUpdateState(event.payload);
      },
    ).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, [applyAppUpdateState]);

  useEffect(() => {
    void desktopCommands.invoke<NetworkProxyStatePayload>("get_network_proxy_state")
      .then((state) => {
        setNetworkProxyState(state);
      })
      .catch((err) => {
        console.error("Failed to load network proxy state:", err);
      });

    let cleanup: (() => void) | null = null;
    void desktopEvents.on<NetworkProxyStatePayload>(
      "network-proxy-state-changed",
      (event) => {
        setNetworkProxyState(event.payload);
      },
    ).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, []);



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
      if (networkProxySaveTimerRef.current) {
        clearTimeout(networkProxySaveTimerRef.current);
        networkProxySaveTimerRef.current = null;
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
      await saveConfigPatch({ shortcut: recordedKeys });

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
      await saveConfigPatch({
        renameMediaOnDownload: newValue,
        videoKeepOriginalName: !newValue,
      });
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
      await saveConfigPatch(updates);
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
      await saveConfigPatch({ [APP_UPDATE_PRERELEASE_CONFIG_KEY]: nextValue });
      const nextUpdateState = await desktopUpdater.notifyPreferenceChanged();
      applyAppUpdateState(nextUpdateState);
      await desktopEvents.emit("app-update-preference-changed", {
        receivePrereleaseUpdates: nextValue,
      });
    } catch (err) {
      setReceivePrereleaseUpdates(previousValue);
      console.error("Failed to toggle prerelease app updates:", err);
    }
  };

  const clearNetworkProxySaveTimer = () => {
    if (networkProxySaveTimerRef.current) {
      clearTimeout(networkProxySaveTimerRef.current);
      networkProxySaveTimerRef.current = null;
    }
  };

  const selectNetworkProxyMode = async (nextMode: NetworkProxyMode) => {
    if (nextMode === networkProxyMode) {
      return;
    }

    clearNetworkProxySaveTimer();
    const previousMode = networkProxyMode;
    setNetworkProxyMode(nextMode);
    setNetworkProxyInputInvalid(false);
    setNetworkProxySavePending(false);

    try {
      const normalizedProxy = normalizeManualNetworkProxyUrl(networkProxyInput);
      await saveConfigPatch((draft) => {
        draft.networkProxyMode = nextMode;
        if (nextMode === "manual" && normalizedProxy) {
          draft.networkProxyUrl = normalizedProxy;
        }
      });
    } catch (err) {
      setNetworkProxyMode(previousMode);
      console.error("Failed to switch network proxy mode:", err);
    }
  };

  const handleNetworkProxyInputChange = (value: string) => {
    setNetworkProxyInput(value);
    clearNetworkProxySaveTimer();

    if (networkProxyMode !== "manual") {
      setNetworkProxyInputInvalid(false);
      setNetworkProxySavePending(false);
      return;
    }

    const normalizedProxy = normalizeManualNetworkProxyUrl(value);
    if (!normalizedProxy) {
      setNetworkProxyInputInvalid(value.trim().length > 0);
      setNetworkProxySavePending(false);
      return;
    }

    setNetworkProxyInputInvalid(false);
    setNetworkProxySavePending(true);
    networkProxySaveTimerRef.current = setTimeout(() => {
      networkProxySaveTimerRef.current = null;
      void saveConfigPatch({
        networkProxyMode: "manual",
        networkProxyUrl: normalizedProxy,
      }).catch((err) => {
        console.error("Failed to save network proxy URL:", err);
      }).finally(() => {
        setNetworkProxySavePending(false);
      });
    }, NETWORK_PROXY_SAVE_DEBOUNCE_MS);
  };

  const navigateSettingsPage = useCallback((nextPage: SettingsPageId) => {
    setHoveredHubDestination(null);
    setSettingsNavigationDirection(nextPage === "hub" ? "back" : "forward");
    setActivePage(nextPage);
  }, []);

  useEffect(() => {
    const unlisten = desktopEvents.on<{
      page: SettingsPageId;
    }>("settings-page-requested", (event) => {
      if (!SETTINGS_PAGE_IDS.has(event.payload.page)) {
        return;
      }
      navigateSettingsPage(event.payload.page);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [navigateSettingsPage]);

  const setSiteSessionError = useCallback((siteId: string, error: string | null) => {
    setSiteSessionErrors((current) => ({
      ...current,
      [siteId]: error,
    }));
  }, []);

  const loadSiteSessionPanelState = useCallback(async () => {
    let registryEntries: SiteSessionRegistryEntry[] = [];
    try {
      registryEntries = await desktopCommands.invoke<SiteSessionRegistryEntry[]>("get_site_session_registry");
      setSiteSessionRegistryEntries(registryEntries);
    } catch (err) {
      console.error("Failed to load site session registry:", err);
      setSiteSessionRegistryEntries([]);
      return;
    }

    const sessionResults = await Promise.all(
      registryEntries.map(async (site) => {
        try {
          const state = await desktopCommands.invoke<SiteSessionState>(
            "get_site_session_state",
            { siteId: site.siteId },
          );
          return { siteId: site.siteId, state, error: null };
        } catch (err) {
          console.error(`Failed to load ${site.siteId} site session status:`, err);
          return {
            siteId: site.siteId,
            state: null,
            error: summarizeAppUpdateError(err) ?? t("desktop:settings.siteSessions.errors.load"),
          };
        }
      }),
    );

    setSiteSessionStates((current) => {
      const next = { ...current };
      for (const result of sessionResults) {
        if (result.state) {
          next[result.siteId] = result.state;
        }
      }
      return next;
    });
    setSiteSessionErrors((current) => {
      const next = { ...current };
      for (const result of sessionResults) {
        next[result.siteId] = result.error;
      }
      return next;
    });
  }, [t]);

  useEffect(() => {
    void loadSiteSessionPanelState();
  }, [loadSiteSessionPanelState]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    void desktopEvents.on<SiteSessionStateChangedPayload>(
      "site-session-state-changed",
      () => {
        void loadSiteSessionPanelState();
      },
    ).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, [loadSiteSessionPanelState]);

  const isSiteSessionActionBusy = Boolean(busySiteSessionAction);

  const invokeSiteSessionCommand = useCallback(async (
    siteId: string,
    action: SiteSessionAction,
  ) => {
    if (busySiteSessionAction) {
      return;
    }

    const command = action === "sync"
      ? "sync_site_session_from_extension"
      : "clear_site_session";

    setSiteSessionError(siteId, null);
    setBusySiteSessionAction({ siteId, action });
    try {
      const sessionState = await desktopCommands.invoke<SiteSessionState>(command, { siteId });
      setSiteSessionStates((current) => ({
        ...current,
        [siteId]: sessionState,
      }));
      setSiteSessionError(siteId, null);
    } catch (err) {
      console.error(`Failed to ${action} site session capture:`, err);
      setSiteSessionError(
        siteId,
        summarizeAppUpdateError(err) ?? t(`desktop:settings.siteSessions.errors.${action}`),
      );
      await loadSiteSessionPanelState();
    } finally {
      setBusySiteSessionAction(null);
    }
  }, [busySiteSessionAction, loadSiteSessionPanelState, setSiteSessionError, t]);

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
    const previousValue = aePortalEnabled;
    const newValue = !previousValue;
    try {
      setAePortalEnabled(newValue);
      await saveConfigPatch({ aePortalEnabled: newValue });
    } catch (err) {
      setAePortalEnabled(previousValue);
      console.error("Failed to toggle AE Portal:", err);
    }
  };

  const toggleExtensionInjectionDebug = async () => {
    const previousValue = extensionInjectionDebugEnabled;
    const newValue = !previousValue;
    try {
      setExtensionInjectionDebugEnabled(newValue);
      await saveConfigPatch({ extensionInjectionDebugEnabled: newValue });
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
      await saveConfigPatch({ aeExePath: selected });
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

  const renamePreview = buildRenamePreview(renameRulePreset, renamePrefix, renameSuffix);
  const settingsShellRadius = 16;
  const windowShadowGutter = isMacOS ? MACOS_SECONDARY_WINDOW_SHADOW_GUTTER : 0;
  const panelStyle: CSSProperties = getWindowShellStyle(colors, theme, {
    radius: settingsShellRadius,
    elevation: "none",
    includeLightBottomInset: true,
  });
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
  const getSettingsControlRowStyle = ({
    active = false,
    interactive = false,
    highlighted = false,
  }: {
    active?: boolean;
    interactive?: boolean;
    highlighted?: boolean;
  } = {}): CSSProperties => ({
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textAlign: "left",
    color: colors.textPrimary,
    cursor: interactive ? "pointer" : "default",
    ...getFieldSurfaceStyle(colors, {
      active,
      highlighted,
      padding: "10px 12px",
      height: 0,
    }),
  });
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

  const getSiteLoginToneColors = (tone: SiteLoginBadgeTone) => {
    if (tone === "ready") {
      return {
        border: colors.accentBorder,
        surfaceStart: colors.accentSurfaceStrong,
        surfaceEnd: colors.accentSurface,
        dot: colors.accentSolid,
        text: colors.textPrimary,
        glow: colors.accentGlow,
      };
    }
    if (tone === "danger") {
      return {
        border: colors.dangerBorder,
        surfaceStart: colors.dangerSurface,
        surfaceEnd: colors.fieldBg,
        dot: colors.dangerSolid,
        text: colors.textPrimary,
        glow: colors.dangerGlow,
      };
    }
    return {
      border: colors.fieldBorder,
      surfaceStart: colors.fieldBg,
      surfaceEnd: colors.bgSecondary,
      dot: colors.controlMuted,
      text: colors.textSecondary,
      glow: "transparent",
    };
  };

  const getSiteLoginRowStyle = (
    tone: SiteLoginBadgeTone,
    disabled: boolean,
  ): CSSProperties => {
    const toneColors = getSiteLoginToneColors(tone);
    return {
      width: "100%",
      minHeight: 52,
      padding: "8px 10px",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      gap: 10,
      alignItems: "center",
      ...getContinuousCornerStyle(13),
      border: `1px solid ${toneColors.border}`,
      background: `linear-gradient(180deg, ${toneColors.surfaceStart} 0%, ${toneColors.surfaceEnd} 100%)`,
      boxShadow: tone === "muted"
        ? `inset 0 1px 0 ${colors.fieldInset}`
        : `inset 0 1px 0 ${colors.fieldInset}, 0 10px 20px -14px ${toneColors.glow}`,
      color: toneColors.text,
      opacity: disabled ? 0.72 : 1,
      transition: [
        `background 0.18s ${COMPACT_EASE}`,
        `border-color 0.18s ${COMPACT_EASE}`,
        `box-shadow 0.18s ${COMPACT_EASE}`,
        `opacity 0.18s ${COMPACT_EASE}`,
      ].join(", "),
    };
  };

  const getSiteLoginMainButtonStyle = (
    disabled: boolean,
  ): CSSProperties => ({
    minWidth: 0,
    width: "100%",
    padding: 0,
    border: 0,
    background: "transparent",
    color: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "left",
    opacity: disabled ? 0.72 : 1,
  });

  const siteLoginInlineActionStyle: CSSProperties = {
    minWidth: 44,
    height: 26,
    padding: "4px 8px",
    fontSize: 10,
  };

  const getSiteLoginStatusDotStyle = (tone: SiteLoginBadgeTone): CSSProperties => {
    const toneColors = getSiteLoginToneColors(tone);
    return {
      width: 7,
      height: 7,
      flexShrink: 0,
      ...getContinuousCornerStyle(999),
      background: toneColors.dot,
      boxShadow: tone === "muted" ? "none" : `0 0 7px ${toneColors.glow}`,
    };
  };

  const siteSessionError = siteSessionRegistryEntries
    .map((site) => siteSessionErrors[site.siteId])
    .find((error): error is string => Boolean(error));
  const siteLoginBadges: SiteLoginBadgeModel[] = siteSessionRegistryEntries.map((site) => {
    const state = siteSessionStates[site.siteId];
    const error = siteSessionErrors[site.siteId];
    const availability = state?.availability ?? "missing";
    const Logo = SITE_SESSION_LOGOS[site.icon.key ?? site.siteId];
    const statusKey = error ? "expired" : availability === "ready" ? "ready" : "missing";
    const statusLabel = t(`desktop:settings.siteSessions.status.${statusKey}`);
    const siteLabel = site.labelKey ? t(site.labelKey) : site.displayName;
    const disabled = isSiteSessionActionBusy;
    const syncSource = formatSiteSessionSyncSource(state);
    return {
      id: site.siteId,
      icon: Logo
        ? <Logo size={15} />
        : (
            <span style={{
              width: 15,
              height: 15,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
            }}>
              {site.displayName.slice(0, 1).toUpperCase()}
            </span>
          ),
      label: siteLabel,
      statusLabel,
      detailLabel: syncSource
        ? t("desktop:settings.siteSessions.syncedFrom", { source: syncSource })
        : t("desktop:settings.siteSessions.extensionSyncHint"),
      tone: statusKey === "ready" ? "ready" : statusKey === "expired" ? "danger" : "muted",
      disabled,
      canSync: !disabled,
      canClear: !disabled,
      onClick: () => void invokeSiteSessionCommand(site.siteId, "sync"),
    };
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

  const readySiteLoginCount = siteLoginBadges.filter((site) => site.tone === "ready").length;
  const hasSiteLoginError = siteLoginBadges.some((site) => site.tone === "danger");
  const appearanceSummary = t("desktop:settings.hub.summary.appearance", {
    theme: t(`desktop:settings.theme.${theme}`),
    language: t(`common:language.${currentLanguage}`),
    shortcut: shortcut
      ? formatShortcutForDisplay(shortcut, isMacOS)
      : t("desktop:settings.hub.state.shortcutOff"),
    startup: autostart
      ? t("desktop:settings.hub.state.startupOn")
      : t("desktop:settings.hub.state.startupOff"),
  });
  const savingSummary = t("desktop:settings.hub.summary.saving", {
    folder: outputPath
      ? truncatePath(getLeafName(outputPath) || outputPath, 18)
      : t("desktop:settings.hub.state.noFolder"),
    rename: renameMediaOnDownload
      ? t(`desktop:settings.rename.options.${
        renameRulePreset === "desc_number"
          ? "descending"
          : renameRulePreset === "asc_number"
            ? "ascending"
            : "prefixSequence"
      }`)
      : t("desktop:settings.hub.state.renameOff"),
  });
  const siteLoginsSummary = siteSessionError
    ? t("desktop:settings.hub.summary.sitesError")
    : readySiteLoginCount > 0
        ? t("desktop:settings.hub.summary.sitesReady", {
          count: readySiteLoginCount,
          total: siteLoginBadges.length,
        })
        : t("desktop:settings.hub.summary.sitesMissing");
  const pluginsSummary = aePortalEnabled
    ? t("desktop:settings.hub.summary.pluginsActive")
    : t("desktop:settings.hub.summary.pluginsAvailable");
  const normalizedNetworkProxyInput = normalizeManualNetworkProxyUrl(networkProxyInput);
  const networkProxySavedUrl = networkProxyState?.configuredProxy?.url ?? null;
  const networkProxyStateMatchesInput = Boolean(
    normalizedNetworkProxyInput
    && networkProxySavedUrl === normalizedNetworkProxyInput,
  );
  const networkProxyStatusKind = networkProxyMode === "system"
    ? "system"
    : networkProxyInputInvalid
      ? "invalid"
      : networkProxySavePending
        ? "saving"
        : networkProxyState?.validationStatus === "validating" && networkProxyStateMatchesInput
          ? "validating"
          : networkProxyState?.effectivePolicy.mode === "manual" && networkProxyStateMatchesInput
            ? "manual"
            : networkProxyState?.effectivePolicy.mode === "system"
              && networkProxyState?.effectivePolicy.reason === "manual_unavailable"
              && networkProxyStateMatchesInput
                ? "fallback"
                : normalizedNetworkProxyInput
                  ? "saving"
                  : "empty";
  const networkProxyStatusTone = networkProxyStatusKind === "invalid" || networkProxyStatusKind === "fallback"
    ? "danger"
    : networkProxyStatusKind === "manual"
      ? "accent"
      : "muted";
  const networkProxyStatusText = t(`desktop:settings.networkProxy.status.${networkProxyStatusKind}`);
  const systemSummary = appUpdateInfo
    ? t("desktop:settings.hub.summary.systemUpdateReady", { version: appUpdateInfo.latest })
    : networkProxyStatusKind === "manual"
      ? t("desktop:settings.hub.summary.systemProxyOn", { version: APP_VERSION })
      : networkProxyStatusKind === "invalid" || networkProxyStatusKind === "fallback"
        ? t("desktop:settings.hub.summary.systemProxyError")
        : t("desktop:settings.hub.summary.systemIdle", { version: APP_VERSION });
  const buildSearchText = (parts: string[]): string => parts
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const hubDestinations: SettingsHubDestination[] = [
    {
      id: "appearance",
      title: t("desktop:settings.hub.pages.appearance"),
      summary: appearanceSummary,
      searchText: buildSearchText([
        t("desktop:settings.hub.pages.appearance"),
        appearanceSummary,
        t("desktop:settings.theme.title"),
        t("desktop:settings.theme.black"),
        t("desktop:settings.theme.white"),
        t("desktop:settings.language.title"),
        t("desktop:settings.shortcut.title"),
        t("desktop:settings.launchAtStartup.title"),
      ]),
      matchSummary: t("desktop:settings.hub.search.match.appearance"),
      attentionTone: null,
    },
    {
      id: "saving",
      title: t("desktop:settings.hub.pages.saving"),
      summary: savingSummary,
      searchText: buildSearchText([
        t("desktop:settings.hub.pages.saving"),
        savingSummary,
        t("desktop:settings.outputFolder.title"),
        t("desktop:settings.outputFolder.choose"),
        t("desktop:settings.rename.title"),
        t("desktop:settings.rename.preset"),
        t("desktop:settings.rename.prefix"),
        t("desktop:settings.rename.suffix"),
        t("desktop:settings.rename.preview"),
      ]),
      matchSummary: t("desktop:settings.hub.search.match.saving"),
      attentionTone: renameMediaOnDownload ? "accent" : null,
    },
    {
      id: "sites",
      title: t("desktop:settings.hub.pages.sites"),
      summary: siteLoginsSummary,
      searchText: buildSearchText([
        t("desktop:settings.hub.pages.sites"),
        siteLoginsSummary,
        t("desktop:settings.siteSessions.title"),
        t("desktop:settings.siteSessions.syncButton"),
        t("desktop:settings.siteSessions.clearButton"),
        ...siteSessionRegistryEntries.map((site) => site.labelKey ? t(site.labelKey) : site.displayName),
      ]),
      matchSummary: t("desktop:settings.hub.search.match.sites"),
      attentionTone: hasSiteLoginError ? "danger" : readySiteLoginCount > 0 ? "accent" : null,
    },
    {
      id: "plugins",
      title: t("desktop:settings.hub.pages.plugins"),
      summary: pluginsSummary,
      searchText: buildSearchText([
        t("desktop:settings.hub.pages.plugins"),
        pluginsSummary,
        t("desktop:settings.pluginsPage.installed.title"),
        t("desktop:settings.aePortal.title"),
        t("desktop:settings.aePortal.chooseExe"),
        t("desktop:settings.pluginsPage.future.title"),
      ]),
      matchSummary: t("desktop:settings.hub.search.match.plugins"),
      attentionTone: aePortalEnabled ? "accent" : null,
    },
    {
      id: "system",
      title: t("desktop:settings.hub.pages.system"),
      summary: systemSummary,
      searchText: buildSearchText([
        t("desktop:settings.hub.pages.system"),
        systemSummary,
        t("desktop:settings.versionCard.title"),
        t("desktop:settings.versionCard.checkButton"),
        t("desktop:settings.versionCard.updateButton"),
        t("desktop:settings.appUpdates.title"),
        t("desktop:settings.networkProxy.title"),
        t("desktop:settings.networkProxy.system"),
        t("desktop:settings.networkProxy.manual"),
        t("desktop:settings.supportLog.title"),
        t("desktop:settings.supportLog.button"),
        isDevBuild ? t("desktop:settings.developer.sectionTitle") : "",
        isDevBuild ? t("desktop:settings.developer.injectionDebug.title") : "",
      ]),
      matchSummary: t("desktop:settings.hub.search.match.system"),
      attentionTone: appUpdateInfo
        ? "warning"
        : networkProxyStatusKind === "invalid" || networkProxyStatusKind === "fallback"
          ? "danger"
          : networkProxyStatusKind === "manual"
            ? "accent"
            : null,
    },
  ];
  const normalizedSettingsSearchQuery = settingsSearchQuery.trim().toLocaleLowerCase();
  const visibleHubDestinations = normalizedSettingsSearchQuery
    ? hubDestinations.filter((destination) => (
      destination.searchText.includes(normalizedSettingsSearchQuery)
    ))
    : hubDestinations;

  const getHubDestinationStyle = (
    destination: SettingsHubDestination,
    hovered: boolean,
  ): CSSProperties => {
    const highlighted = hovered || destination.attentionTone === "accent";
    return {
      width: "100%",
      minHeight: SETTINGS_HUB_DESTINATION_MIN_HEIGHT,
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "9px 10px 9px 12px",
      ...getFieldSurfaceStyle(colors, {
        active: highlighted,
        highlighted: hovered,
        padding: "9px 10px 9px 12px",
        height: 0,
      }),
      borderColor: destination.attentionTone === "danger"
        ? colors.dangerBorder
        : destination.attentionTone === "warning"
          ? colors.warningBorder
          : highlighted
            ? colors.accentBorder
            : colors.fieldBorder,
      color: colors.textPrimary,
      cursor: "pointer",
      textAlign: "left",
      transition: [
        `background 0.18s ${COMPACT_EASE}`,
        `border-color 0.18s ${COMPACT_EASE}`,
        `box-shadow 0.18s ${COMPACT_EASE}`,
        `color 0.18s ${COMPACT_EASE}`,
      ].join(", "),
      ...WINDOW_NO_DRAG_REGION_STYLE,
    };
  };

  const getHubAttentionDotStyle = (tone: SettingsHubDestination["attentionTone"]): CSSProperties => {
    const dotColor = tone === "danger"
      ? colors.dangerSolid
      : tone === "warning"
        ? colors.warningSolid
        : colors.accentSolid;
    const glowColor = tone === "danger"
      ? colors.dangerGlow
      : tone === "warning"
        ? colors.warningGlow
        : colors.accentGlow;
    return {
      width: 7,
      height: 7,
      flexShrink: 0,
      ...getContinuousCornerStyle(999),
      background: dotColor,
      boxShadow: `0 0 12px ${glowColor}`,
    };
  };

  const renderHubPage = (): ReactNode => (
    <div
      style={{
        minHeight: "100%",
        display: "grid",
        gridTemplateRows: `${SETTINGS_HUB_SEARCH_HEIGHT}px 1fr`,
        gap: SETTINGS_HUB_SEARCH_TO_LIST_GAP,
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...getFieldSurfaceStyle(colors, {
            active: Boolean(normalizedSettingsSearchQuery),
            highlighted: Boolean(normalizedSettingsSearchQuery),
            padding: "8px 10px",
            height: SETTINGS_HUB_SEARCH_HEIGHT,
          }),
          ...WINDOW_NO_DRAG_REGION_STYLE,
        }}
      >
        <SearchIcon
          size={13}
          style={{
            flexShrink: 0,
            color: normalizedSettingsSearchQuery ? colors.accentText : colors.textSecondary,
          }}
        />
        <input
          type="search"
          value={settingsSearchQuery}
          onChange={(event) => setSettingsSearchQuery(event.target.value)}
          placeholder={t("desktop:settings.hub.search.placeholder")}
          aria-label={t("desktop:settings.hub.search.label")}
          style={{
            width: "100%",
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: colors.textPrimary,
            fontSize: 11.5,
            lineHeight: 1.2,
          }}
        />
      </label>

      <div
        style={{
          minHeight: 0,
          display: "grid",
          alignContent: "start",
          gap: SETTINGS_HUB_DESTINATION_GAP,
          paddingBottom: 2,
        }}
      >
        {visibleHubDestinations.map((destination) => {
        const hovered = hoveredHubDestination === destination.id;
        return (
          <button
            key={destination.id}
            type="button"
            onClick={() => navigateSettingsPage(destination.id)}
            onMouseEnter={() => setHoveredHubDestination(destination.id)}
            onMouseLeave={() => setHoveredHubDestination((current) => (
              current === destination.id ? null : current
            ))}
            style={getHubDestinationStyle(destination, hovered)}
          >
            {destination.attentionTone ? (
              <span style={getHubAttentionDotStyle(destination.attentionTone)} aria-hidden="true" />
            ) : null}
            <span style={{ minWidth: 0, flex: "1 1 auto", display: "grid", gap: 4 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 650,
                  lineHeight: 1.15,
                  color: colors.textPrimary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {destination.title}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.25,
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {normalizedSettingsSearchQuery ? destination.matchSummary : destination.summary}
              </span>
            </span>
            <ChevronRightIcon
              size={14}
              style={{
                flexShrink: 0,
                color: hovered ? colors.accentText : colors.textSecondary,
              }}
            />
          </button>
        );
      })}
      </div>

      {visibleHubDestinations.length === 0 ? (
        <div
          style={{
            minHeight: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.textSecondary,
            fontSize: 10.5,
            lineHeight: 1.35,
            textAlign: "center",
          }}
        >
          {t("desktop:settings.hub.search.empty")}
        </div>
      ) : null}
    </div>
  );

  const renderAppearancePage = (): ReactNode => (
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

  const renderSavingPage = (): ReactNode => (
    <>
      <NeonSection title={t("desktop:settings.outputFolder.title")}>
        <button
          type="button"
          onClick={selectOutputPath}
          onMouseEnter={() => setHoveredSavingAction("outputFolder")}
          onMouseLeave={() => setHoveredSavingAction((current) => (
            current === "outputFolder" ? null : current
          ))}
          onFocus={() => setHoveredSavingAction("outputFolder")}
          onBlur={() => setHoveredSavingAction((current) => (
            current === "outputFolder" ? null : current
          ))}
          style={{
            ...getSettingsControlRowStyle({
              interactive: true,
              highlighted: hoveredSavingAction === "outputFolder",
            }),
            ...WINDOW_NO_DRAG_REGION_STYLE,
          }}
        >
          <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
              {t("desktop:settings.outputFolder.title")}
            </span>
            <span
              style={{
                fontSize: 10.5,
                lineHeight: 1.4,
                color: colors.textSecondary,
                opacity: 0.82,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {outputPath ? truncatePath(outputPath) : t("desktop:settings.outputFolder.choose")}
            </span>
          </div>
          <FolderOpenIcon
            size={15}
            style={{
              flexShrink: 0,
              color: hoveredSavingAction === "outputFolder" ? colors.accentText : colors.textSecondary,
              transition: `color 0.18s ${COMPACT_EASE}`,
            }}
          />
        </button>
      </NeonSection>

      <NeonSection
        title={t("desktop:settings.rename.title")}
        hint={t("desktop:settings.rename.hint")}
      >
        <div style={getSettingsControlRowStyle()}>
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

  const renderSiteLoginsPage = (): ReactNode => (
    <>
      <NeonSection
        title={t("desktop:settings.siteSessions.title")}
        hint={t("desktop:settings.siteSessions.hint")}
      >
        <div
          style={{
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gap: 7 }}>
            {siteLoginBadges.map((site) => (
              <div
                key={site.id}
                style={{
                  ...getSiteLoginRowStyle(
                    site.tone,
                    site.disabled,
                  ),
                  ...WINDOW_NO_DRAG_REGION_STYLE,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!site.disabled) {
                      void site.onClick();
                    }
                  }}
                  disabled={site.disabled}
                  style={getSiteLoginMainButtonStyle(site.disabled)}
                >
                  <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flexShrink: 0, color: colors.textPrimary }}>{site.icon}</span>
                    <span
                      style={{
                        minWidth: 0,
                        display: "grid",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 12,
                          fontWeight: 650,
                          lineHeight: 1.1,
                          color: colors.textPrimary,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={getSiteLoginStatusDotStyle(site.tone)}
                          aria-label={site.statusLabel}
                        />
                        <span
                          style={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {site.label}
                        </span>
                      </span>
                      {site.detailLabel ? (
                        <span
                          style={{
                            minWidth: 0,
                            maxWidth: 170,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 10,
                            lineHeight: 1.1,
                            color: colors.textSecondary,
                            opacity: 0.84,
                          }}
                        >
                          {site.detailLabel}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                    justifyContent: "flex-end",
                    flexWrap: "nowrap",
                  }}
                >
                  <NeonButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void invokeSiteSessionCommand(site.id, "sync")}
                    disabled={isSiteSessionActionBusy || !site.canSync}
                    title={t("desktop:settings.siteSessions.syncButton")}
                    style={siteLoginInlineActionStyle}
                  >
                    {t("desktop:settings.siteSessions.syncShortButton")}
                  </NeonButton>
                  <NeonButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void invokeSiteSessionCommand(site.id, "clear")}
                    disabled={isSiteSessionActionBusy || !site.canClear}
                    title={t("desktop:settings.siteSessions.clearButton")}
                    style={siteLoginInlineActionStyle}
                  >
                    {t("desktop:settings.siteSessions.clearButton")}
                  </NeonButton>
                </div>
              </div>
            ))}
          </div>

          {siteSessionError ? (
            <NeonHint tone="danger" size="sm">
              {siteSessionError}
            </NeonHint>
          ) : null}
        </div>
      </NeonSection>
    </>
  );

  const renderPluginsPage = (): ReactNode => (
    <>
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

  const renderSystemPage = (): ReactNode => (
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
        title={t("desktop:settings.networkProxy.title")}
        hint={t("desktop:settings.networkProxy.hint")}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <NeonButton
              type="button"
              variant={networkProxyMode === "system" ? "outline" : "ghost"}
              size="sm"
              onClick={() => void selectNetworkProxyMode("system")}
              style={{ minHeight: 32, fontSize: 10.5 }}
            >
              {t("desktop:settings.networkProxy.system")}
            </NeonButton>
            <NeonButton
              type="button"
              variant={networkProxyMode === "manual" ? "outline" : "ghost"}
              size="sm"
              onClick={() => void selectNetworkProxyMode("manual")}
              style={{ minHeight: 32, fontSize: 10.5 }}
            >
              {t("desktop:settings.networkProxy.manual")}
            </NeonButton>
          </div>

          {networkProxyMode === "manual" ? (
            <NeonInput
              value={networkProxyInput}
              onChange={(event) => handleNetworkProxyInputChange(event.target.value)}
              placeholder={t("desktop:settings.networkProxy.placeholder")}
              spellCheck={false}
              aria-invalid={networkProxyInputInvalid}
            />
          ) : null}

          <NeonHint
            tone={networkProxyStatusTone === "muted" ? "default" : networkProxyStatusTone}
            size="sm"
          >
            {networkProxyStatusText}
          </NeonHint>
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

      {isDevBuild ? (
        <NeonSection
          title={t("desktop:settings.developer.sectionTitle")}
          hint={t("desktop:settings.developer.sectionHint")}
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
                {t("desktop:settings.developer.injectionDebug.title")}
              </span>
              <NeonToggle
                checked={extensionInjectionDebugEnabled}
                onChange={toggleExtensionInjectionDebug}
              />
            </div>
          </div>
        </NeonSection>
      ) : null}
    </>
  );

  const activePageTitle = activePage === "hub"
    ? t("desktop:settings.title")
    : t(`desktop:settings.hub.pages.${activePage}`);

  const renderActivePage = (): ReactNode => {
    switch (activePage) {
      case "hub":
        return renderHubPage();
      case "appearance":
        return renderAppearancePage();
      case "saving":
        return renderSavingPage();
      case "sites":
        return renderSiteLoginsPage();
      case "plugins":
        return renderPluginsPage();
      case "system":
        return renderSystemPage();
      default:
        return null;
    }
  };

  const settingsPageMotion = getSettingsPageSwitchMotion(
    shouldReduceMotion,
    settingsNavigationDirection,
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        aria-hidden="true"
        style={getShadowBackdropStyle(colors, {
          radius: settingsShellRadius,
          boxShadow: colors.panelShadow,
          inset: windowShadowGutter,
        })}
      />
      <div
        style={{
          position: "absolute",
          inset: windowShadowGutter,
          zIndex: 1,
        }}
      >
        <div style={panelStyle}>
          <div
            style={getWindowHeaderStyle(colors, {
              dragRegion: true,
            })}
          >
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {activePage !== "hub" ? (
                <NeonIconButton
                  onClick={() => navigateSettingsPage("hub")}
                  size={20}
                  aria-label={t("desktop:settings.hub.back")}
                  style={{
                    ...WINDOW_NO_DRAG_REGION_STYLE,
                    marginLeft: -4,
                    flexShrink: 0,
                  }}
                >
                  <ArrowLeftIcon size={15} />
                </NeonIconButton>
              ) : null}
              <h2
                style={{
                  minWidth: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {activePageTitle}
              </h2>
            </div>
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

          <div style={getWindowBodyStyle({ padding: "16px 18px 18px", gap: 0 })} className="hide-scrollbar">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePage}
                id={`settings-page-${activePage}`}
                role={activePage === "hub" ? "navigation" : "region"}
                aria-label={activePageTitle}
                initial={settingsPageMotion.initial}
                animate={settingsPageMotion.animate}
                exit={settingsPageMotion.exit}
                transition={settingsPageMotion.transition}
                style={{
                  willChange: shouldReduceMotion ? undefined : "transform, opacity",
                  ...(activePage === "hub"
                    ? {
                      flex: "1 1 auto",
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                    }
                    : {}),
                }}
              >
                {renderActivePage()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
