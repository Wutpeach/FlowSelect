import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";
import { buildEnginePlansFromStrategy } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";

const isYouTubeUrl = (value: string | undefined): boolean =>
  Boolean(value && (value.includes("youtube.com/") || value.includes("youtu.be/")));

export const youtubeProvider: SiteProvider = {
  id: "youtube",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "youtube" || isYouTubeUrl(input.pageUrl) || isYouTubeUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const strategy = getRuntimeManualSiteStrategy("youtube");
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: "youtube",
      originalUrl: input.url,
      pageUrl: input.pageUrl,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl,
      priority: 100,
      candidates: input.videoCandidates ?? [],
      selectionScope: input.selectionScope,
      ytdlpQuality: input.ytdlpQuality,
      preferredFormat: "best",
    };
    return {
      providerId: "youtube",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: buildEnginePlansFromStrategy(strategy, input.url),
    };
  },
};
