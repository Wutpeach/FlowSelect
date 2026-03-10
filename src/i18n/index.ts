import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_I18N_NAMESPACE,
  FALLBACK_LANGUAGE,
  I18N_NAMESPACES,
  SUPPORTED_APP_LANGUAGES,
  type AppLanguage,
} from "./contract";
import { i18nResources } from "./resources";

const buildI18nInitOptions = (language: AppLanguage) => ({
  resources: i18nResources,
  lng: language,
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: [...SUPPORTED_APP_LANGUAGES],
  ns: [...I18N_NAMESPACES],
  defaultNS: DEFAULT_I18N_NAMESPACE,
  fallbackNS: DEFAULT_I18N_NAMESPACE,
  interpolation: {
    escapeValue: false,
  },
  load: "currentOnly" as const,
  returnNull: false as const,
});

export type I18nInstanceAdapter = Pick<
  typeof i18n,
  "isInitialized" | "resolvedLanguage" | "use" | "init" | "changeLanguage"
>;

async function initI18nWithLanguage(
  instance: I18nInstanceAdapter,
  language: AppLanguage,
): Promise<void> {
  await instance.use(initReactI18next).init(buildI18nInitOptions(language));
}

export async function initializeI18nInstance(
  instance: I18nInstanceAdapter,
  initialLanguage: AppLanguage,
): Promise<I18nInstanceAdapter> {
  if (!instance.isInitialized) {
    try {
      await initI18nWithLanguage(instance, initialLanguage);
    } catch (error) {
      if (initialLanguage === FALLBACK_LANGUAGE) {
        throw error;
      }

      console.error(
        `Failed to initialize i18n for ${initialLanguage}, retrying with English fallback:`,
        error,
      );
      await initI18nWithLanguage(instance, FALLBACK_LANGUAGE);
    }

    return instance;
  }

  if (instance.resolvedLanguage !== initialLanguage) {
    await instance.changeLanguage(initialLanguage);
  }

  return instance;
}

export async function initializeI18n(initialLanguage: AppLanguage): Promise<typeof i18n> {
  await initializeI18nInstance(i18n, initialLanguage);
  return i18n;
}

export { i18n };
export default i18n;
