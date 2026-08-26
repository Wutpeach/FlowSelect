import {
  DownloadRuntimeError,
  type DownloadDiagnosticCategory,
  type DownloadErrorCode,
  type DownloadFailureClassification,
  type ResolvedDownloadPlan,
} from "../core/index.js";

/**
 * Application-owned download diagnostics (P6B slice B1). Electron-neutral:
 * a closed diagnostic event union, a narrow best-effort sink port, and a
 * per-Job recorder that owns the monotonic attempt identity, the bounded
 * sanitized attempt history, and exactly-one terminal event. Events carry
 * only stable safe facts — never raw request/plan/error/context/message
 * values. No Event Bus, no persistent store, no behavior coupling: every
 * emission is isolated so a failing sink can never change a download.
 */

export type DownloadDiagnosticCycle = "initial" | "auth_recovery";

export type DownloadDiagnosticNetwork = {
  routeKind: "direct" | "proxy" | "complex";
  source: "manual" | "system" | "environment" | "direct" | "fallback";
  consumer: string;
  appliedToEngine: boolean;
  proxyProtocol: "http" | "https" | "socks4" | "socks5" | null;
  failureClassification: string | null;
};

/** Sanitized per-attempt facts. No raw messages, URLs, plans or contexts. */
export type AttemptDiagnosticSummary = {
  attemptIndex: number;
  attemptId: string;
  engineId: string;
  cycle: DownloadDiagnosticCycle;
  outcome: "succeeded" | "failed";
  errorCode: DownloadErrorCode | null;
  classification: DownloadFailureClassification | null;
  category: DownloadDiagnosticCategory | null;
  network?: DownloadDiagnosticNetwork;
  runtimeCandidate?: "bundled";
  runtimeSetId?: string;
};

export type DownloadTerminalDiagnosticSummary = {
  traceId: string;
  status: "succeeded" | "failed" | "cancelled";
  finalEngineId: string | null;
  attemptCount: number;
  attempts: readonly AttemptDiagnosticSummary[];
  finalCode: DownloadErrorCode | null;
  finalClassification: DownloadFailureClassification | null;
  finalCategory: DownloadDiagnosticCategory | null;
};

/** Closed diagnostic event union; sinks accept only these shapes. */
export type DownloadDiagnosticEvent =
  | {
      type: "download.prepared";
      traceId: string;
      providerId: string;
      siteId: string;
      candidateEngineIds: string[];
    }
  | {
      type: "attempt.started";
      traceId: string;
      attemptIndex: number;
      attemptId: string;
      engineId: string;
      cycle: DownloadDiagnosticCycle;
    }
  | {
      type: "attempt.succeeded";
      traceId: string;
      attemptIndex: number;
      attemptId: string;
      engineId: string;
      cycle: DownloadDiagnosticCycle;
      network?: DownloadDiagnosticNetwork;
    }
  | {
      type: "attempt.failed";
      traceId: string;
      attemptIndex: number;
      attemptId: string;
      engineId: string;
      cycle: DownloadDiagnosticCycle;
      errorCode: DownloadErrorCode;
      classification: DownloadFailureClassification;
      category: DownloadDiagnosticCategory;
      network?: DownloadDiagnosticNetwork;
    }
  | {
      type: "fallback.started";
      traceId: string;
      fromEngineId: string;
      toEngineId: string;
    }
  | {
      type: "auth_recovery.started";
      traceId: string;
    }
  | {
      type: "auth_recovery.finished";
      traceId: string;
      result: "retry" | "declined" | "failed";
    }
  | {
      type: "download.succeeded";
      traceId: string;
      attemptCount: number;
      attempts: readonly AttemptDiagnosticSummary[];
      finalEngineId: string | null;
    }
  | {
      type: "download.failed";
      traceId: string;
      errorCode: DownloadErrorCode;
      classification: DownloadFailureClassification;
      category: DownloadDiagnosticCategory;
      cycle: DownloadDiagnosticCycle;
      attemptCount: number;
      attempts: readonly AttemptDiagnosticSummary[];
      finalEngineId: string | null;
    }
  | {
      type: "download.cancelled";
      traceId: string;
      errorCode: DownloadErrorCode;
      classification: DownloadFailureClassification;
      category: DownloadDiagnosticCategory;
      cycle: DownloadDiagnosticCycle;
      attemptCount: number;
      attempts: readonly AttemptDiagnosticSummary[];
      finalEngineId: string | null;
    };

export type DownloadDiagnosticSink = {
  /**
   * Best-effort recording of one diagnostic event. Sync throws and async
   * rejections are isolated by `recordDiagnosticSafely`; a sink failure
   * never changes download control flow.
   */
  record(event: DownloadDiagnosticEvent): void | Promise<void>;
};

