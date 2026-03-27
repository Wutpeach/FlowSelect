import { describe, expect, it } from "vitest";

import type { RuntimeDependencyStatusSnapshot } from "../types/runtimeDependencies";
import {
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
  ffmpeg: readyEntry,
  deno: readyEntry,
  pinterestDownloader: readyEntry,
  ...overrides,
});

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
    expect(hasMissingManagedRuntimeComponents(createStatus({
      pinterestDownloader: missingEntry,
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
    })).toBe(false);
  });

  it("does not auto bootstrap during initial mount, active download, or when managed runtimes are ready", () => {
    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: true,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus({
        ffmpeg: missingEntry,
      }),
      gatePhase: "idle",
    })).toBe(false);

    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: false,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus({
        ffmpeg: missingEntry,
      }),
      gatePhase: "downloading",
    })).toBe(false);

    expect(shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount: false,
      hasTriggeredStartupBootstrap: false,
      runtimeDependencyStatus: createStatus(),
      gatePhase: "idle",
    })).toBe(false);
  });
});
