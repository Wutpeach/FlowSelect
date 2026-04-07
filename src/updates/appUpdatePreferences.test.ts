import { describe, expect, it } from "vitest";

import {
  APP_UPDATE_PRERELEASE_CONFIG_KEY,
  parseDesktopAppConfig,
  resolveReceivePrereleaseUpdates,
  resolveReceivePrereleaseUpdatesFromConfigString,
} from "./appUpdatePreferences";

describe("parseDesktopAppConfig", () => {
  it("returns an empty object for invalid config json", () => {
    expect(parseDesktopAppConfig("{")).toEqual({});
    expect(parseDesktopAppConfig("[]")).toEqual({});
  });

  it("returns the parsed object for valid config json", () => {
    expect(parseDesktopAppConfig(JSON.stringify({ outputPath: "D:/FlowSelect" }))).toEqual({
      outputPath: "D:/FlowSelect",
    });
  });
});

describe("resolveReceivePrereleaseUpdates", () => {
  it("only enables prerelease app updates when the config key is explicitly true", () => {
    expect(resolveReceivePrereleaseUpdates({ [APP_UPDATE_PRERELEASE_CONFIG_KEY]: true })).toBe(true);
    expect(resolveReceivePrereleaseUpdates({ [APP_UPDATE_PRERELEASE_CONFIG_KEY]: false })).toBe(false);
    expect(resolveReceivePrereleaseUpdates({})).toBe(false);
  });

  it("reads the preference safely from raw config strings", () => {
    expect(resolveReceivePrereleaseUpdatesFromConfigString(
      JSON.stringify({ [APP_UPDATE_PRERELEASE_CONFIG_KEY]: true }),
    )).toBe(true);
    expect(resolveReceivePrereleaseUpdatesFromConfigString("{")).toBe(false);
  });
});
