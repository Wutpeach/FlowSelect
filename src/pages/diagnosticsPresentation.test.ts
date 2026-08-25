import { describe, expect, it } from "vitest";

import {
  diagnosticConclusionTone,
  diagnosticFactText,
  diagnosticsPresentationState,
} from "./diagnosticsPresentation";
import type { DiagnosticsSnapshot } from "../types/diagnostics";

const available = { origin: "observed", conclusion: "available", value: true, summary: null } as const;

const readySnapshot = {
  runtimeGate: available,
  outputDirectory: {
    exists: available,
    accessible: available,
    writable: available,
  },
  browserBridge: {
    listener: available,
    connectedClients: { origin: "observed", conclusion: "unavailable", value: 0, summary: null },
  },
  downloads: {
    active: available,
    pending: available,
  },
  runtimes: [{ version: available }],
} as unknown as DiagnosticsSnapshot;

describe("diagnostics presentation", () => {
  it("covers idle, loading, error, ready, and partial report states", () => {
    expect(diagnosticsPresentationState(null, false, null)).toBe("idle");
    expect(diagnosticsPresentationState(null, true, null)).toBe("loading");
    expect(diagnosticsPresentationState(null, false, "failed")).toBe("error");
    expect(diagnosticsPresentationState(readySnapshot, false, null)).toBe("ready");
    expect(diagnosticsPresentationState({
      ...readySnapshot,
      runtimes: [{ version: { origin: "probed", conclusion: "not_verified", value: null, summary: null } }],
    } as unknown as DiagnosticsSnapshot, false, null)).toBe("partial");
  });

  it("never reports ready when a required headline fact is degraded or unavailable", () => {
    expect(diagnosticsPresentationState({
      ...readySnapshot,
      runtimeGate: { ...available, conclusion: "unavailable" },
    } as unknown as DiagnosticsSnapshot, false, null)).toBe("partial");
    expect(diagnosticsPresentationState({
      ...readySnapshot,
      runtimeGate: { ...available, conclusion: "degraded" },
    } as unknown as DiagnosticsSnapshot, false, null)).toBe("partial");
    expect(diagnosticsPresentationState({
      ...readySnapshot,
      outputDirectory: {
        ...readySnapshot.outputDirectory,
        accessible: { ...available, conclusion: "degraded" },
      },
    } as unknown as DiagnosticsSnapshot, false, null)).toBe("partial");
    expect(diagnosticsPresentationState({
      ...readySnapshot,
      outputDirectory: {
        ...readySnapshot.outputDirectory,
        writable: { ...available, conclusion: "unavailable" },
      },
    } as unknown as DiagnosticsSnapshot, false, null)).toBe("partial");
    expect(diagnosticsPresentationState({
      ...readySnapshot,
      browserBridge: {
        ...readySnapshot.browserBridge,
        listener: { ...available, conclusion: "degraded" },
      },
    } as unknown as DiagnosticsSnapshot, false, null)).toBe("partial");
  });

  it("keeps an otherwise complete report ready when no optional Browser Bridge client is connected", () => {
    expect(readySnapshot.browserBridge.connectedClients.conclusion).toBe("unavailable");
    expect(diagnosticsPresentationState(readySnapshot, false, null)).toBe("ready");
  });

  it("uses diagnostic values only and never exposes backend summaries as UI copy", () => {
    expect(diagnosticFactText({
      origin: "probed",
      conclusion: "degraded",
      value: null,
      summary: "backend-only English detail",
    })).toBe("—");
    expect(diagnosticFactText({
      origin: "probed",
      conclusion: "available",
      value: "1.2.3",
      summary: "backend-only English detail",
    })).toBe("1.2.3");
  });

  it("keeps degraded and unavailable states visibly distinct from unknown evidence", () => {
    expect(diagnosticConclusionTone("available")).toBe("accent");
    expect(diagnosticConclusionTone("degraded")).toBe("danger");
    expect(diagnosticConclusionTone("unavailable")).toBe("danger");
    expect(diagnosticConclusionTone("unknown")).toBe("muted");
    expect(diagnosticConclusionTone("not_verified")).toBe("muted");
  });
});
