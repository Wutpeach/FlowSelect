type StartupWindowEnvironment = {
  protocol: string;
  userAgent: string;
};

type NativeCompactStartupWindowOptions = {
  innerWidth: number;
  innerHeight: number;
  startsExpandedOnLaunch: boolean;
  isMacOS: boolean;
};

export const NATIVE_COMPACT_STARTUP_WINDOW_SIZE = 80;
const NATIVE_COMPACT_STARTUP_WINDOW_TOLERANCE_PX = 4;

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
  innerWidth,
  innerHeight,
  startsExpandedOnLaunch,
  isMacOS,
}: NativeCompactStartupWindowOptions): boolean => {
  if (startsExpandedOnLaunch || isMacOS) {
    return false;
  }
  if (innerWidth < 1 || innerHeight < 1) {
    return false;
  }

  return innerWidth <= NATIVE_COMPACT_STARTUP_WINDOW_SIZE + NATIVE_COMPACT_STARTUP_WINDOW_TOLERANCE_PX
    && innerHeight <= NATIVE_COMPACT_STARTUP_WINDOW_SIZE + NATIVE_COMPACT_STARTUP_WINDOW_TOLERANCE_PX;
};
