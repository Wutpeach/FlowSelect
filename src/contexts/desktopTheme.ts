import { desktopCommands } from "../desktop/runtime";

import { DEFAULT_THEME, resolveThemeFromConfigString, type Theme } from "./theme";

export async function resolveInitialDesktopTheme(): Promise<Theme> {
  try {
    const configStr = await desktopCommands.invoke<string>("get_config");
    return resolveThemeFromConfigString(configStr);
  } catch (error) {
    console.error("Failed to load desktop theme config during bootstrap:", error);
    return DEFAULT_THEME;
  }
}
