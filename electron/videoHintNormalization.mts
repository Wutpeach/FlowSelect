import { resolveSiteHint } from "../src/core/site-hints.js";
import { orderVideoCandidatesForSite } from "../src/core/video-candidate-order.js";

const normalizeHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^(?:blob|data|file|javascript|mailto):/i.test(trimmed)) {
    return undefined;
  }

  try {
    const normalized = new URL(trimmed).toString();
    return /^https?:\/\//i.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
};

const isDirectPinterestMp4Url = (value: string): boolean => {
  const lower = value.toLowerCase();
  return /\.mp4(?:[?#]|$)/i.test(value) || lower.includes("/videos/iht/expmp4/");
};

const isPinterestManifestLikeUrl = (value: string): boolean => (
  /\.m3u8(?:[?#]|$)/i.test(value)
  || /\.cmfv(?:[?#]|$)/i.test(value)
  || /\/videos\/iht\/hls\//i.test(value)
);

const isPinterestVideoHintUrl = (value: string): boolean => (
  isDirectPinterestMp4Url(value) || isPinterestManifestLikeUrl(value)
);

const normalizeOptionalLabel = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeMediaType = (value: unknown): "video" | "image" | undefined => (
  value === "video" || value === "image" ? value : undefined
);

export function resolveVideoSelectionSiteHint(...values: unknown[]): string | undefined {
  return resolveSiteHint(
    ...values.map((value) => (typeof value === "string" ? value : undefined)),
  );
}

export function normalizeVideoHintUrl(value: unknown, siteHint?: string): string | undefined {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return undefined;
  }

  const resolvedSiteHint = resolveVideoSelectionSiteHint(siteHint, normalized);
  if (resolvedSiteHint === "pinterest") {
    return isPinterestVideoHintUrl(normalized) ? normalized : undefined;
  }

  return normalized;
}

export function normalizeRequiredVideoRouteUrl(value: unknown): string | undefined {
  return normalizeHttpUrl(value);
}

export function normalizeVideoPageUrl(value: unknown): string | undefined {
  return normalizeHttpUrl(value);
}

export function normalizeVideoCandidates(
  candidates: unknown,
  siteHint?: string,
): Array<{
    url: string;
    type?: string;
    source?: string;
    confidence?: string;
    mediaType?: "video" | "image";
  }> {
  if (!Array.isArray(candidates)) {
    return [];
  }

  const deduped = new Set();
  const resolvedSiteHint = resolveVideoSelectionSiteHint(siteHint);
  const result: Array<{
    candidate: {
      url: string;
      type?: string;
      source?: string;
      confidence?: string;
      mediaType?: "video" | "image";
    };
    index: number;
  }> = [];

  for (const [index, candidate] of candidates.entries()) {
    const url = normalizeVideoHintUrl(candidate?.url, resolvedSiteHint);
    if (!url || deduped.has(url)) {
      continue;
    }
    deduped.add(url);
    result.push({
      candidate: {
        url,
        type: normalizeOptionalLabel(candidate?.type),
        source: normalizeOptionalLabel(candidate?.source),
        confidence: normalizeOptionalLabel(candidate?.confidence),
        mediaType: normalizeMediaType(candidate?.mediaType ?? candidate?.media_type),
      },
      index,
    });
  }

  return orderVideoCandidatesForSite(
    result.map((entry) => entry.candidate),
    resolvedSiteHint,
  );
}

export function normalizeVideoCandidateUrls(candidates: unknown, siteHint?: string): string[] {
  return normalizeVideoCandidates(candidates, siteHint).map((candidate) => candidate.url);
}
