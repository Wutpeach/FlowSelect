import type { RuntimeDependencyGateStatePayload } from "./runtimeDependencies.js";

/** Where the value came from; this is intentionally independent of health. */
export type DiagnosticEvidenceOrigin = "configured" | "observed" | "probed";

/** What the application can safely conclude from the evidence it has. */
export type DiagnosticConclusion =
  | "available"
  | "degraded"
  | "unavailable"
  | "unknown"
  | "not_verified";

export type DiagnosticFact<T> = {
  origin: DiagnosticEvidenceOrigin;
  conclusion: DiagnosticConclusion;
  value: T | null;
  summary: string | null;
};

export type DiagnosticsRuntimeId =
  | "python"
  | "ytDlp"
  | "galleryDl"
  | "ffmpeg"
  | "ffprobe"
  | "deno";

export type DiagnosticsRuntimeSnapshot = {
  id: DiagnosticsRuntimeId;
  expectedSource: DiagnosticFact<"bundled" | "managed">;
  currentSource: DiagnosticFact<"bundled" | "managed">;
  executablePresent: DiagnosticFact<boolean>;
  version: DiagnosticFact<string>;
};

export type DiagnosticsSnapshot = {
  generatedAt: string;
  environment: {
    appVersion: DiagnosticFact<string>;
    platform: DiagnosticFact<string>;
    architecture: DiagnosticFact<string>;
    packaged: DiagnosticFact<boolean>;
    runtimeTarget: DiagnosticFact<string>;
  };
  runtimes: DiagnosticsRuntimeSnapshot[];
  runtimeGate: DiagnosticFact<RuntimeDependencyGateStatePayload>;
  outputDirectory: {
    configured: DiagnosticFact<boolean>;
    exists: DiagnosticFact<boolean>;
    accessible: DiagnosticFact<boolean>;
    writable: DiagnosticFact<boolean>;
  };
  browserBridge: {
    listener: DiagnosticFact<boolean>;
    connectedClients: DiagnosticFact<number>;
    pendingRequests: DiagnosticFact<number>;
  };
  downloads: {
    active: DiagnosticFact<number>;
    pending: DiagnosticFact<number>;
    recentDiagnostics: DiagnosticFact<string[]>;
  };
};
