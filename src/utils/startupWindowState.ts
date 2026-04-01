export type StartupWindowMode = "compact" | "full";

type StartupWindowEnvironment = {
  protocol: string;
  userAgent: string;
};

type NativeCompactStartupWindowOptions = {
  startupWindowMode: StartupWindowMode;
  startsExpandedOnLaunch: boolean;
  isMacOS: boolean;
};

export const DEFERRED_STARTUP_INITIALIZATION_DELAY_MS = 260;

const isElectronDesktopLaunch = ({
  protocol,
  userAgent,
}: StartupWindowEnvironment): boolean => (
  protocol === "file:" || userAgent.toLowerCase().includes("electron")
);

export const shouldStartExpandedOnLaunch = (
  environment: StartupWindowEnvironment,
): boolean => isElectronDesktopLaunch(environment);

export const getStartupAutoMinimizeGraceMs = (
  environment: StartupWindowEnvironment,
): number => {
  void environment;
  return 0;
};

export const getDeferredStartupInitializationDelayMs = (
  environment: StartupWindowEnvironment,
): number => (
  shouldStartExpandedOnLaunch(environment)
    ? DEFERRED_STARTUP_INITIALIZATION_DELAY_MS
    : 0
);

export const shouldUseNativeCompactStartupWindow = ({
  startupWindowMode,
  startsExpandedOnLaunch,
  isMacOS,
}: NativeCompactStartupWindowOptions): boolean => {
  if (startsExpandedOnLaunch || isMacOS) {
    return false;
  }
  return startupWindowMode === "compact";
};
