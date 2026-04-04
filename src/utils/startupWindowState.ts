import { MAIN_WINDOW_IDLE_MINIMIZE_MS } from "./mainWindowMode";

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

export const DEFERRED_STARTUP_INITIALIZATION_DELAY_MS = MAIN_WINDOW_IDLE_MINIMIZE_MS;
export const DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS = 1200;
export const STARTUP_AUTO_RUNTIME_BOOTSTRAP_DELAY_MS = 1200;

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
