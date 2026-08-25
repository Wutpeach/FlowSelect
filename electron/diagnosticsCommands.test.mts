import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { createDiagnosticsCommandController } from "./diagnosticsCommands.mjs";
import { dispatchRendererCommandToControllers } from "./rendererCommandControllerRegistry.mjs";

const snapshot = {
  generatedAt: "2026-08-25T00:00:00.000Z",
  environment: {},
  runtimes: [],
  runtimeGate: {},
  outputDirectory: {},
  browserBridge: {},
  downloads: {},
} as never;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("createDiagnosticsCommandController", () => {
  it("exposes exactly one payload-free read-only diagnostics command", async () => {
    const getDiagnosticsSnapshot = vi.fn(async () => snapshot);
    const controller = createDiagnosticsCommandController({ getDiagnosticsSnapshot });

    expect(controller.supports("get_read_only_diagnostics")).toBe(true);
    expect(controller.supports("get_runtime_dependency_status")).toBe(false);
    await expect(controller.invoke("get_read_only_diagnostics", { ignored: true }))
      .resolves.toBe(snapshot);
    expect(getDiagnosticsSnapshot).toHaveBeenCalledOnce();
  });

  it("preserves a collector failure without dispatching a second action", async () => {
    const failure = new Error("diagnostics failed");
    const getDiagnosticsSnapshot = vi.fn(async () => {
      throw failure;
    });
    const controller = createDiagnosticsCommandController({ getDiagnosticsSnapshot });

    await expect(controller.invoke("get_read_only_diagnostics")).rejects.toBe(failure);
    expect(getDiagnosticsSnapshot).toHaveBeenCalledOnce();
  });

  it("wins before a later runtime-owning controller can be constructed", async () => {
    const controller = createDiagnosticsCommandController({
      getDiagnosticsSnapshot: vi.fn(async () => snapshot),
    });
    const laterGetter = vi.fn(() => ({
      supports: vi.fn(() => false),
      invoke: vi.fn(),
    }));

    await expect(dispatchRendererCommandToControllers(
      [() => controller, laterGetter],
      "get_read_only_diagnostics",
    )).resolves.toMatchObject({ handled: true, value: snapshot });
    expect(laterGetter).not.toHaveBeenCalled();
  });

  it("uses the existing generic preload command transport and remains JSON-serializable", () => {
    const preload = readFileSync(path.join(repoRoot, "electron", "preload.mts"), "utf8");
    const typedBridge = readFileSync(path.join(repoRoot, "src", "types", "electronBridge.ts"), "utf8");

    expect(preload).toContain('invoke("ameow:command:invoke", { command, payload })');
    expect(typedBridge).toContain('"get_read_only_diagnostics"');
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
