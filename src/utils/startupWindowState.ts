type StartupWindowEnvironment = {
  protocol: string;
  userAgent: string;
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
