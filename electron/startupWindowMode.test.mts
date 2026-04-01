import { describe, expect, it } from "vitest";

import {
  MAIN_WINDOW_COMPACT_STARTUP_SIZE,
  MAIN_WINDOW_FULL_SIZE,
  buildStartupWindowModeArgument,
  parseStartupWindowModeArgument,
  resolveMainWindowInitialSize,
  resolveMainWindowStartupMode,
} from "./startupWindowMode.mjs";

describe("startupWindowMode", () => {
  it("uses full startup mode for the first Windows main-window reveal", () => {
    expect(resolveMainWindowStartupMode({
      platform: "win32",
      hasShownMainWindowOnce: false,
    })).toBe("full");
  });

  it("keeps full startup mode after the main window has already been shown or on other platforms", () => {
    expect(resolveMainWindowStartupMode({
      platform: "win32",
      hasShownMainWindowOnce: true,
    })).toBe("full");

    expect(resolveMainWindowStartupMode({
      platform: "darwin",
      hasShownMainWindowOnce: false,
    })).toBe("full");
  });

  it("maps startup mode to the correct initial main-window size", () => {
    expect(resolveMainWindowInitialSize("compact")).toBe(MAIN_WINDOW_COMPACT_STARTUP_SIZE);
    expect(resolveMainWindowInitialSize("full")).toBe(MAIN_WINDOW_FULL_SIZE);
  });

  it("round-trips the BrowserWindow startup-mode argument", () => {
    expect(parseStartupWindowModeArgument([
      "FlowSelect.exe",
      buildStartupWindowModeArgument("compact"),
    ])).toBe("compact");

    expect(parseStartupWindowModeArgument([
      "FlowSelect.exe",
      buildStartupWindowModeArgument("full"),
    ])).toBe("full");
  });

  it("falls back to full mode for missing or invalid startup-mode arguments", () => {
    expect(parseStartupWindowModeArgument(["FlowSelect.exe"])).toBe("full");
    expect(parseStartupWindowModeArgument([
      "FlowSelect.exe",
      "--flowselect-startup-window-mode=unexpected",
    ])).toBe("full");
  });
});
