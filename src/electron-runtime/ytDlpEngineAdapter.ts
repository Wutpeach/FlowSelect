import {
  DownloadRuntimeError,
  type DownloadCapabilities,
  type DownloadEngine,
  type DownloadResult,
  type EngineSupportContext,
  type ResolvedDownloadPlan,
} from "../core/index.js";
import type {
  EngineExecutionContextWithRuntime,
  YtDlpRuntimeDependencies,
} from "./engineExecutionContext.js";
import { runYtDlpDownload } from "./ytDlpDownload.js";

/**
 * Infrastructure adapter for the yt-dlp engine. Static runtime dependencies
 * (the narrowed yt-dlp set: ytDlp/ffmpeg/deno) are injected through
 * construction; per-job execution data is declared explicitly through the port
 * generic. The adapter owns no CLI/process logic itself and never widens the
 * context it receives.
 */
export class YtDlpEngineAdapter implements DownloadEngine<EngineExecutionContextWithRuntime> {
  readonly id = "yt-dlp" as const;
  readonly capabilities: DownloadCapabilities = { advancedQuality: true };

  constructor(private readonly dependencies: { binaries: YtDlpRuntimeDependencies }) {}

  supports(
    plan: ResolvedDownloadPlan,
    context: EngineSupportContext,
  ) {
    const enginePlan = plan.engines.find((candidate) => candidate.engine === this.id);
    if (!enginePlan?.sourceUrl && !context.intent.pageUrl && !context.intent.originalUrl) {
      return {
        supported: false as const,
        reason: "yt-dlp requires a page or source URL",
        error: new DownloadRuntimeError(
          "E_INVALID_ENGINE_PLAN",
          "yt-dlp requires a page or source URL",
          {
            context: { siteId: plan.intent.siteId, plan },
          },
        ),
      };
    }
    return { supported: true as const };
  }

  async execute(context: EngineExecutionContextWithRuntime): Promise<DownloadResult> {
    // Explicit composition: the runner invocation input is the declared
    // per-job contract plus this adapter's injected static dependencies.
    try {
      return await runYtDlpDownload({
        ...context,
        binaries: this.dependencies.binaries,
      });
    } finally {
      await context.runtimeSetLease?.release();
    }
  }
}
