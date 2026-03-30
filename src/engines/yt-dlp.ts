import {
  DownloadRuntimeError,
  type DownloadEngine,
  type DownloadIntent,
  type EngineExecutionContext,
  type EnginePlan,
} from "../core/index.js";
import { runYtDlpDownload } from "../electron-runtime/ytDlpDownload.js";

export class YtDlpEngine implements DownloadEngine {
  readonly id = "yt-dlp" as const;

  validateIntent(intent: DownloadIntent, plan: EnginePlan) {
    if (!plan.sourceUrl && !intent.pageUrl && !intent.originalUrl) {
      return new DownloadRuntimeError(
        "E_INVALID_ENGINE_PLAN",
        "yt-dlp requires a page or source URL",
        {
          context: { siteId: intent.siteId, plan },
        },
      );
    }
    return null;
  }

  async execute(context: EngineExecutionContext) {
    return await runYtDlpDownload(context);
  }
}
