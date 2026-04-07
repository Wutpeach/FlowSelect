import { resolveReceivePrereleaseUpdates } from "../src/updates/appUpdatePreferences.js";

type GitHubReleaseAsset = {
  name?: unknown;
  browser_download_url?: unknown;
};

type GitHubRelease = {
  prerelease?: unknown;
  draft?: unknown;
  assets?: unknown;
};

export const APP_GITHUB_REPOSITORY = "Wutpeach/FlowSelect";
export const APP_RELEASES_URL = `https://github.com/${APP_GITHUB_REPOSITORY}/releases`;
export const APP_RELEASES_API = `https://api.github.com/repos/${APP_GITHUB_REPOSITORY}/releases`;
export const APP_UPDATE_MANIFEST_ASSET_NAME = "latest.json";
export const APP_STABLE_UPDATE_ENDPOINT =
  `https://github.com/${APP_GITHUB_REPOSITORY}/releases/latest/download/${APP_UPDATE_MANIFEST_ASSET_NAME}`;

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const shouldReceivePrereleaseAppUpdates = (config: Record<string, unknown>): boolean => (
  resolveReceivePrereleaseUpdates(config)
);

export const resolveLatestPrereleaseUpdateManifestUrlFromReleases = (
  releases: unknown,
): string | null => {
  if (!Array.isArray(releases)) {
    return null;
  }

  for (const release of releases) {
    const parsedRelease = release as GitHubRelease;
    if (parsedRelease.prerelease !== true || parsedRelease.draft === true) {
      continue;
    }

    const manifestAsset = Array.isArray(parsedRelease.assets)
      ? parsedRelease.assets.find((asset: GitHubReleaseAsset) => (
        normalizeOptionalString(asset?.name) === APP_UPDATE_MANIFEST_ASSET_NAME
        && normalizeOptionalString(asset?.browser_download_url)
      ))
      : null;
    const manifestUrl = normalizeOptionalString(manifestAsset?.browser_download_url);
    if (manifestUrl) {
      return manifestUrl;
    }
  }

  return null;
};
