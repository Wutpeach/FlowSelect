import type {
  MediaCandidate,
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";

const XIAOHONGSHU_HOST_PATTERN = /(xiaohongshu\.com|xhslink\.com|xhscdn\.com)/i;

const isXiaohongshuUrl = (value: string | undefined): boolean => (
  Boolean(value && XIAOHONGSHU_HOST_PATTERN.test(value))
);

const isDirectXiaohongshuAsset = (value: string | undefined): boolean => (
  Boolean(value && /xhscdn\.com/i.test(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value))
);

const isXiaohongshuHintCandidate = (candidate: MediaCandidate): boolean => (
  XIAOHONGSHU_HOST_PATTERN.test(candidate.url)
  && /\.(mp4|mov|m4v|m3u8)(?:$|\?)/i.test(candidate.url)
);

const pickDirectSource = (input: RawDownloadInput): string | undefined => {
  if (isDirectXiaohongshuAsset(input.videoUrl)) {
    return input.videoUrl;
  }
  const candidateSource = input.videoCandidates?.find(
    (candidate) => isDirectXiaohongshuAsset(candidate.url),
  )?.url;
  if (candidateSource) {
    return candidateSource;
  }
  return isDirectXiaohongshuAsset(input.url) ? input.url : undefined;
};

const xiaohongshuCandidates = (input: RawDownloadInput): MediaCandidate[] =>
  (input.videoCandidates ?? []).filter(isXiaohongshuHintCandidate);

export const xiaohongshuProvider: SiteProvider = {
  id: "xiaohongshu",
  matches(input: RawDownloadInput): boolean {
    return isXiaohongshuUrl(input.pageUrl) || isXiaohongshuUrl(input.url) || Boolean(pickDirectSource(input));
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const directSource = pickDirectSource(input);
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: "xiaohongshu",
      originalUrl: input.url,
      pageUrl: input.pageUrl,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl,
      priority: 88,
      candidates: xiaohongshuCandidates(input),
      selectionScope: input.selectionScope,
      ytdlpQuality: input.ytdlpQuality,
      preferredFormat: "mp4",
      clipStartSec: input.clipStartSec,
      clipEndSec: input.clipEndSec,
    };

    return {
      providerId: "xiaohongshu",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: directSource
        ? [
            {
              engine: "direct",
              priority: 100,
              when: "primary",
              reason: "Verified Xiaohongshu direct media asset is already available",
              sourceUrl: directSource,
              fallbackOn: "any",
            },
            {
              engine: "yt-dlp",
              priority: 60,
              when: "fallback",
              reason: "Use yt-dlp page extraction when the direct media asset fails",
              sourceUrl: input.pageUrl ?? input.url,
              fallbackOn: "any",
            },
          ]
        : [
            {
              engine: "yt-dlp",
              priority: 80,
              when: "primary",
              reason: "No verified direct Xiaohongshu media asset is available",
              sourceUrl: input.pageUrl ?? input.url,
              fallbackOn: "any",
            },
          ],
    };
  },
};
