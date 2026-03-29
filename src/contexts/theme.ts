export type Theme = "black" | "white";

export const DEFAULT_THEME: Theme = "black";

const isTheme = (value: unknown): value is Theme => value === "black" || value === "white";

export const resolveThemeFromConfigString = (configStr: string): Theme => {
  try {
    const cfg = JSON.parse(configStr) as { theme?: unknown };
    return isTheme(cfg.theme) ? cfg.theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};
