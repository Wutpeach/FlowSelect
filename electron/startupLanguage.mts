export type FlowSelectAppLanguage = "en" | "zh-CN";

const FALLBACK_LANGUAGE: FlowSelectAppLanguage = "en";

const parseConfigObject = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const normalizeAppLanguage = (
  value: unknown,
): FlowSelectAppLanguage | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  if (normalized === "zh" || normalized.startsWith("zh-")) {
    return "zh-CN";
  }
  return null;
};

export const resolveStartupLanguageFromConfig = (
  configRaw: string,
  systemLocale?: string | null,
  options: { persistResolvedLanguage?: boolean } = {},
): {
  language: FlowSelectAppLanguage;
  nextConfigRaw: string | null;
} => {
  const fallbackLanguage = normalizeAppLanguage(systemLocale) ?? FALLBACK_LANGUAGE;
  const parsedConfig = parseConfigObject(configRaw);
  if (!parsedConfig) {
    return {
      language: fallbackLanguage,
      nextConfigRaw: null,
    };
  }

  const savedLanguage = normalizeAppLanguage(parsedConfig.language);
  if (savedLanguage) {
    return {
      language: savedLanguage,
      nextConfigRaw: null,
    };
  }

  if (options.persistResolvedLanguage !== true) {
    return {
      language: fallbackLanguage,
      nextConfigRaw: null,
    };
  }

  return {
    language: fallbackLanguage,
    nextConfigRaw: JSON.stringify({
      ...parsedConfig,
      language: fallbackLanguage,
    }),
  };
};
