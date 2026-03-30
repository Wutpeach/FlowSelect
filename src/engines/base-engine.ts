import type { DownloadEngine } from "../core/index.js";

export abstract class BaseDownloadEngine implements DownloadEngine {
  abstract readonly id: import("../core").EngineId;
  abstract validateIntent(
    intent: import("../core").DownloadIntent,
    plan: import("../core").EnginePlan,
  ): import("../core").DownloadRuntimeError | null;
  abstract execute(
    context: import("../core").EngineExecutionContext,
  ): Promise<import("../types/videoRuntime").DownloadResultPayload>;
}
