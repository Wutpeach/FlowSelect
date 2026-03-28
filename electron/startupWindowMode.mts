export type StartupWindowMode = "compact" | "full";

export const MAIN_WINDOW_FULL_SIZE = 200;
export const MAIN_WINDOW_COMPACT_STARTUP_SIZE = 80;
const STARTUP_WINDOW_MODE_ARGUMENT_PREFIX = "--flowselect-startup-window-mode=";

export const resolveMainWindowStartupMode = ({
  platform,
  hasShownMainWindowOnce,
}: {
  platform: NodeJS.Platform;
  hasShownMainWindowOnce: boolean;
}): StartupWindowMode => (
  platform === "win32" && !hasShownMainWindowOnce
    ? "compact"
    : "full"
);

export const resolveMainWindowInitialSize = (
  startupWindowMode: StartupWindowMode,
): number => (
  startupWindowMode === "compact"
    ? MAIN_WINDOW_COMPACT_STARTUP_SIZE
    : MAIN_WINDOW_FULL_SIZE
);

export const buildStartupWindowModeArgument = (
  startupWindowMode: StartupWindowMode,
): string => `${STARTUP_WINDOW_MODE_ARGUMENT_PREFIX}${startupWindowMode}`;

export const parseStartupWindowModeArgument = (
  argv: readonly string[],
): StartupWindowMode => {
  const matchingArgument = argv.find((entry) => (
    typeof entry === "string"
    && entry.startsWith(STARTUP_WINDOW_MODE_ARGUMENT_PREFIX)
  ));

  if (!matchingArgument) {
    return "full";
  }

  const mode = matchingArgument.slice(STARTUP_WINDOW_MODE_ARGUMENT_PREFIX.length);
  return mode === "compact" ? "compact" : "full";
};