/** Default sink: diagnostics off until a caller injects a real one. */
export const NOOP_DIAGNOSTIC_SINK: DownloadDiagnosticSink = {
  record() {
    // no-op
  },
};

/**
 * Isolates every sink failure mode: a synchronous throw from `record`, a
 * rejected promise, and a serializer failure in between. Always resolves.
 */
export const recordDiagnosticSafely = (
  sink: DownloadDiagnosticSink,
  event: DownloadDiagnosticEvent,
): Promise<void> => {
  try {
    return Promise.resolve(sink.record(event)).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
};

export type DownloadDiagnosticsOptions = {
  /** One stable caller-provided correlation identity for the whole Job. */
  traceId: string;
  sink: DownloadDiagnosticSink;
  /** Composition supplies only allowlisted route metadata; never a route. */
  resolveNetworkMetadata?(engineId: string): DownloadDiagnosticNetwork | undefined;
};

export const MAX_ATTEMPT_HISTORY = 8;

export type DownloadTerminalDiagnostic =
  | { outcome: "succeeded" }
  | {
      outcome: "failed" | "cancelled";
      errorCode: DownloadErrorCode;
      classification: DownloadFailureClassification;
      category: DownloadDiagnosticCategory;
    };

export type DownloadDiagnosticRecorder = {
  readonly traceId: string;
  recordPrepared(plan: ResolvedDownloadPlan): void;
  recordAttemptStarted(engineId: string, cycle: DownloadDiagnosticCycle): void;
  recordAttemptRuntime(engineId: string, runtime: { candidate: "bundled"; runtimeSetId: string }): void;
  recordAttemptSucceeded(engineId: string, network?: DownloadDiagnosticNetwork): void;
  recordAttemptFailed(
    engineId: string,
    errorCode: DownloadErrorCode,
    classification: DownloadFailureClassification,
    category: DownloadDiagnosticCategory,
    network?: DownloadDiagnosticNetwork,
  ): void;
  recordFallbackStarted(fromEngineId: string, toEngineId: string): void;
  recordAuthRecoveryStarted(): void;
  recordAuthRecoveryFinished(result: "retry" | "declined" | "failed"): void;
  recordTerminal(terminal: DownloadTerminalDiagnostic): DownloadTerminalDiagnosticSummary;
};

export type CreateDownloadDiagnosticRecorderOptions = {
  traceId: string;
  sink: DownloadDiagnosticSink;
  maxAttemptHistory?: number;
};

const terminalSummaryByError = new WeakMap<
  DownloadRuntimeError,
  DownloadTerminalDiagnosticSummary
>();

export const attachDownloadTerminalDiagnosticSummary = (
  error: DownloadRuntimeError,
  summary: DownloadTerminalDiagnosticSummary,
): void => {
  terminalSummaryByError.set(error, summary);
};

export const getDownloadTerminalDiagnosticSummary = (
  error: DownloadRuntimeError,
): DownloadTerminalDiagnosticSummary | undefined => terminalSummaryByError.get(error);

/** Stable fallback mapping only; no raw message/context parsing. */
export const resolveDownloadDiagnosticCategory = (
  error: Pick<DownloadRuntimeError, "code" | "classification" | "diagnosticCategory">,
): DownloadDiagnosticCategory => {
  if (error.diagnosticCategory) {
    return error.diagnosticCategory;
  }
  if (error.classification === "auth_required" || error.code === "E_AUTH_REQUIRED") {
    return "authentication_required";
  }
  if (error.classification === "cancelled" || error.code === "E_ABORTED") {
    return "cancelled";
  }
  if (
    error.classification === "input_invalid"
    || error.code === "E_NO_PROVIDER_MATCH"
    || error.code === "E_INPUT_INVALID"
    || error.code === "E_INVALID_DOWNLOAD_INPUT"
    || error.code === "E_INVALID_INTENT"
  ) {
    return "site_input";
  }
  if (
    error.code === "E_ENGINE_NOT_FOUND"
    || error.code === "E_ENGINE_UNAVAILABLE"
    || error.code === "E_ENGINE_REJECTED_INTENT"
    || error.code === "E_DIRECT_SOURCE_REQUIRED"
  ) {
    return "engine_unavailable";
  }
  if (error.code === "E_OUTPUT_NOT_FOUND") {
    return "output";
  }
  return "engine_execution";
};

/**
 * Per-Job recorder. Owns the monotonic attempt index (created only for real
 * engine executions), the closed-cycle phase, and the bounded sanitized
 * attempt history snapshot. All emissions are fire-and-forget through
 * `recordDiagnosticSafely`; nothing here can throw or change the download.
 */
export const createDownloadDiagnosticRecorder = (
  options: CreateDownloadDiagnosticRecorderOptions,
): DownloadDiagnosticRecorder => {
  const { traceId, sink } = options;
  const maxAttemptHistory = options.maxAttemptHistory ?? MAX_ATTEMPT_HISTORY;
  const record = (event: DownloadDiagnosticEvent): void => {
    void recordDiagnosticSafely(sink, event);
  };

  let attemptCount = 0;
  let lastAttemptCycle: DownloadDiagnosticCycle = "initial";
  let currentAttempt: AttemptDiagnosticSummary | null = null;
  let terminalSummary: DownloadTerminalDiagnosticSummary | null = null;
  const attempts: AttemptDiagnosticSummary[] = [];
  const pushAttempt = (summary: AttemptDiagnosticSummary): void => {
    attempts.push(summary);
    if (attempts.length > maxAttemptHistory) {
      attempts.shift();
    }
  };

  return {
    traceId,
    recordPrepared(plan) {
      record({
        type: "download.prepared",
        traceId,
        providerId: plan.providerId,
        siteId: plan.intent.siteId,
        candidateEngineIds: plan.engines.map((enginePlan) => enginePlan.engine),
      });
    },
    recordAttemptStarted(engineId, cycle) {
      attemptCount += 1;
      lastAttemptCycle = cycle;
      currentAttempt = {
        attemptIndex: attemptCount,
        attemptId: `${traceId}:${attemptCount}`,
        engineId,
        cycle,
        outcome: "failed",
        errorCode: null,
        classification: null,
        category: null,
      };
      record({
        type: "attempt.started",
        traceId,
        attemptIndex: currentAttempt.attemptIndex,
        attemptId: currentAttempt.attemptId,
        engineId,
        cycle,
      });
    },
    recordAttemptRuntime(engineId, runtime) {
      if (!currentAttempt || currentAttempt.engineId !== engineId) {
        return;
      }
      currentAttempt.runtimeCandidate = runtime.candidate;
      currentAttempt.runtimeSetId = runtime.runtimeSetId;
    },
    recordAttemptSucceeded(engineId, network) {
      if (!currentAttempt || currentAttempt.engineId !== engineId) {
        return;
      }
      currentAttempt.outcome = "succeeded";
      currentAttempt.network = network;
      pushAttempt({ ...currentAttempt });
      record({
        type: "attempt.succeeded",
        traceId,
        attemptIndex: currentAttempt.attemptIndex,
        attemptId: currentAttempt.attemptId,
        engineId,
        cycle: currentAttempt.cycle,
        network,
      });
      currentAttempt = null;
    },
    recordAttemptFailed(engineId, errorCode, classification, category, network) {
      if (!currentAttempt || currentAttempt.engineId !== engineId) {
        return;
      }
      currentAttempt.errorCode = errorCode;
      currentAttempt.classification = classification;
      currentAttempt.category = category;
      currentAttempt.network = network;
      pushAttempt({ ...currentAttempt });
      record({
        type: "attempt.failed",
        traceId,
        attemptIndex: currentAttempt.attemptIndex,
        attemptId: currentAttempt.attemptId,
        engineId,
        cycle: currentAttempt.cycle,
        errorCode,
        classification,
        category,
        network,
      });
      currentAttempt = null;
    },
    recordFallbackStarted(fromEngineId, toEngineId) {
      record({ type: "fallback.started", traceId, fromEngineId, toEngineId });
    },
    recordAuthRecoveryStarted() {
      record({ type: "auth_recovery.started", traceId });
    },
    recordAuthRecoveryFinished(result) {
      record({ type: "auth_recovery.finished", traceId, result });
    },
    recordTerminal(terminal) {
      if (terminalSummary) {
        return terminalSummary;
      }
      const attemptsSnapshot = attempts.slice();
      const finalEngineId = attemptsSnapshot[attemptsSnapshot.length - 1]?.engineId ?? null;
      terminalSummary = {
        traceId,
        status: terminal.outcome,
        finalEngineId,
        attemptCount,
        attempts: attemptsSnapshot,
        finalCode: terminal.outcome === "succeeded" ? null : terminal.errorCode,
        finalClassification: terminal.outcome === "succeeded" ? null : terminal.classification,
        finalCategory: terminal.outcome === "succeeded" ? null : terminal.category,
      };
      if (terminal.outcome === "succeeded") {
        record({
          type: "download.succeeded",
          traceId,
          attemptCount,
          attempts: attemptsSnapshot,
          finalEngineId,
        });
        return terminalSummary;
      }
      record({
        type: terminal.outcome === "cancelled"
          ? "download.cancelled"
          : "download.failed",
        traceId,
        errorCode: terminal.errorCode,
        classification: terminal.classification,
        category: terminal.category,
        cycle: lastAttemptCycle,
        attemptCount,
        attempts: attemptsSnapshot,
        finalEngineId,
      });
      return terminalSummary;
    },
  };
};
