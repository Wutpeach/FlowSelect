import { describe, expect, it } from "vitest";

import {
  DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS,
  DEFERRED_STARTUP_INITIALIZATION_DELAY_MS,
  getDeferredStartupInitializationDelayMs,
  STARTUP_AUTO_RUNTIME_BOOTSTRAP_DELAY_MS,
  shouldStartExpandedOnLaunch,
} from "./startupWindowState";

describe("startup window state", () => {
  it("starts packaged Windows launches expanded and defers non-critical startup work", () => {
    const environment = {
      protocol: "file:",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41.0.4",
    };

    expect(shouldStartExpandedOnLaunch(environment)).toBe(true);
    expect(getDeferredStartupInitializationDelayMs(environment)).toBe(
      DEFERRED_STARTUP_INITIALIZATION_DELAY_MS,
    );
  });

  it("keeps the same expanded startup behavior in Electron dev and returns no delay for plain web", () => {
    expect(shouldStartExpandedOnLaunch({
      protocol: "http:",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41.0.4",
    })).toBe(true);

    expect(getDeferredStartupInitializationDelayMs({
      protocol: "http:",
      userAgent: "Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36",
    })).toBe(0);
  });

  it("keeps bootstrap work later than the initial deferred-start gate", () => {
    expect(DEFERRED_STARTUP_INITIALIZATION_DELAY_MS).toBeGreaterThan(0);
    expect(DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS).toBeGreaterThan(0);
    expect(STARTUP_AUTO_RUNTIME_BOOTSTRAP_DELAY_MS)
      .toBeGreaterThanOrEqual(DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS);
  });
});
