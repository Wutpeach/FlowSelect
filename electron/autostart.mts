import type {
  LaunchItems,
  LoginItemSettings,
  LoginItemSettingsOptions,
  Settings as LoginItemSettingsInput,
} from "electron";

const WINDOWS_AUTOSTART_ENTRY_NAME = "FlowSelect";

const normalizeWindowsRegistryValue = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/^"+|"+$/g, "").toLowerCase();
};

const findMatchingWindowsLaunchItems = (
  launchItems: LaunchItems[],
  execPath: string,
): LaunchItems[] => {
  const normalizedPath = normalizeWindowsRegistryValue(execPath);
  const pathMatches = launchItems.filter((launchItem) => (
    normalizeWindowsRegistryValue(launchItem.path) === normalizedPath
  ));

  if (pathMatches.length > 0) {
    return pathMatches;
  }

  const normalizedName = normalizeWindowsRegistryValue(WINDOWS_AUTOSTART_ENTRY_NAME);
  return launchItems.filter((launchItem) => (
    normalizeWindowsRegistryValue(launchItem.name) === normalizedName
  ));
};

export const getWindowsAutostartQuery = (execPath: string): LoginItemSettingsOptions => ({
  path: execPath,
  args: [],
});

export const buildWindowsAutostartSettings = (
  execPath: string,
  enabled: boolean,
): LoginItemSettingsInput => ({
  openAtLogin: enabled,
  enabled,
  path: execPath,
  args: [],
  name: WINDOWS_AUTOSTART_ENTRY_NAME,
});

export const isWindowsAutostartEnabled = (
  loginItemSettings: LoginItemSettings,
  execPath: string,
): boolean => {
  if (!loginItemSettings.executableWillLaunchAtLogin) {
    return false;
  }

  const matchingLaunchItems = findMatchingWindowsLaunchItems(
    loginItemSettings.launchItems,
    execPath,
  );

  if (matchingLaunchItems.length === 0) {
    return true;
  }

  return matchingLaunchItems.some((launchItem) => launchItem.enabled);
};
