/**
 * Electron-only theme bridge — desktop config load, cross-window theme
 * change subscription, and theme persistence.
 *
 * Lives under `src/desktop/` because it is Electron-owned: only the Electron
 * renderer entry (src/main.tsx) mounts it. ThemeContext itself stays
 * browser-safe so the dev-only Browser Lab can mount shared presentational
 * components without importing any desktop runtime module.
 */
import { useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { resolveThemeFromConfigString, type Theme } from "../contexts/theme";
import { desktopCommands, desktopEvents } from "./runtime";

/**
 * Mount inside ThemeProvider (Electron renderer only). Loads the persisted
 * theme when no initialTheme was supplied and keeps this window in sync with
 * theme changes from other windows.
 */
export function ElectronThemeBridge({ initialTheme }: { initialTheme?: Theme }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    let isDisposed = false;

    if (initialTheme === undefined) {
      void desktopCommands.invoke<string>("get_config")
        .then((configString) => {
          if (isDisposed) {
            return;
          }
          setTheme(resolveThemeFromConfigString(configString));
        })
        .catch((err) => {
          console.error("Failed to load theme config:", err);
        });
    }

    const unlisten = desktopEvents.on<Theme>("theme-changed", (event) => {
      setTheme(event.payload);
    });

    return () => {
      isDisposed = true;
      unlisten.then((dispose) => dispose());
    };
  }, [initialTheme, setTheme]);

  return null;
}
