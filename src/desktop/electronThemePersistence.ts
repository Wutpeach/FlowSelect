/**
 * Electron-only theme persistence — emit, broadcast, and save a theme change.
 * Kept separate from ThemeContext so the context stays browser-safe.
 */
import { saveConfigPatch } from "./config";
import { desktopCommands, desktopEvents } from "./runtime";
import type { Theme } from "../contexts/theme";

/** Emit + broadcast + persist a theme change (called from ThemeProvider). */
export const persistElectronTheme = async (theme: Theme): Promise<void> => {
  await desktopEvents.emit("theme-changed", theme);
  await desktopCommands.invoke("broadcast_theme", { theme });
  await saveConfigPatch({ theme });
};
