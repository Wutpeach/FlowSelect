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

export const shouldStartExpandedOnLaunch = (
  environment: StartupWindowEnvironment,
): boolean => {
  void environment;
  return false;
};

export const getStartupAutoMinimizeGraceMs = (
  environment: StartupWindowEnvironment,
): number => {
  void environment;
  return 0;
};

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
