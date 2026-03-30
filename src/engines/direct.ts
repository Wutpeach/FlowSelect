import {
  DownloadRuntimeError,
  type DownloadEngine,
  type DownloadIntent,
  type EngineExecutionContext,
  type EnginePlan,
} from "../core/index.js";
import { runDirectVideoDownload } from "../electron-runtime/directDownload.js";

const isDirectMediaUrl = (value: string | undefined): boolean =>
  Boolean(value && /\.(mp4|mov|m4v|jpe?g|png|webp)(?:$|\?)/i.test(value));

export class DirectEngine implements DownloadEngine {
  readonly id = "direct" as const;

  validateIntent(intent: DownloadIntent, plan: EnginePlan) {
    const sourceUrl = plan.sourceUrl
      || (intent.type === "direct" ? intent.directUrl : undefined)
      || intent.pageUrl
      || intent.originalUrl;
    if (!isDirectMediaUrl(sourceUrl)) {
      return new DownloadRuntimeError(
        "E_DIRECT_SOURCE_REQUIRED",
        "Direct engine requires a direct media URL",
        {
          context: { siteId: intent.siteId, sourceUrl },
        },
      );
    }
    return null;
  }

  async execute(context: EngineExecutionContext) {
    return await runDirectVideoDownload(context);
  }
}
