import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import {
  DESKTOP_LANGUAGE_CHANGED_EVENT,
  type LanguageChangedEventPayload,
} from "./contract";
import i18n from "./index";
import { normalizeAppLanguage } from "./language";

export function I18nRuntimeBridge() {
  useEffect(() => {
    const unlisten = listen<LanguageChangedEventPayload>(
      DESKTOP_LANGUAGE_CHANGED_EVENT,
      (event) => {
        const nextLanguage = normalizeAppLanguage(event.payload.language);
        if (!nextLanguage || i18n.resolvedLanguage === nextLanguage) {
          return;
        }

        void i18n.changeLanguage(nextLanguage);
      },
    );

    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, []);

  return null;
}
