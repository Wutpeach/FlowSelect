import { describe, expect, it } from "vitest";

import {
  PACKAGED_WINDOWS_STARTUP_IDLE_GRACE_MS,
  getStartupAutoMinimizeGraceMs,
  isPackagedWindowsDesktop,
  shouldStartExpandedOnLaunch,
} from "./startupWindowState";

describe("isPackagedWindowsDesktop", () => {
  it("recognizes packaged Windows renderer launches", () => {
    expect(isPackagedWindowsDesktop({
      protocol: "file:",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41.0.4",
    })).toBe(true);
  });

  it("ignores dev-server and non-Windows launches", () => {
    expect(isPackagedWindowsDesktop({
      protocol: "http:",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41.0.4",
    })).toBe(false);

    expect(isPackagedWindowsDesktop({
      protocol: "file:",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/41.0.4",
    })).toBe(false);
  });
});

describe("startup window state", () => {
  it("starts expanded and delays idle minimize on packaged Windows", () => {
    const environment = {
      protocol: "file:",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41.0.4",
    };

    expect(shouldStartExpandedOnLaunch(environment)).toBe(true);
    expect(getStartupAutoMinimizeGraceMs(environment)).toBe(
      PACKAGED_WINDOWS_STARTUP_IDLE_GRACE_MS,
    );
  });

  it("keeps the existing compact startup behavior elsewhere", () => {
    const environment = {
      protocol: "http:",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/41.0.4",
    };

    expect(shouldStartExpandedOnLaunch(environment)).toBe(false);
    expect(getStartupAutoMinimizeGraceMs(environment)).toBe(0);
  });
});
