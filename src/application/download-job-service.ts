import {
  DownloadRuntimeError,
  type DownloadResult,
  type EngineExecutionContext,
  type EngineId,
  type EnginePlan,
  type RawDownloadInput,
  type ResolvedDownloadPlan,
} from "../core/index.js";
import {
  DownloadOrchestrator,
  type OrchestratorAttemptReport,
  type PreparedDownloadRequest,
} from "../orchestration/download-orchestrator.js";
import {
  NOOP_DIAGNOSTIC_SINK,
  attachDownloadTerminalDiagnosticSummary,
  createDownloadDiagnosticRecorder,
  resolveDownloadDiagnosticCategory,
  type DownloadDiagnosticCycle,
  type DownloadDiagnosticNetwork,
  type DownloadDiagnosticRecorder,
  type DownloadDiagnosticsOptions,
  type DownloadTerminalDiagnosticSummary,
} from "./download-diagnostics.js";

/**
 * Application-owned ordinary download Job lifecycle. Electron-neutral: it
 * coordinates prepare-once, one opaque Job context, attempt execution, typed
 * auth recovery and the single terminal outcome. The Job context is generic to
 * Application; the outer adapter places the resolved NetworkRoute, output
 * values and diagnostic callbacks in it. Infrastructure dependencies (route
 * resolution, site sessions, binaries, filesystem, protocol) are supplied
 * exclusively through the injected functions.
 */

/** Decision the injected recovery reports; Application decides the retry. */
export type DownloadJobAuthRecoveryResult = {
  shouldRetry: boolean;
};

/** Typed auth-required failure context handed to the injected recovery. */
export type DownloadJobAuthRecoveryContext<TJobContext> = {
  /** The exact plan object the failing attempt executed (never re-resolved). */
  plan: ResolvedDownloadPlan;
  /** The engine of the attempt that produced the typed auth failure. */
  chosenEngine: EngineId | null;
  /** The exact opaque Job context shared by every attempt. */
  jobContext: TJobContext;
  error: DownloadRuntimeError;
};

/**
 * One terminal outcome per ordinary Job: success, failure, cancellation and
 * auth recovery/retry all converge here. No renderer/protocol DTOs.
 */
export type DownloadJobOutcome<TJobContext> = {
  result: DownloadResult;
  /** The exact plan object reused by every attempt of this Job. */
  plan: ResolvedDownloadPlan;
  /** The engine of the attempt that produced the terminal result. */
  chosenEngine: EngineId | null;
  /** The exact opaque Job context reused by every attempt of this Job. */
  jobContext: TJobContext;
  /** Bounded safe summary; present only when diagnostics were enabled. */
  diagnosticSummary?: DownloadTerminalDiagnosticSummary;
};

export type DownloadJobServiceOptions<
  TJobContext,
  TExecutionContext extends EngineExecutionContext,
> = {
  orchestrator: DownloadOrchestrator<TExecutionContext>;
  /**
   * Builds the one opaque Job context per Job (called exactly once). The
   * outer adapter places the already-resolved NetworkRoute, output/config
   * values and diagnostic callbacks in it.
   */
  createJobContext(
    prepared: PreparedDownloadRequest,
  ): TJobContext | Promise<TJobContext>;
  /**
   * Builds the per-attempt execution context. Called for every actual engine
   * attempt with the same Job context and the same plan object; it may read
   * refreshed attempt auth material without replacing plan/Job context.
   */
  buildAttemptContext(
    jobContext: TJobContext,
    plan: ResolvedDownloadPlan,
    enginePlan: EnginePlan,
  ): TExecutionContext | Promise<TExecutionContext>;
  /** Optional sanitized attempt facts, captured after binding and before execution. */
  inspectAttemptRuntime?(
    context: TExecutionContext,
  ): { candidate: "bundled"; runtimeSetId: string } | undefined;
  /**
   * Called once immediately after `prepare()` resolves. The outer adapter uses
   * it to capture the exact plan for telemetry/execution metadata.
   */
  onPrepared?(prepared: PreparedDownloadRequest): void | Promise<void>;
  /**
   * Best-effort pre-download session refresh; a refresh failure never aborts
   * the Job.
   */
  refreshSiteSessionBeforeDownload?(
    prepared: PreparedDownloadRequest,
  ): Promise<void>;
  /**
   * Typed auth-required recovery, invoked at most once per Job. The retry
   * decision stays here: retry reuses the same prepared plan and Job context
   * without Site or NetworkRoute resolution.
   */
  handleAuthRequiredFailure?(
    context: DownloadJobAuthRecoveryContext<TJobContext>,
  ): Promise<DownloadJobAuthRecoveryResult | void>;
  /**
   * Infrastructure-owned error normalization (raw evidence classification,
   * abort mapping). Application consumes the stable typed classification only
   * and never parses raw messages.
   */
  classifyFailure?(error: unknown): DownloadRuntimeError;
  /**
   * Optional infrastructure-injected successful-result settlement, invoked at
   * most once per Job after engine/fallback/auth-recovery success and before
   * the diagnostic success terminal. It may perform fallible output
   * settlement (rename, metadata reads/cleanup) and returns the final
   * successful result; a thrown settlement error is normalized through
   * `classifyFailure` and terminates the Job as one typed failure instead of
   * ever recording a success terminal.
   */
  settleSuccessfulResult?(
    outcome: DownloadJobOutcome<TJobContext>,
  ): DownloadResult | Promise<DownloadResult>;
  /**
   * Optional P6B diagnostics. Absent → a no-op sink is used and behavior,
   * protocol output and telemetry stay unchanged. Diagnostic failures never
   * change the download outcome.
   */
  diagnostics?: DownloadDiagnosticsOptions;
};

