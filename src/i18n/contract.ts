import localeContractJson from "../../locales/contract.json";

export type AppLanguage = "en" | "zh-CN";
export type LocaleNamespace = "common" | "desktop" | "extension" | "native";

type LocaleContract = {
  configKey: "language";
  fallbackLanguage: AppLanguage;
  supportedLanguages: AppLanguage[];
  namespaces: LocaleNamespace[];
  desktopEvents: {
    languageChanged: "language-changed";
  };
  webSocketActions: {
    getLanguage: "get_language";
    languageInfo: "language_info";
    languageChanged: "language_changed";
  };
  paths: {
    source: string;
    desktopResources: string;
    extensionResources: string;
  };
};

export const localeContract = localeContractJson as LocaleContract;
export const LANGUAGE_CONFIG_KEY = localeContract.configKey;
export const FALLBACK_LANGUAGE = localeContract.fallbackLanguage;
export const SUPPORTED_APP_LANGUAGES = Object.freeze([...localeContract.supportedLanguages]);
export const I18N_NAMESPACES = Object.freeze([...localeContract.namespaces]);
export const DEFAULT_I18N_NAMESPACE: LocaleNamespace = "common";
export const DESKTOP_LANGUAGE_CHANGED_EVENT = localeContract.desktopEvents.languageChanged;
export const WS_ACTION_GET_LANGUAGE = localeContract.webSocketActions.getLanguage;
export const WS_ACTION_LANGUAGE_INFO = localeContract.webSocketActions.languageInfo;
export const WS_ACTION_LANGUAGE_CHANGED = localeContract.webSocketActions.languageChanged;

export type LanguageChangedEventPayload = {
  language: AppLanguage;
};

export type LanguageInfoMessage = {
  action: typeof WS_ACTION_LANGUAGE_INFO;
  language: AppLanguage;
};

export type LanguageChangedMessage = {
  action: typeof WS_ACTION_LANGUAGE_CHANGED;
  language: AppLanguage;
};
