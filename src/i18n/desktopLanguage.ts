import { desktopCommands } from "../desktop/runtime";

import i18n from "./index";
import {
  LANGUAGE_CONFIG_KEY,
  type AppLanguage,
} from "./contract";
import { resolveAppLanguage, resolveAppLanguageFromConfigString } from "./language";

type AppConfig = Record<string, unknown>;

const parseConfig = (configStr: string): AppConfig => {
  try {
    const parsed = JSON.parse(configStr) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as AppConfig;
  } catch {
    return {};
  }
};

export async function changeDesktopLanguage(nextLanguage: AppLanguage): Promise<void> {
  const configStr = await desktopCommands.invoke<string>("get_config");
  const config = parseConfig(configStr);

  config[LANGUAGE_CONFIG_KEY] = nextLanguage;
  await desktopCommands.invoke<void>("save_config", { json: JSON.stringify(config) });

  if (i18n.resolvedLanguage !== nextLanguage) {
    await i18n.changeLanguage(nextLanguage);
  }
}

export async function resolveInitialDesktopLanguage(
  navigatorLanguage?: string | null,
): Promise<AppLanguage> {
  try {
    const configStr = await desktopCommands.invoke<string>("get_config");
    return resolveAppLanguageFromConfigString(configStr, navigatorLanguage);
  } catch (error) {
    console.error("Failed to load desktop language config during bootstrap:", error);
    return resolveAppLanguage(undefined, navigatorLanguage);
  }
}
