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

const extractXiaohongshuNoteId = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(
      /\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)|^\/user\/profile\/[^/?#]+\/([a-zA-Z0-9]+)(?:[/?#]|$)/i,
    );
    return match?.[1] ?? match?.[2] ?? null;
  } catch {
    return null;
  }
};

const canonicalizeXiaohongshuNoteUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const noteId = extractXiaohongshuNoteId(value);
  if (!noteId) {
    return value;
  }

  return `https://www.xiaohongshu.com/explore/${noteId}`;
};

const isDirectXiaohongshuAsset = (value: string | undefined): boolean => (
  Boolean(value && /xhscdn\.com/i.test(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value))
);

const isXiaohongshuHintCandidate = (candidate: MediaCandidate): boolean => (
  candidate.mediaType !== "image"
  && XIAOHONGSHU_HOST_PATTERN.test(candidate.url)
  && /\.(mp4|mov|m4v|m3u8)(?:$|\?)/i.test(candidate.url)
);

const isDirectVideoCandidate = (candidate: MediaCandidate): boolean => (
  candidate.mediaType !== "image"
  && XIAOHONGSHU_HOST_PATTERN.test(candidate.url)
  && isDirectXiaohongshuAsset(candidate.url)
);

const pickDirectSource = (input: RawDownloadInput): string | undefined => {
  if (isDirectXiaohongshuAsset(input.videoUrl)) {
    return input.videoUrl;
  }
  const candidateSource = input.videoCandidates?.find(
    isDirectVideoCandidate,
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
    return input.siteHint === "xiaohongshu"
      || isXiaohongshuUrl(input.pageUrl)
      || isXiaohongshuUrl(input.url)
      || Boolean(pickDirectSource(input));
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const directSource = pickDirectSource(input);
    const canonicalPageUrl = canonicalizeXiaohongshuNoteUrl(input.pageUrl ?? input.url);
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
            },
          ]
        : [
            {
              engine: "yt-dlp",
              priority: 80,
              when: "primary",
              reason: "No verified direct Xiaohongshu media asset is available",
              sourceUrl: canonicalPageUrl ?? input.pageUrl ?? input.url,
              fallbackOn: "any",
            },
          ],
    };
  },
};
