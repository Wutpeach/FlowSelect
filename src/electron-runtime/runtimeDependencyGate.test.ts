import { describe, expect, it } from "vitest";

import type { RuntimeDependencyStatusSnapshot } from "../types/runtimeDependencies";
import { createRuntimeDependencyResolver } from "./runtimeDependencyGate";

const readyEntry = {
  state: "ready" as const,
  source: "bundled" as const,
  path: "D:/runtime/tool",
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
  ffmpeg: { ...readyEntry, source: "managed" as const },
  deno: { ...readyEntry, source: "managed" as const },
  ...overrides,
});

describe("createRuntimeDependencyResolver", () => {
  it("fails the gate when bundled gallery-dl is missing", () => {
    const resolver = createRuntimeDependencyResolver(
      createStatus({
        galleryDl: {
          ...missingEntry,
          error: "Missing bundled gallery-dl runtime",
        },
      }),
      () => createStatus(),
    );

    expect(resolver.getGateState()).toMatchObject({
      phase: "failed",
      lastError: "Missing bundled gallery-dl runtime",
    });
  });

  it("reports ready when bundled runtimes are present and managed runtimes are healthy", () => {
    const resolver = createRuntimeDependencyResolver(
      createStatus(),
      () => createStatus(),
    );

    expect(resolver.getGateState()).toMatchObject({
      phase: "ready",
      missingComponents: [],
      lastError: null,
    });
  });
});
