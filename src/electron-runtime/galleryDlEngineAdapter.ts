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
  GalleryDlRuntimeDependencies,
} from "./engineExecutionContext.js";
import { runGalleryDlDownload } from "./galleryDlDownload.js";

/**
 * Infrastructure adapter for the gallery-dl engine. Static runtime dependencies
 * (the narrowed gallery-dl set: only the gallery-dl executable) are injected
 * through construction; per-job execution data is declared explicitly through
 * the port generic. The adapter owns no CLI/process logic itself and never
 * widens the context it receives.
 */
export class GalleryDlEngineAdapter implements DownloadEngine<EngineExecutionContextWithRuntime> {
  readonly id = "gallery-dl" as const;
  readonly capabilities: DownloadCapabilities = { advancedQuality: false };

  constructor(private readonly dependencies: { binaries: GalleryDlRuntimeDependencies }) {}

  supports(
    plan: ResolvedDownloadPlan,
    context: EngineSupportContext,
  ) {
    const enginePlan = plan.engines.find((candidate) => candidate.engine === this.id);
    const sourceUrl = enginePlan?.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
    if (!sourceUrl) {
      return {
        supported: false as const,
        reason: "gallery-dl requires a source URL",
        error: new DownloadRuntimeError(
          "E_INVALID_ENGINE_PLAN",
          "gallery-dl requires a source URL",
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
      return await runGalleryDlDownload({
        ...context,
        binaries: this.dependencies.binaries,
      });
    } finally {
      await context.runtimeSetLease?.release();
    }
  }
}