const defaultClassifyFailure = (error: unknown): DownloadRuntimeError => {
  if (error instanceof DownloadRuntimeError) {
    return error;
  }
  return new DownloadRuntimeError(
    "E_EXECUTION_FAILED",
    error instanceof Error ? error.message : String(error ?? "Unknown error"),
    { cause: error },
  );
};

export class DownloadJobService<
  TJobContext,
  TExecutionContext extends EngineExecutionContext = EngineExecutionContext,
> {
  constructor(
    private readonly options: DownloadJobServiceOptions<
      TJobContext,
      TExecutionContext
    >,
  ) {}

  /**
   * Executes one ordinary Job and returns its single terminal outcome, or
   * throws the typed failure that terminates it. `prepare()` runs exactly
   * once; `createJobContext()` runs exactly once; auth recovery runs at most
   * once and only for a typed `auth_required` failure while the Job is not
   * cancelled. Emits exactly one diagnostic terminal event (succeeded /
   * failed / cancelled); a success after cancel intent stays a success.
   */
  async executeJob(
    request: RawDownloadInput,
    signal: AbortSignal,
  ): Promise<DownloadJobOutcome<TJobContext>> {
    const recorder = createDownloadDiagnosticRecorder({
      traceId: this.options.diagnostics?.traceId ?? "",
      sink: this.options.diagnostics?.sink ?? NOOP_DIAGNOSTIC_SINK,
    });
    const classify = this.options.classifyFailure ?? defaultClassifyFailure;

    try {
      const outcome = await this.executeJobCore(request, signal, recorder);
      const diagnosticSummary = recorder.recordTerminal({ outcome: "succeeded" });
      return this.options.diagnostics
        ? { ...outcome, diagnosticSummary }
        : outcome;
    } catch (error) {
      // Exactly one terminal failure event; the original thrown error is
      // preserved for the caller. Cancellation is a distinct terminal.
      const failure = classify(error);
      const diagnosticSummary = recorder.recordTerminal({
        outcome: failure.classification === "cancelled" ? "cancelled" : "failed",
        errorCode: failure.code,
        classification: failure.classification,
        category: resolveDownloadDiagnosticCategory(failure),
      });
      if (this.options.diagnostics) {
        attachDownloadTerminalDiagnosticSummary(failure, diagnosticSummary);
      }
      // Non-attempt errors (onPrepared, createJobContext, auth-recovery
      // handler) keep their original identity; diagnostics only observe them.
      // Typed runtime failures keep the classified instance so the terminal
      // summary stays attached for the caller.
      throw error instanceof DownloadRuntimeError ? failure : error;
    }
  }

  private async executeJobCore(
    request: RawDownloadInput,
    signal: AbortSignal,
    recorder: DownloadDiagnosticRecorder,
  ): Promise<DownloadJobOutcome<TJobContext>> {
    const prepared = this.options.orchestrator.prepare(request);
    recorder.recordPrepared(prepared.plan);
    await this.options.onPrepared?.(prepared);

    if (this.options.refreshSiteSessionBeforeDownload) {
      try {
        await this.options.refreshSiteSessionBeforeDownload(prepared);
      } catch {
        // Best-effort pre-download refresh: the Job must still execute; a
        // refresh failure is not a terminal outcome.
      }
    }

    const jobContext = await this.options.createJobContext(prepared);

    let chosenEngine: EngineId | null = null;
    let cycle: DownloadDiagnosticCycle = "initial";
    const buildAttemptContext = async (
      plan: ResolvedDownloadPlan,
      enginePlan: EnginePlan,
    ): Promise<TExecutionContext> => {
      chosenEngine = enginePlan.engine;
      const context = await this.options.buildAttemptContext(jobContext, plan, enginePlan);
      const runtime = this.options.inspectAttemptRuntime?.(context);
      if (runtime) {
        recorder.recordAttemptRuntime(enginePlan.engine, runtime);
      }
      return context;
    };
    const resolveNetworkMetadata = (
      engineId: EngineId,
    ): DownloadDiagnosticNetwork | undefined => {
      try {
        return this.options.diagnostics?.resolveNetworkMetadata?.(engineId);
      } catch {
        // Route metadata is diagnostics-only: a throwing resolver must not
        // corrupt the attempt/outcome flow; the attempt is recorded without it.
        return undefined;
      }
    };
    const reportAttempt = (attemptReport: OrchestratorAttemptReport): void => {
      switch (attemptReport.kind) {
        case "attempt_started":
          recorder.recordAttemptStarted(attemptReport.engineId, cycle);
          break;
        case "attempt_succeeded":
          recorder.recordAttemptSucceeded(
            attemptReport.engineId,
            resolveNetworkMetadata(attemptReport.engineId),
          );
          break;
        case "attempt_failed":
          recorder.recordAttemptFailed(
            attemptReport.engineId,
            attemptReport.errorCode,
            attemptReport.classification,
            attemptReport.diagnosticCategory
              ?? resolveDownloadDiagnosticCategory({
                code: attemptReport.errorCode,
                classification: attemptReport.classification,
                diagnosticCategory: undefined,
              }),
            resolveNetworkMetadata(attemptReport.engineId),
          );
          break;
        case "fallback":
          recorder.recordFallbackStarted(
            attemptReport.fromEngineId,
            attemptReport.toEngineId,
          );
          break;
      }
    };
    const executeAttempts = (): Promise<DownloadResult> =>
      this.options.orchestrator.executePrepared(
        prepared,
        buildAttemptContext,
        reportAttempt,
      );
    const classify = this.options.classifyFailure ?? defaultClassifyFailure;
    // Attempts resolve to exactly one result, with at most one auth-recovery
    // retry. Auth recovery applies only to engine attempt failures.
    let result: DownloadResult;
    try {
      result = await executeAttempts();
    } catch (error) {
      const firstFailure = classify(error);
      if (
        firstFailure.classification !== "auth_required"
        || signal.aborted
        || !this.options.handleAuthRequiredFailure
      ) {
        throw firstFailure;
      }

      recorder.recordAuthRecoveryStarted();
      let recovery: DownloadJobAuthRecoveryResult | void;
      try {
        recovery = await this.options.handleAuthRequiredFailure({
          plan: prepared.plan,
          chosenEngine,
          jobContext,
          error: firstFailure,
        });
      } catch (recoveryError) {
        recorder.recordAuthRecoveryFinished("failed");
        // The handler is not an engine attempt: propagate its error verbatim;
        // the outer terminal recording observes but never rewraps it.
        throw recoveryError;
      }
      const retry = recovery?.shouldRetry === true && !signal.aborted;
      recorder.recordAuthRecoveryFinished(retry ? "retry" : "declined");
      if (!retry) {
        throw firstFailure;
      }

      // Retry reuses the exact same prepared plan and Job context; only the
      // per-attempt context may observe refreshed attempt auth. A second
      // typed failure is terminal: recovery runs at most once.
      cycle = "auth_recovery";
      try {
        result = await executeAttempts();
      } catch (retryError) {
        throw classify(retryError);
      }
    }

    const outcome: DownloadJobOutcome<TJobContext> = {
      result,
      plan: prepared.plan,
      chosenEngine,
      jobContext,
    };
    // Exactly one successful-result settlement invocation, after the
    // auth-recovery decision has fully settled and before the diagnostic
    // success terminal. Output settlement is not an engine attempt: its
    // failure is normalized through the same typed classifier and goes
    // straight to the outer terminal catch, so it can never trigger
    // auth recovery even if the classifier labels it auth_required.
    if (this.options.settleSuccessfulResult) {
      try {
        outcome.result = await this.options.settleSuccessfulResult(outcome);
      } catch (settlementError) {
        throw classify(settlementError);
      }
    }
    return outcome;
  }
}
