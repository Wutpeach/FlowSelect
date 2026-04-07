export const APP_UPDATE_PRERELEASE_CONFIG_KEY = "receivePrereleaseUpdates";

export type DesktopAppConfig = Record<string, unknown>;

export const parseDesktopAppConfig = (configStr: string): DesktopAppConfig => {
  try {
    const parsed = JSON.parse(configStr) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as DesktopAppConfig;
  } catch {
    return {};
  }
};

export const resolveReceivePrereleaseUpdates = (
  config: Record<string, unknown>,
): boolean => config[APP_UPDATE_PRERELEASE_CONFIG_KEY] === true;

export const resolveReceivePrereleaseUpdatesFromConfigString = (
  configStr: string,
): boolean => resolveReceivePrereleaseUpdates(parseDesktopAppConfig(configStr));
