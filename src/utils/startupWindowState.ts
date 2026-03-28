export const PACKAGED_WINDOWS_STARTUP_IDLE_GRACE_MS = 12_000;

type StartupWindowEnvironment = {
  protocol: string;
  userAgent: string;
};

const isWindowsUserAgent = (userAgent: string): boolean => (
  userAgent.toLowerCase().includes("windows")
);

export const isPackagedWindowsDesktop = ({
  protocol,
  userAgent,
}: StartupWindowEnvironment): boolean => (
  protocol === "file:" && isWindowsUserAgent(userAgent)
);

export const shouldStartExpandedOnLaunch = (
  environment: StartupWindowEnvironment,
): boolean => isPackagedWindowsDesktop(environment);

export const getStartupAutoMinimizeGraceMs = (
  environment: StartupWindowEnvironment,
): number => (
  isPackagedWindowsDesktop(environment)
    ? PACKAGED_WINDOWS_STARTUP_IDLE_GRACE_MS
    : 0
);
