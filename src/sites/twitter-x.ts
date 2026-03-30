import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";

const TWITTER_X_HOST_PATTERN = /(twitter\.com|x\.com)/i;

const isTwitterXUrl = (value: string | undefined): boolean => (
  Boolean(value && TWITTER_X_HOST_PATTERN.test(value))
);

export const twitterXProvider: SiteProvider = {
  id: "twitter-x",
  matches(input: RawDownloadInput): boolean {
    return isTwitterXUrl(input.pageUrl) || isTwitterXUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: "twitter-x",
      originalUrl: input.url,
      pageUrl: input.pageUrl,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl,
      priority: 78,
      candidates: input.videoCandidates ?? [],
      selectionScope: input.selectionScope,
      ytdlpQuality: input.ytdlpQuality,
      preferredFormat: "best",
      clipStartSec: input.clipStartSec,
      clipEndSec: input.clipEndSec,
    };

    return {
      providerId: "twitter-x",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: [
        {
          engine: "yt-dlp",
          priority: 85,
          when: "primary",
          reason: "Twitter/X status downloads rely on yt-dlp extraction",
          sourceUrl: input.url,
          fallbackOn: "any",
        },
      ],
    };
  },
};
