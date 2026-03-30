import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";

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
    return {
      providerId: "generic",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: [
        {
          engine: "yt-dlp",
          priority: 50,
          when: "primary",
          reason: "Generic downloads default to yt-dlp",
          sourceUrl: input.pageUrl ?? input.url,
          fallbackOn: "any",
        },
      ],
    };
  },
};
