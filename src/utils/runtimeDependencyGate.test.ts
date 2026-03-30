import { describe, expect, it } from "vitest";

import type { RuntimeDependencyStatusSnapshot } from "../types/runtimeDependencies";
import {
  getRuntimeGateHeadline,
  hasMissingManagedRuntimeComponents,
  shouldAutoStartManagedRuntimeBootstrapOnStartup,
} from "./runtimeDependencyGate";

const readyEntry = {
  state: "ready" as const,
  source: "managed" as const,
  path: "C:/runtime/tool",
  error: null,
};

const missingEntry = {
  state: "missing" as const,
  source: null,
  path: null,
  error: "Missing runtime",
};

const createStatus = (
  overrides: Partial<RuntimeDependencyStatusSnapshot> = {},
): RuntimeDependencyStatusSnapshot => ({
  ytDlp: readyEntry,
  galleryDl: readyEntry,
  ffmpeg: readyEntry,
  deno: readyEntry,
  ...overrides,
});

const translateKey = (key: string): string => key;

describe("hasMissingManagedRuntimeComponents", () => {
  it("returns false when only bundled yt-dlp is missing", () => {
    expect(hasMissingManagedRuntimeComponents(createStatus({
      ytDlp: missingEntry,
    }))).toBe(false);
  });

  it("returns true when any managed runtime is missing", () => {
    expect(hasMissingManagedRuntimeComponents(createStatus({
      ffmpeg: missingEntry,
    }))).toBe(true);
    expect(hasMissingManagedRuntimeComponents(createStatus({
      deno: missingEntry,
    }))).toBe(true);
  });
});

describe("shouldAutoStartManagedRuntimeBootstrapOnStartup", () => {
  it("auto starts after first paint when managed runtimes are missing", () => {
    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: false,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus({
        ffmpeg: missingEntry,
      }),
      gatePhase: "idle",
      isWindowReadyForStartupBootstrap: true,
    })).toBe(true);
  });

  it("blocks auto bootstrap after startup already triggered once in the current session", () => {
    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: false,
      hasTriggeredStartupBootstrap: true,
      runtimeDependencyStatus: createStatus({
        ffmpeg: missingEntry,
      }),
      gatePhase: "idle",
      isWindowReadyForStartupBootstrap: true,
    })).toBe(false);
  });

  it("does not auto bootstrap during initial mount, while the window is still compact, during active download, or when managed runtimes are ready", () => {
    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: true,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus({
        ffmpeg: missingEntry,
      }),
      gatePhase: "idle",
      isWindowReadyForStartupBootstrap: true,
    })).toBe(false);

    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: false,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus({
        ffmpeg: missingEntry,
      }),
      gatePhase: "idle",
      isWindowReadyForStartupBootstrap: false,
    })).toBe(false);

    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: false,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus({
        ffmpeg: missingEntry,
      }),
      gatePhase: "downloading",
      isWindowReadyForStartupBootstrap: true,
    })).toBe(false);

    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: false,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus(),
      gatePhase: "idle",
      isWindowReadyForStartupBootstrap: true,
    })).toBe(false);
  });
});

describe("getRuntimeGateHeadline", () => {
  it("falls back to the readable missing headline when gate phase is idle or unavailable", () => {
    expect(getRuntimeGateHeadline(translateKey, null)).toBe("app.runtime.phaseTitle.missing");

    expect(getRuntimeGateHeadline(translateKey, {
      phase: "idle",
      missingComponents: ["ffmpeg"],
      lastError: null,
      updatedAtMs: 1,
      currentComponent: null,
      currentStage: null,
      progressPercent: null,
      downloadedBytes: null,
      totalBytes: null,
      nextComponent: "ffmpeg",
    })).toBe("app.runtime.phaseTitle.missing");
  });

  it("prefers the active component label when a runtime component is currently being processed", () => {
    expect(getRuntimeGateHeadline(translateKey, {
      phase: "downloading",
      missingComponents: ["ffmpeg"],
      lastError: null,
      updatedAtMs: 1,
      currentComponent: "ffmpeg",
      currentStage: "downloading",
      progressPercent: 42,
      downloadedBytes: 42,
      totalBytes: 100,
      nextComponent: "deno",
    })).toBe("app.runtime.component.ffmpeg");
  });
});
