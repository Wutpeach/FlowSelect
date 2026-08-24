export type StartupWindowEnvironment = {
  protocol: string;
  userAgent: string;
};

export const DEFERRED_STARTUP_INITIALIZATION_DELAY_MS = 3000;
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

export const getDeferredStartupInitializationDelayMs = (
  environment: StartupWindowEnvironment,
): number => (
  shouldStartExpandedOnLaunch(environment)
    ? DEFERRED_STARTUP_INITIALIZATION_DELAY_MS
    : 0
);
