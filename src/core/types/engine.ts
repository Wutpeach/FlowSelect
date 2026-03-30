import type { DownloadResultPayload, DownloadProgressPayload } from "../../types/videoRuntime.js";
import type { DownloadRuntimeError } from "../errors/download-runtime-error.js";
import type { DownloadIntent } from "./download-intent.js";
import type { EngineId, EnginePlan, ResolvedDownloadPlan } from "./engine-plan.js";

export type EngineExecutionContext = {
  traceId: string;
  plan: ResolvedDownloadPlan;
  enginePlan: EnginePlan;
  intent: DownloadIntent;
  outputDir: string;
  outputStem: string;
  config: Record<string, unknown>;
  binaries: import("../../electron-runtime/contracts.js").RuntimeBinaryPaths;
  abortSignal: AbortSignal;
  fetch?: typeof fetch;
  onProgress(payload: DownloadProgressPayload): void | Promise<void>;
};

export interface DownloadEngine {
  readonly id: EngineId;
  validateIntent(intent: DownloadIntent, plan: EnginePlan): DownloadRuntimeError | null;
  execute(context: EngineExecutionContext): Promise<DownloadResultPayload>;
}
