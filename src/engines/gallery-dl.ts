import {
  DownloadRuntimeError,
  type DownloadEngine,
  type DownloadIntent,
  type EngineExecutionContext,
  type EnginePlan,
} from "../core/index.js";
import { runGalleryDlDownload } from "../electron-runtime/galleryDlDownload.js";

export class GalleryDlEngine implements DownloadEngine {
  readonly id = "gallery-dl" as const;

  validateIntent(intent: DownloadIntent, plan: EnginePlan) {
    const sourceUrl = plan.sourceUrl ?? intent.pageUrl ?? intent.originalUrl;
    if (!sourceUrl) {
      return new DownloadRuntimeError(
        "E_INVALID_ENGINE_PLAN",
        "gallery-dl requires a source URL",
        {
          context: { siteId: intent.siteId, plan },
        },
      );
    }
    return null;
  }

  async execute(context: EngineExecutionContext) {
    return await runGalleryDlDownload(context);
  }
}
