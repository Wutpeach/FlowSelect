import { invoke } from "../runtime/core";

import i18n from "./index";
import {
  LANGUAGE_CONFIG_KEY,
  type AppLanguage,
} from "./contract";

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
  const configStr = await invoke<string>("get_config");
  const config = parseConfig(configStr);

  config[LANGUAGE_CONFIG_KEY] = nextLanguage;
  await invoke<void>("save_config", { json: JSON.stringify(config) });

  if (i18n.resolvedLanguage !== nextLanguage) {
    await i18n.changeLanguage(nextLanguage);
  }
}
