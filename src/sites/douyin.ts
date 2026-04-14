import type {
  DownloadIntent,
  MediaCandidate,
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";
import { buildEnginePlansFromStrategySources } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";

const DOUYIN_HOST_PATTERN = /(douyin\.com|douyinvod\.com|douyincdn\.com|bytecdn|bytedance)/i;

const isDouyinUrl = (value: string | undefined): boolean => Boolean(value && DOUYIN_HOST_PATTERN.test(value));

const isDirectVideoUrl = (value: string | undefined): boolean => (
  Boolean(value && DOUYIN_HOST_PATTERN.test(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value))
);

const isDirectVideoCandidate = (candidate: MediaCandidate): boolean => isDirectVideoUrl(candidate.url);

const pickDirectSource = (input: RawDownloadInput): string | undefined => {
  if (isDirectVideoUrl(input.videoUrl)) {
    return input.videoUrl;
  }
  const candidateSource = input.videoCandidates?.find(isDirectVideoCandidate)?.url;
  if (candidateSource) {
    return candidateSource;
  }
  return isDirectVideoUrl(input.url) ? input.url : undefined;
};

const buildIntent = (input: RawDownloadInput): DownloadIntent => ({
  type: "video",
  siteId: "douyin",
  originalUrl: input.url,
  pageUrl: input.pageUrl,
  title: input.title,
  cookies: input.cookies,
  referer: input.pageUrl,
  priority: 90,
  candidates: input.videoCandidates ?? [],
  selectionScope: input.selectionScope,
  ytdlpQuality: input.ytdlpQuality,
  preferredFormat: "mp4",
});

export const douyinProvider: SiteProvider = {
  id: "douyin",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "douyin"
      || isDouyinUrl(input.pageUrl)
      || isDouyinUrl(input.url)
      || Boolean(pickDirectSource(input));
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const directSource = pickDirectSource(input);
    const intent = buildIntent(input) as VideoDownloadIntent;
    const strategy = getRuntimeManualSiteStrategy("douyin");
    const pageSourceUrl = input.pageUrl ?? input.url;

    return {
      providerId: "douyin",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: buildEnginePlansFromStrategySources(strategy, {
        direct: directSource
          ? {
              sourceUrl: directSource,
              reason: "Verified Douyin direct media candidate is available",
            }
          : undefined,
        "yt-dlp": {
          sourceUrl: pageSourceUrl,
          reason: directSource
            ? "Use yt-dlp page extraction when direct media fails"
            : "No direct media candidate is available",
        },
      }),
    };
  },
};
