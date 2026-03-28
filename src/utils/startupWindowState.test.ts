import { describe, expect, it } from "vitest";

import {
  getStartupAutoMinimizeGraceMs,
  shouldStartExpandedOnLaunch,
} from "./startupWindowState";

describe("startup window state", () => {
  it("keeps packaged Windows launches on the compact startup path", () => {
    const environment = {
      protocol: "file:",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41.0.4",
    };

    expect(shouldStartExpandedOnLaunch(environment)).toBe(false);
    expect(getStartupAutoMinimizeGraceMs(environment)).toBe(0);
  });

  it("keeps the same compact startup behavior in dev and on other platforms", () => {
    expect(shouldStartExpandedOnLaunch({
      protocol: "http:",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41.0.4",
    })).toBe(false);

    expect(getStartupAutoMinimizeGraceMs({
      protocol: "file:",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/41.0.4",
    })).toBe(0);
  });
});
