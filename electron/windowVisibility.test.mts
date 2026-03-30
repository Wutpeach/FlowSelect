import { describe, expect, it } from "vitest";

import {
  FORCE_OPAQUE_WINDOW_ARGUMENT,
  FORCE_OPAQUE_WINDOW_ENV,
  PACKAGED_WINDOWS_TRANSPARENT_REVEAL_DELAY_MS,
  WINDOWS_PACKAGED_ZERO_ALPHA_WINDOW_BACKGROUND,
  getPackagedWindowRevealDelayMs,
  resolveMainWindowRevealBounds,
  resolvePackagedWindowsTransparentWindowBackground,
  shouldEnablePackagedStartupDiagnostics,
  shouldUsePackagedWindowsOpaqueWindow,
} from "./windowVisibility.mjs";
import { MAIN_WINDOW_COMPACT_STARTUP_SIZE } from "./startupWindowMode.mjs";

describe("shouldUsePackagedWindowsOpaqueWindow", () => {
  it("keeps transparent parity by default on packaged Windows builds", () => {
    expect(shouldUsePackagedWindowsOpaqueWindow({
      platform: "win32",
      isPackaged: true,
    })).toBe(false);
  });

  it("enables the opaque fallback only when the CLI flag is present", () => {
    expect(shouldUsePackagedWindowsOpaqueWindow({
      platform: "win32",
      isPackaged: true,
      argv: ["FlowSelect.exe", FORCE_OPAQUE_WINDOW_ARGUMENT],
    })).toBe(true);
  });

  it("enables the opaque fallback only when the env flag is present", () => {
    expect(shouldUsePackagedWindowsOpaqueWindow({
      platform: "win32",
      isPackaged: true,
      env: {
        [FORCE_OPAQUE_WINDOW_ENV]: "true",
      },
    })).toBe(true);
  });
});

describe("shouldEnablePackagedStartupDiagnostics", () => {
  it("enables diagnostics for packaged Windows when the CLI flag is present", () => {
    expect(shouldEnablePackagedStartupDiagnostics({
      platform: "win32",
      isPackaged: true,
      argv: ["FlowSelect.exe", "--flowselect-startup-diagnostics"],
    })).toBe(true);
  });

  it("enables diagnostics for packaged Windows when the env flag is truthy", () => {
    expect(shouldEnablePackagedStartupDiagnostics({
      platform: "win32",
      isPackaged: true,
      env: {
        FLOWSELECT_STARTUP_DIAGNOSTICS: "true",
      },
    })).toBe(true);
  });

  it("keeps diagnostics disabled outside packaged Windows", () => {
    expect(shouldEnablePackagedStartupDiagnostics({
      platform: "darwin",
      isPackaged: true,
      argv: ["FlowSelect.app", "--flowselect-startup-diagnostics"],
    })).toBe(false);
  });
});

describe("getPackagedWindowRevealDelayMs", () => {
  it("adds a short reveal delay for transparent packaged Windows windows", () => {
    expect(getPackagedWindowRevealDelayMs({
      platform: "win32",
      isPackaged: true,
      transparentWindow: true,
    })).toBe(PACKAGED_WINDOWS_TRANSPARENT_REVEAL_DELAY_MS);
  });

  it("skips the reveal delay for opaque or non-packaged windows", () => {
    expect(getPackagedWindowRevealDelayMs({
      platform: "win32",
      isPackaged: true,
      transparentWindow: false,
    })).toBe(0);

    expect(getPackagedWindowRevealDelayMs({
      platform: "darwin",
      isPackaged: true,
      transparentWindow: true,
    })).toBe(0);
  });
});

describe("resolvePackagedWindowsTransparentWindowBackground", () => {
  it("returns a near-transparent themed fallback color for packaged Windows", () => {
    expect(resolvePackagedWindowsTransparentWindowBackground("black")).toBe("#01201E25");
    expect(resolvePackagedWindowsTransparentWindowBackground("white")).toBe("#01E3E3E3");
  });

  it("can force a true zero-alpha background for the packaged transparent main-window experiment", () => {
    expect(resolvePackagedWindowsTransparentWindowBackground("black", true)).toBe(
      WINDOWS_PACKAGED_ZERO_ALPHA_WINDOW_BACKGROUND,
    );
    expect(resolvePackagedWindowsTransparentWindowBackground("white", true)).toBe(
      WINDOWS_PACKAGED_ZERO_ALPHA_WINDOW_BACKGROUND,
    );
  });
});

describe("resolveMainWindowRevealBounds", () => {
  const display = {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  };

  it("keeps sufficiently visible bounds while enforcing the minimum startup size", () => {
    expect(resolveMainWindowRevealBounds({
      bounds: {
        x: 100,
        y: 120,
        width: 160,
        height: 180,
      },
      displays: [display],
      fallbackDisplay: display,
    })).toEqual({
      x: 100,
      y: 120,
      width: 200,
      height: 200,
    });
  });

  it("can preserve compact startup bounds when a smaller minimum size is requested", () => {
    expect(resolveMainWindowRevealBounds({
      bounds: {
        x: 100,
        y: 120,
        width: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
        height: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
      },
      displays: [display],
      fallbackDisplay: display,
      minimumWidth: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
      minimumHeight: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
    })).toEqual({
      x: 100,
      y: 120,
      width: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
      height: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
    });
  });

  it("recenters the main window when the saved bounds are effectively off-screen", () => {
    expect(resolveMainWindowRevealBounds({
      bounds: {
        x: 5000,
        y: 5000,
        width: 200,
        height: 200,
      },
      displays: [display],
      fallbackDisplay: display,
    })).toEqual({
      x: 860,
      y: 440,
      width: 200,
      height: 200,
    });
  });

  it("can force a centered first reveal even when the current bounds are visible", () => {
    expect(resolveMainWindowRevealBounds({
      bounds: {
        x: 24,
        y: 32,
        width: 200,
        height: 200,
      },
      displays: [display],
      fallbackDisplay: display,
      forceCenter: true,
    })).toEqual({
      x: 860,
      y: 440,
      width: 200,
      height: 200,
    });
  });

  it("can keep a compact centered startup reveal when the smaller minimum is intentional", () => {
    expect(resolveMainWindowRevealBounds({
      bounds: {
        x: 24,
        y: 32,
        width: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
        height: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
      },
      displays: [display],
      fallbackDisplay: display,
      forceCenter: true,
      minimumWidth: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
      minimumHeight: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
    })).toEqual({
      x: 920,
      y: 500,
      width: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
      height: MAIN_WINDOW_COMPACT_STARTUP_SIZE,
    });
  });
});
