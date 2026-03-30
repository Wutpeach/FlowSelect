import { resolveSiteHint } from "./site-hints.js";
import type { MediaCandidate } from "./types/media-candidate.js";

const QUALITY_SCORE_RULES = [
  { pattern: /(?:^|[^\d])(4320|8k)(?:p|[^\d]|$)/i, score: 4320 },
  { pattern: /(?:^|[^\d])2160(?:p|[^\d]|$)|\b4k\b|\buhd\b/i, score: 2160 },
  { pattern: /(?:^|[^\d])1440(?:p|[^\d]|$)|\b2k\b|\bqhd\b/i, score: 1440 },
  { pattern: /(?:^|[^\d])1080(?:p|[^\d]|$)|\bfhd\b|fullhd/i, score: 1080 },
  { pattern: /(?:^|[^\d])960(?:p|[^\d]|$)/i, score: 960 },
  { pattern: /(?:^|[^\d])720(?:p|[^\d]|$)|\bhd\b/i, score: 720 },
  { pattern: /(?:^|[^\d])540(?:p|[^\d]|$)/i, score: 540 },
  { pattern: /(?:^|[^\d])480(?:p|[^\d]|$)|\bsd\b/i, score: 480 },
  { pattern: /(?:^|[^\d])360(?:p|[^\d]|$)|\bld\b|\blow\b|\bsmooth\b/i, score: 360 },
  { pattern: /(?:^|[^\d])240(?:p|[^\d]|$)/i, score: 240 },
] as const;

const DOUYIN_DIRECT_HOST_PATTERN = /(douyinvod\.com|douyincdn\.com|bytecdn|bytedance)/i;
const XIAOHONGSHU_DIRECT_HOST_PATTERN = /xhscdn\.com/i;

const decodeToken = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const inferQualityScoreFromText = (value: string): number | undefined => {
  const text = decodeToken(value).toLowerCase();
  if (!text) {
    return undefined;
  }

  let bestScore: number | undefined;
  for (const rule of QUALITY_SCORE_RULES) {
    if (rule.pattern.test(text)) {
      bestScore = Math.max(bestScore ?? 0, rule.score);
    }
  }

  return bestScore && bestScore > 0 ? bestScore : undefined;
};

export const inferQualityScoreFromUrl = (value: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  let bestScore = inferQualityScoreFromText(value);

  try {
    const parsed = new URL(value);
    for (const [key, paramValue] of parsed.searchParams.entries()) {
      const paramScore = inferQualityScoreFromText(`${key}=${paramValue}`);
      if (paramScore != null) {
        bestScore = Math.max(bestScore ?? 0, paramScore);
      }
    }
  } catch {
    return bestScore;
  }

  return bestScore;
};

const isDirectPinterestMp4Url = (value: string): boolean => (
  /\.mp4(?:[?#]|$)/i.test(value) || /\/videos\/iht\/expmp4\//i.test(value)
);

const isPinterestManifestLikeUrl = (value: string): boolean => (
  /\.m3u8(?:[?#]|$)/i.test(value)
  || /\.cmfv(?:[?#]|$)/i.test(value)
  || /\/videos\/iht\/hls\//i.test(value)
);

const isDouyinDirectAsset = (value: string): boolean => (
  DOUYIN_DIRECT_HOST_PATTERN.test(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value)
);

const isXiaohongshuDirectAsset = (value: string): boolean => (
  XIAOHONGSHU_DIRECT_HOST_PATTERN.test(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value)
);

export const orderVideoCandidatesForSite = <TCandidate extends MediaCandidate>(
  candidates: readonly TCandidate[],
  siteHint?: string,
): TCandidate[] => {
  if (candidates.length <= 1) {
    return candidates.slice();
  }

  const resolvedSiteHint = resolveSiteHint(siteHint);
  if (resolvedSiteHint === "pinterest") {
    return candidates
      .map((candidate, index) => ({ candidate, index }))
      .sort((left, right) => {
        const leftType = left.candidate.type?.toLowerCase();
        const rightType = right.candidate.type?.toLowerCase();

        const leftPriority = leftType === "direct_mp4" || isDirectPinterestMp4Url(left.candidate.url)
          ? 300
          : leftType === "indirect_media"
            ? 200
            : leftType === "manifest_m3u8" || isPinterestManifestLikeUrl(left.candidate.url)
              ? 100
              : 0;
        const rightPriority = rightType === "direct_mp4" || isDirectPinterestMp4Url(right.candidate.url)
          ? 300
          : rightType === "indirect_media"
            ? 200
            : rightType === "manifest_m3u8" || isPinterestManifestLikeUrl(right.candidate.url)
              ? 100
              : 0;

        const priorityDelta = rightPriority - leftPriority;
        return priorityDelta !== 0 ? priorityDelta : left.index - right.index;
      })
      .map((entry) => entry.candidate);
  }

  const isDirectAsset = resolvedSiteHint === "douyin"
    ? isDouyinDirectAsset
    : resolvedSiteHint === "xiaohongshu"
      ? isXiaohongshuDirectAsset
      : undefined;

  if (!isDirectAsset) {
    return candidates.slice();
  }

  const directEntries = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      direct: isDirectAsset(candidate.url),
      qualityScore: isDirectAsset(candidate.url) ? inferQualityScoreFromUrl(candidate.url) : undefined,
    }))
    .filter((entry) => entry.direct);

  if (directEntries.length === 0 || directEntries.every((entry) => entry.qualityScore == null)) {
    return candidates.slice();
  }

  const passthroughEntries = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter((entry) => !isDirectAsset(entry.candidate.url));

  directEntries.sort((left, right) => {
    if (left.qualityScore == null && right.qualityScore == null) {
      return left.index - right.index;
    }
    if (left.qualityScore == null) {
      return 1;
    }
    if (right.qualityScore == null) {
      return -1;
    }
    if (right.qualityScore !== left.qualityScore) {
      return right.qualityScore - left.qualityScore;
    }
    return left.index - right.index;
  });

  return [
    ...directEntries.map((entry) => entry.candidate),
    ...passthroughEntries.map((entry) => entry.candidate),
  ];
};
