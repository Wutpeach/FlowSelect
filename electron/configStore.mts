import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  normalizeAppLanguage,
  resolveStartupLanguageFromConfig,
  type AmeowAppLanguage,
} from "./startupLanguage.mjs";

type ConfigStoreFs = {
  existsSync: typeof existsSync;
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  writeFile: typeof writeFile;
};

type ConfigStoreOptions = {
  getUserDataDir(): string;
  getDesktopDir(): string;
  getLocale(): string;
  logDirName: string;
  defaultOutputFolderName: string;
  fallbackTheme: "black" | "white";
  languageChangedEventName: string;
  emitAppEvent(eventName: string, payload: unknown): void;
  broadcastWsMessage(message: unknown): void;
  refreshTrayMenu(): Promise<unknown>;
  onTrayRefreshError(error: unknown): void;
  fs?: ConfigStoreFs;
};

export type StartupConfigSnapshot = {
  raw: string;
  config: Record<string, unknown>;
  language: AmeowAppLanguage;
  theme: "black" | "white";
  shortcut: string;
};

const defaultFs: ConfigStoreFs = {
  existsSync,
  mkdir,
  readFile,
  writeFile,
};

export const parseJsonObject = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const resolveThemeFromConfigObject = (
  config: Record<string, unknown>,
  fallbackTheme: "black" | "white" = "black",
): "black" | "white" => (
  config.theme === "white" || config.theme === "black"
    ? config.theme
    : fallbackTheme
);

export const resolveExtensionInjectionDebugEnabledFromConfigObject = (
  config: Record<string, unknown>,
): boolean => config.extensionInjectionDebugEnabled === true;

export const createConfigStore = (options: ConfigStoreOptions) => {
  const fsApi = options.fs ?? defaultFs;

  const getUserDataDir = () => options.getUserDataDir();

  const getConfigPath = () => join(getUserDataDir(), "settings.json");

  const getLogsDir = () => join(getUserDataDir(), options.logDirName);

  const migrateLegacyConfigIfNeeded = async () => undefined;

  const ensureUserDataDirs = async () => {
    await migrateLegacyConfigIfNeeded();
    await fsApi.mkdir(getUserDataDir(), { recursive: true });
    await fsApi.mkdir(getLogsDir(), { recursive: true });
  };

  const readConfigString = async () => {
    await ensureUserDataDirs();
    const configPath = getConfigPath();
    if (!fsApi.existsSync(configPath)) {
      return "{}";
    }

    const configRaw = await fsApi.readFile(configPath, "utf8");
    const decision = resolveStartupLanguageFromConfig(configRaw, options.getLocale(), {
      persistResolvedLanguage: true,
    });
    if (decision.nextConfigRaw && decision.nextConfigRaw !== configRaw) {
      await fsApi.writeFile(configPath, decision.nextConfigRaw, "utf8");
      return decision.nextConfigRaw;
    }

    return configRaw;
  };

  const readConfigObject = async () => parseJsonObject(await readConfigString());

  /**
   * Reads only an already-present config file. Diagnostics must not initialize
   * user-data directories or persist a resolved language merely to inspect
   * configuration facts.
   */
  const readConfigStringNoCreate = async () => {
    const configPath = getConfigPath();
    if (!fsApi.existsSync(configPath)) {
      return "{}";
    }
    return fsApi.readFile(configPath, "utf8");
  };

  const readConfigObjectNoCreate = async () => parseJsonObject(await readConfigStringNoCreate());

  const resolveLanguageFromConfigString = (raw: string) => (
    resolveStartupLanguageFromConfig(raw, options.getLocale(), {
      persistResolvedLanguage: false,
    }).language
  );

  const readCurrentLanguage = async () => resolveLanguageFromConfigString(await readConfigString());

  const resolveTheme = (config: Record<string, unknown>) => (
    resolveThemeFromConfigObject(config, options.fallbackTheme)
  );

  const readCurrentTheme = async () => resolveTheme(await readConfigObject());

  const buildStartupConfigSnapshot = (configRaw: string): StartupConfigSnapshot => {
    const config = parseJsonObject(configRaw);
    return {
      raw: configRaw,
      config,
      language: resolveLanguageFromConfigString(configRaw),
      theme: resolveTheme(config),
      shortcut: typeof config.shortcut === "string" ? config.shortcut.trim() : "",
    };
  };

  const readStartupConfigSnapshot = async () => buildStartupConfigSnapshot(await readConfigString());

  const saveConfigString = async (raw: string) => {
    await ensureUserDataDirs();
    const previousLanguage = await readCurrentLanguage();
    const previousConfig = await readConfigObject();
    const previousExtensionInjectionDebugEnabled =
      resolveExtensionInjectionDebugEnabledFromConfigObject(previousConfig);
    await fsApi.writeFile(getConfigPath(), raw, "utf8");

    const nextConfig = parseJsonObject(raw);
    const nextLanguage = normalizeAppLanguage(nextConfig.language);
    if (nextLanguage && nextLanguage !== previousLanguage) {
      options.emitAppEvent(options.languageChangedEventName, { language: nextLanguage });
      options.broadcastWsMessage({
        action: "language_changed",
        data: {
          language: nextLanguage,
        },
      });
      options.refreshTrayMenu().catch(options.onTrayRefreshError);
    }

    const nextExtensionInjectionDebugEnabled =
      resolveExtensionInjectionDebugEnabledFromConfigObject(nextConfig);
    if (nextExtensionInjectionDebugEnabled !== previousExtensionInjectionDebugEnabled) {
      options.broadcastWsMessage({
        action: "extension_debug_config_changed",
        data: {
          enabled: nextExtensionInjectionDebugEnabled,
        },
      });
    }
  };

  const resolveCurrentOutputFolderPath = async () => {
    const config = await readConfigObject();
    if (typeof config.outputPath === "string" && config.outputPath.trim()) {
      return config.outputPath.trim();
    }
    return join(options.getDesktopDir(), options.defaultOutputFolderName);
  };

  const resolveCurrentOutputFolderPathNoCreate = async () => {
    const config = await readConfigObjectNoCreate();
    if (typeof config.outputPath === "string" && config.outputPath.trim()) {
      return config.outputPath.trim();
    }
    return join(options.getDesktopDir(), options.defaultOutputFolderName);
  };

  return {
    buildStartupConfigSnapshot,
    ensureUserDataDirs,
    getConfigPath,
    getLogsDir,
    getUserDataDir,
    readConfigObject,
    readConfigObjectNoCreate,
    readConfigString,
    readConfigStringNoCreate,
    readCurrentLanguage,
    readCurrentTheme,
    readStartupConfigSnapshot,
    resolveCurrentOutputFolderPath,
    resolveCurrentOutputFolderPathNoCreate,
    resolveExtensionInjectionDebugEnabledFromConfigObject,
    resolveLanguageFromConfigString,
    resolveThemeFromConfigObject: resolveTheme,
    saveConfigString,
  };
};
