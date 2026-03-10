import {
  FALLBACK_LANGUAGE,
  LANGUAGE_CONFIG_KEY,
  type AppLanguage,
} from "./contract";

const isEnglishVariant = (normalized: string): boolean =>
  normalized === "en" || normalized.startsWith("en-");

const isChineseVariant = (normalized: string): boolean =>
  normalized === "zh" || normalized.startsWith("zh-");

export function normalizeAppLanguage(value: unknown): AppLanguage | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) {
    return null;
  }

  if (isEnglishVariant(normalized)) {
    return "en";
  }

  if (isChineseVariant(normalized)) {
    return "zh-CN";
  }

  return null;
}

export function getConfiguredAppLanguage(config: Record<string, unknown>): AppLanguage | null {
  return normalizeAppLanguage(config[LANGUAGE_CONFIG_KEY]);
}

export function resolveAppLanguage(
  configLanguage: unknown,
  navigatorLanguage?: string | null,
): AppLanguage {
  return (
    normalizeAppLanguage(configLanguage) ??
    normalizeAppLanguage(navigatorLanguage) ??
    FALLBACK_LANGUAGE
  );
}

export function resolveAppLanguageFromConfigString(
  configStr: string,
  navigatorLanguage?: string | null,
): AppLanguage {
  try {
    const config = JSON.parse(configStr) as Record<string, unknown>;
    return resolveAppLanguage(config[LANGUAGE_CONFIG_KEY], navigatorLanguage);
  } catch {
    return resolveAppLanguage(undefined, navigatorLanguage);
  }
}
