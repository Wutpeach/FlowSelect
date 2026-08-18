export const MAIN_WINDOW_PANEL_SIZE = 200;
export const MAIN_WINDOW_COMPACT_SHELL_SIZE = 60;
export const MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE = 80;
export const MAIN_WINDOW_FULL_SHADOW_GUTTER = 14;
export const MAIN_WINDOW_MACOS_FULL_SHADOW_GUTTER = MAIN_WINDOW_FULL_SHADOW_GUTTER;

export const SETTINGS_WINDOW_CONTENT_WIDTH = 320;
export const SETTINGS_WINDOW_CONTENT_HEIGHT = 400;
export const MACOS_SECONDARY_WINDOW_SHADOW_GUTTER = 14;

export const getMainWindowFullShadowGutter = (platform: NodeJS.Platform): number => (
  platform === "darwin" || platform === "win32" ? MAIN_WINDOW_FULL_SHADOW_GUTTER : 0
);

export const getMainWindowCompactOuterSize = (platform: NodeJS.Platform): number => (
  void platform,
  MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE
);

export const getMainWindowFullOuterSize = (platform: NodeJS.Platform): number => (
  MAIN_WINDOW_PANEL_SIZE + getMainWindowFullShadowGutter(platform) * 2
);

export const getMainWindowOuterSize = (
  platform: NodeJS.Platform,
  mode: "compact" | "full",
): number => (
  mode === "compact"
    ? getMainWindowCompactOuterSize(platform)
    : getMainWindowFullOuterSize(platform)
);

export const getSecondaryWindowShadowGutter = (platform: NodeJS.Platform): number => (
  platform === "darwin" ? MACOS_SECONDARY_WINDOW_SHADOW_GUTTER : 0
);

export const getSecondaryWindowOuterSize = (
  platform: NodeJS.Platform,
  width: number,
  height: number,
): { width: number; height: number; gutter: number } => {
  const gutter = getSecondaryWindowShadowGutter(platform);
  return {
    width: width + gutter * 2,
    height: height + gutter * 2,
    gutter,
  };
};
