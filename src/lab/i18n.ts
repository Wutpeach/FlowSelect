/**
 * Browser Lab i18n bootstrap — zh-CN first, no desktop bridge.
 *
 * The shared i18n singleton (`src/i18n`) statically bundles all production
 * locale resources, so `initializeI18n("zh-CN")` works in a plain browser
 * without Electron config. `I18nRuntimeBridge` (Electron language-change
 * events) is intentionally NOT mounted.
 *
 * The Lab chrome strings live in a dedicated `lab` namespace registered here
 * at runtime. Because only the Lab entry imports this module (production
 * build input is pinned to index.html), the `lab` locale files never enter
 * production chunks.
 */
import i18n, { initializeI18n } from "../i18n";
import type { AppLanguage } from "../i18n/contract";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export const LAB_LOCALE_NAMESPACE = "lab";

export const LAB_DEFAULT_LANGUAGE: AppLanguage = "zh-CN";

export async function initializeLabI18n(
  language: AppLanguage = LAB_DEFAULT_LANGUAGE,
): Promise<AppLanguage> {
  await initializeI18n(language);
  i18n.addResourceBundle("zh-CN", LAB_LOCALE_NAMESPACE, zhCN, true, true);
  i18n.addResourceBundle("en", LAB_LOCALE_NAMESPACE, en, true, true);
  return language;
}

export { i18n };
