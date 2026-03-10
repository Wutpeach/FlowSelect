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

export async function initializeI18n(initialLanguage: AppLanguage): Promise<typeof i18n> {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: i18nResources,
      lng: initialLanguage,
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: [...SUPPORTED_APP_LANGUAGES],
      ns: [...I18N_NAMESPACES],
      defaultNS: DEFAULT_I18N_NAMESPACE,
      fallbackNS: DEFAULT_I18N_NAMESPACE,
      interpolation: {
        escapeValue: false,
      },
      load: "currentOnly",
      returnNull: false,
    });

    return i18n;
  }

  if (i18n.resolvedLanguage !== initialLanguage) {
    await i18n.changeLanguage(initialLanguage);
  }

  return i18n;
}

export { i18n };
export default i18n;
