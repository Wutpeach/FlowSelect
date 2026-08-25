import type {
  DiagnosticConclusion,
  DiagnosticFact,
  DiagnosticsSnapshot,
} from "../types/diagnostics";

export type DiagnosticsPresentationState = "idle" | "loading" | "ready" | "partial" | "error";

export const diagnosticConclusionTone = (
  conclusion: DiagnosticConclusion,
): "accent" | "danger" | "muted" => {
  if (conclusion === "available") return "accent";
  if (conclusion === "degraded" || conclusion === "unavailable") return "danger";
  return "muted";
};

export const diagnosticFactText = <T>(fact: DiagnosticFact<T>): string => (
  fact.value == null ? "—" : String(fact.value)
);

export const diagnosticsPresentationState = (
  snapshot: DiagnosticsSnapshot | null,
  loading: boolean,
  error: string | null,
): DiagnosticsPresentationState => {
  if (loading) return "loading";
  if (error) return "error";
  if (!snapshot) return "idle";
  const conclusions = [
    snapshot.runtimeGate.conclusion,
    snapshot.outputDirectory.exists.conclusion,
    snapshot.outputDirectory.accessible.conclusion,
    snapshot.outputDirectory.writable.conclusion,
    snapshot.browserBridge.listener.conclusion,
    snapshot.downloads.active.conclusion,
    snapshot.downloads.pending.conclusion,
    ...snapshot.runtimes.map((runtime) => runtime.version.conclusion),
  ];
  // A disconnected Browser Bridge client is optional: the listener remains
  // usable and the report should stay ready when every required fact is ready.
  return conclusions.some((conclusion) => conclusion !== "available") ? "partial" : "ready";
};
