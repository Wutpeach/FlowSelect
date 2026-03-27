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

const videoHintPriority = (value: string): number => {
  if (isDirectPinterestMp4Url(value)) {
    return 300;
  }
  if (isPinterestManifestLikeUrl(value)) {
    return 100;
  }
  return 0;
};

export function normalizeVideoHintUrl(value: unknown): string | undefined {
  const normalized = normalizeHttpUrl(value);
  return normalized && isPinterestVideoHintUrl(normalized) ? normalized : undefined;
}

export function normalizeRequiredVideoRouteUrl(value: unknown): string | undefined {
  return normalizeHttpUrl(value);
}

export function normalizeVideoPageUrl(value: unknown): string | undefined {
  return normalizeHttpUrl(value);
}

export function normalizeVideoCandidateUrls(candidates: unknown): string[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  const deduped = new Set();
  const result: Array<{ url: string; index: number }> = [];
  for (const [index, candidate] of candidates.entries()) {
    const url = normalizeVideoHintUrl(candidate?.url);
    if (!url || deduped.has(url)) {
      continue;
    }
    deduped.add(url);
    result.push({ url, index });
  }

  return result
    .sort((left, right) => {
      const scoreDelta = videoHintPriority(right.url) - videoHintPriority(left.url);
      return scoreDelta !== 0 ? scoreDelta : left.index - right.index;
    })
    .map((entry) => entry.url);
}
