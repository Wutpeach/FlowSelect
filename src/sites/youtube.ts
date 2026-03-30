import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";

const isYouTubeUrl = (value: string | undefined): boolean =>
  Boolean(value && (value.includes("youtube.com/") || value.includes("youtu.be/")));

export const youtubeProvider: SiteProvider = {
  id: "youtube",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "youtube" || isYouTubeUrl(input.pageUrl) || isYouTubeUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
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
      engines: [
        {
          engine: "yt-dlp",
          priority: 100,
          when: "primary",
          reason: "YouTube downloads are extractor-first and best handled by yt-dlp",
          sourceUrl: input.url,
          fallbackOn: "any",
        },
      ],
    };
  },
};
