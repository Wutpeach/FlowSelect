import type {
  MediaCandidate,
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";

const isPinterestUrl = (value: string | undefined): boolean =>
  Boolean(value && /pinterest\./i.test(value));

const isDirectPinterestAsset = (value: string): boolean =>
  /\/videos\/iht\/expmp4\//i.test(value) || /\.mp4(?:$|\?)/i.test(value);

const isPinterestHintCandidate = (candidate: MediaCandidate): boolean =>
  isDirectPinterestAsset(candidate.url) || /(\.m3u8|\.cmfv)(?:$|\?)/i.test(candidate.url);

const directSourceFromPinterest = (input: RawDownloadInput): string | undefined => {
  if (input.videoUrl && isDirectPinterestAsset(input.videoUrl)) {
    return input.videoUrl;
  }
  return input.videoCandidates?.find((candidate) => isDirectPinterestAsset(candidate.url))?.url;
};

const pinterestCandidates = (input: RawDownloadInput): MediaCandidate[] =>
  (input.videoCandidates ?? []).filter(isPinterestHintCandidate);

export const pinterestProvider: SiteProvider = {
  id: "pinterest",
  matches(input: RawDownloadInput): boolean {
    return isPinterestUrl(input.pageUrl) || isPinterestUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const directSource = directSourceFromPinterest(input);
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: "pinterest",
      originalUrl: input.url,
      pageUrl: input.pageUrl,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl,
      priority: 95,
      candidates: pinterestCandidates(input),
      selectionScope: input.selectionScope,
      ytdlpQuality: input.ytdlpQuality,
      preferredFormat: "mp4",
    };

    return {
      providerId: "pinterest",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: directSource
        ? [
            {
              engine: "direct",
              priority: 100,
              when: "primary",
              reason: "Verified Pinterest direct media asset is available",
              sourceUrl: directSource,
              fallbackOn: "any",
            },
            {
              engine: "gallery-dl",
              priority: 90,
              when: "fallback",
              reason: "Use gallery-dl as the maintained Pinterest extractor path",
              sourceUrl: input.pageUrl ?? input.url,
              fallbackOn: "any",
            },
            {
              engine: "yt-dlp",
              priority: 60,
              when: "fallback",
              reason: "Fallback to yt-dlp when gallery-dl cannot resolve the pin",
              sourceUrl: input.pageUrl ?? input.url,
              fallbackOn: "any",
            },
          ]
        : [
            {
              engine: "gallery-dl",
              priority: 100,
              when: "primary",
              reason: "Pinterest is primarily handled by gallery-dl",
              sourceUrl: input.pageUrl ?? input.url,
              fallbackOn: "any",
            },
            {
              engine: "yt-dlp",
              priority: 60,
              when: "fallback",
              reason: "Fallback to yt-dlp for Pinterest edge cases",
              sourceUrl: input.pageUrl ?? input.url,
              fallbackOn: "any",
            },
          ],
    };
  },
};
