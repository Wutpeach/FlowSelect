import type { LaunchItems, LoginItemSettings } from "electron";
import { describe, expect, it } from "vitest";

import {
  buildWindowsAutostartSettings,
  getWindowsAutostartQuery,
  isWindowsAutostartEnabled,
} from "./autostart.mjs";

const EXEC_PATH = "C:\\Program Files\\FlowSelect\\FlowSelect.exe";

const createLaunchItem = (overrides: Partial<LaunchItems> = {}): LaunchItems => ({
  name: "FlowSelect",
  path: EXEC_PATH,
  args: [],
  scope: "user",
  enabled: true,
  ...overrides,
});

const createLoginItemSettings = (
  overrides: Partial<LoginItemSettings> = {},
): LoginItemSettings => ({
  openAtLogin: false,
  openAsHidden: false,
  wasOpenedAtLogin: false,
  wasOpenedAsHidden: false,
  restoreState: false,
  status: "not-found",
  executableWillLaunchAtLogin: false,
  launchItems: [],
  ...overrides,
});

describe("getWindowsAutostartQuery", () => {
  it("uses the current executable path with empty args", () => {
    expect(getWindowsAutostartQuery(EXEC_PATH)).toEqual({
      path: EXEC_PATH,
      args: [],
    });
  });
});

describe("buildWindowsAutostartSettings", () => {
  it("uses a stable registry entry name and startup-approved flag when enabling", () => {
    expect(buildWindowsAutostartSettings(EXEC_PATH, true)).toEqual({
      openAtLogin: true,
      enabled: true,
      path: EXEC_PATH,
      args: [],
      name: "FlowSelect",
    });
  });

  it("keeps the same registry entry details when disabling", () => {
    expect(buildWindowsAutostartSettings(EXEC_PATH, false)).toEqual({
      openAtLogin: false,
      enabled: false,
      path: EXEC_PATH,
      args: [],
      name: "FlowSelect",
    });
  });
});

describe("isWindowsAutostartEnabled", () => {
  it("returns false when Windows would not launch the current executable", () => {
    expect(
      isWindowsAutostartEnabled(
        createLoginItemSettings({
          openAtLogin: true,
          launchItems: [createLaunchItem()],
        }),
        EXEC_PATH,
      ),
    ).toBe(false);
  });

  it("returns true when Electron confirms the executable will launch and launchItems are empty", () => {
    expect(
      isWindowsAutostartEnabled(
        createLoginItemSettings({
          openAtLogin: true,
          executableWillLaunchAtLogin: true,
        }),
        EXEC_PATH,
      ),
    ).toBe(true);
  });

  it("matches launch items by path even when Windows changes quoting or casing", () => {
    expect(
      isWindowsAutostartEnabled(
        createLoginItemSettings({
          openAtLogin: true,
          executableWillLaunchAtLogin: true,
          launchItems: [
            createLaunchItem({
              path: "\"c:\\PROGRAM FILES\\FlowSelect\\FlowSelect.exe\"",
            }),
          ],
        }),
        EXEC_PATH,
      ),
    ).toBe(true);
  });

  it("returns false when the matching launch item is disabled", () => {
    expect(
      isWindowsAutostartEnabled(
        createLoginItemSettings({
          openAtLogin: true,
          executableWillLaunchAtLogin: true,
          launchItems: [createLaunchItem({ enabled: false })],
        }),
        EXEC_PATH,
      ),
    ).toBe(false);
  });

  it("falls back to the stable registry entry name when Electron does not return a path match", () => {
    expect(
      isWindowsAutostartEnabled(
        createLoginItemSettings({
          openAtLogin: true,
          executableWillLaunchAtLogin: true,
          launchItems: [
            createLaunchItem({
              path: "C:\\Users\\Administrator\\AppData\\Local\\FlowSelect\\FlowSelectStub.exe",
            }),
          ],
        }),
        EXEC_PATH,
      ),
    ).toBe(true);
  });
});
