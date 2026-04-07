import { describe, expect, it } from "vitest";

import {
  APP_STABLE_UPDATE_ENDPOINT,
  resolveLatestPrereleaseUpdateManifestUrlFromReleases,
  shouldReceivePrereleaseAppUpdates,
} from "./appUpdate.mjs";

describe("shouldReceivePrereleaseAppUpdates", () => {
  it("only enables the prerelease channel when the config flag is true", () => {
    expect(shouldReceivePrereleaseAppUpdates({ receivePrereleaseUpdates: true })).toBe(true);
    expect(shouldReceivePrereleaseAppUpdates({ receivePrereleaseUpdates: false })).toBe(false);
    expect(shouldReceivePrereleaseAppUpdates({})).toBe(false);
  });
});

describe("resolveLatestPrereleaseUpdateManifestUrlFromReleases", () => {
  it("picks the first prerelease that publishes a latest.json asset", () => {
    expect(resolveLatestPrereleaseUpdateManifestUrlFromReleases([
      {
        prerelease: true,
        draft: false,
        assets: [
          { name: "notes.txt", browser_download_url: "https://example.com/notes.txt" },
          { name: "latest.json", browser_download_url: "https://example.com/rc/latest.json" },
        ],
      },
      {
        prerelease: true,
        draft: false,
        assets: [
          { name: "latest.json", browser_download_url: "https://example.com/older/latest.json" },
        ],
      },
    ])).toBe("https://example.com/rc/latest.json");
  });

  it("skips drafts and prereleases without a manifest asset", () => {
    expect(resolveLatestPrereleaseUpdateManifestUrlFromReleases([
      {
        prerelease: true,
        draft: true,
        assets: [
          { name: "latest.json", browser_download_url: "https://example.com/draft/latest.json" },
        ],
      },
      {
        prerelease: true,
        draft: false,
        assets: [
          { name: "installer.exe", browser_download_url: "https://example.com/rc/setup.exe" },
        ],
      },
      {
        prerelease: true,
        draft: false,
        assets: [
          { name: "latest.json", browser_download_url: "https://example.com/usable/latest.json" },
        ],
      },
    ])).toBe("https://example.com/usable/latest.json");
  });

  it("returns null when no usable prerelease manifest exists", () => {
    expect(resolveLatestPrereleaseUpdateManifestUrlFromReleases([
      { prerelease: false, draft: false, assets: [] },
    ])).toBeNull();
  });
});

describe("APP_STABLE_UPDATE_ENDPOINT", () => {
  it("points to the repo's stable latest manifest", () => {
    expect(APP_STABLE_UPDATE_ENDPOINT.endsWith("/releases/latest/download/latest.json")).toBe(true);
  });
});
