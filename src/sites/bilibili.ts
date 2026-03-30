import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";

const BILIBILI_HOST_PATTERN = /(bilibili\.com|b23\.tv|bilivideo\.com)/i;

const isBilibiliUrl = (value: string | undefined): boolean => (
  Boolean(value && BILIBILI_HOST_PATTERN.test(value))
);

export const bilibiliProvider: SiteProvider = {
  id: "bilibili",
  matches(input: RawDownloadInput): boolean {
    return isBilibiliUrl(input.pageUrl) || isBilibiliUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: "bilibili",
      originalUrl: input.url,
      pageUrl: input.pageUrl,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl,
      priority: 84,
      candidates: input.videoCandidates ?? [],
      selectionScope: input.selectionScope,
      ytdlpQuality: input.ytdlpQuality,
      preferredFormat: "best",
      clipStartSec: input.clipStartSec,
      clipEndSec: input.clipEndSec,
    };

    return {
      providerId: "bilibili",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: [
        {
          engine: "yt-dlp",
          priority: 90,
          when: "primary",
          reason: "Bilibili downloads rely on yt-dlp extraction with canonical current-item URLs",
          sourceUrl: input.url,
          fallbackOn: "any",
        },
      ],
    };
  },
};
