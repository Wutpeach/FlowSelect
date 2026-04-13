import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";
import { buildEnginePlansFromStrategy } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";

export const genericProvider: SiteProvider = {
  id: "generic",
  matches(): boolean {
    return true;
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: input.siteHint?.trim() || "generic",
      originalUrl: input.url,
      pageUrl: input.pageUrl,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl,
      priority: 10,
      candidates: input.videoCandidates ?? [],
      selectionScope: input.selectionScope,
      ytdlpQuality: input.ytdlpQuality,
      preferredFormat: "best",
    };
    const strategy = getRuntimeManualSiteStrategy("generic");

    return {
      providerId: "generic",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: buildEnginePlansFromStrategy(strategy, input.pageUrl ?? input.url),
    };
  },
};
