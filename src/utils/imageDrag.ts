type ExtractImageUrlOptions = {
  baseUrl?: string | null;
};

const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;
const IMAGE_HOST_HINT_PATTERN = /(?:image|img|photo|media|cdn|static|usercontent)/i;
const LOW_VALUE_IMAGE_HINT_PATTERN = /(?:sprite|icon|favicon|emoji|avatar|logo)/i;
const ABSOLUTE_IMAGE_URL_PATTERN = /https?:\/\/[^"'\\\s<>]+/gi;

function normalizeDragHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/");
}

function resolveImageCandidateUrl(
  raw: string | null | undefined,
  baseUrl?: string | null,
): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  let candidate = normalizeDragHtml(raw).trim();
  if (!candidate) {
    return null;
  }

  if (/^data:image\//i.test(candidate)) {
    return candidate;
  }

  if (/^(?:blob:|about:|javascript:|mailto:)/i.test(candidate)) {
    return null;
  }

  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  }

  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  if (!baseUrl) {
    return null;
  }

  try {
    const resolved = new URL(candidate, baseUrl).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function parseSrcsetEntries(srcset: string): Array<{ url: string; descriptor?: string }> {
  return srcset
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, descriptor] = entry.split(/\s+/, 2);
      return { url, descriptor };
    })
    .filter((entry) => Boolean(entry.url));
}

function imageUrlScore(url: string): number {
  let score = 0;

  if (IMAGE_EXTENSION_PATTERN.test(url)) {
    score += 220;
  }
  if (IMAGE_HOST_HINT_PATTERN.test(url)) {
    score += 40;
  }
  if (/\/(?:original|originals|full|large|master)\//i.test(url)) {
    score += 80;
  }
  if (/[?&](?:w|width|h|height)=\d{3,4}\b/i.test(url)) {
    score += 25;
  }
  if (LOW_VALUE_IMAGE_HINT_PATTERN.test(url)) {
    score -= 180;
  }
  if (/^data:image\//i.test(url)) {
    score += 60;
  }

  return score;
}

function srcsetDescriptorScore(descriptor?: string): number {
  if (!descriptor) {
    return 0;
  }

  const widthMatch = descriptor.match(/^(\d+)w$/i);
  if (widthMatch) {
    return Math.min(320, Number.parseInt(widthMatch[1], 10) / 8);
  }

  const densityMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/i);
  if (densityMatch) {
    return Math.min(180, Math.round(Number.parseFloat(densityMatch[1]) * 60));
  }

  return 0;
}

function extractAttribute(tag: string, attribute: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${attribute}=(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function imageTagDimensionScore(tag: string): number {
  const width = Number.parseInt(extractAttribute(tag, "width") ?? "", 10);
  const height = Number.parseInt(extractAttribute(tag, "height") ?? "", 10);

  if (!Number.isFinite(width) && !Number.isFinite(height)) {
    return 0;
  }

  return Math.min(220, Math.max(width || 0, height || 0) / 6);
}

function addCandidate(
  scores: Map<string, number>,
  rawUrl: string | null | undefined,
  baseScore: number,
  options?: ExtractImageUrlOptions,
  descriptor?: string,
): void {
  const resolved = resolveImageCandidateUrl(rawUrl, options?.baseUrl);
  if (!resolved) {
    return;
  }

  const score = baseScore + imageUrlScore(resolved) + srcsetDescriptorScore(descriptor);
  const existing = scores.get(resolved);
  if (existing === undefined || score > existing) {
    scores.set(resolved, score);
  }
}

export function extractImageUrlFromHtml(
  html: string,
  options?: ExtractImageUrlOptions,
): string | null {
  if (typeof html !== "string" || html.trim().length === 0) {
    return null;
  }

  const normalizedHtml = normalizeDragHtml(html);
  const candidates = new Map<string, number>();

  for (const match of normalizedHtml.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const dimensionScore = imageTagDimensionScore(tag);
    const src = extractAttribute(tag, "src");
    const srcset = extractAttribute(tag, "srcset");

    addCandidate(candidates, src, 1000 + dimensionScore, options);

    for (const entry of parseSrcsetEntries(srcset ?? "")) {
      addCandidate(candidates, entry.url, 1200 + dimensionScore, options, entry.descriptor);
    }
  }

  for (const match of normalizedHtml.matchAll(/<source\b[^>]*>/gi)) {
    const tag = match[0];
    const src = extractAttribute(tag, "src");
    const srcset = extractAttribute(tag, "srcset");

    addCandidate(candidates, src, 920, options);

    for (const entry of parseSrcsetEntries(srcset ?? "")) {
      addCandidate(candidates, entry.url, 1100, options, entry.descriptor);
    }
  }

  for (const match of normalizedHtml.matchAll(
    /<meta\b[^>]*(?:property|name|itemprop)=(?:"(?:og:image|twitter:image|image)"|'(?:og:image|twitter:image|image)'|(?:og:image|twitter:image|image))[^>]*\bcontent=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
  )) {
    addCandidate(candidates, match[1] ?? match[2] ?? match[3], 760, options);
  }

  for (const match of normalizedHtml.matchAll(ABSOLUTE_IMAGE_URL_PATTERN)) {
    if (!IMAGE_EXTENSION_PATTERN.test(match[0]) && !IMAGE_HOST_HINT_PATTERN.test(match[0])) {
      continue;
    }
    addCandidate(candidates, match[0], 320, options);
  }

  return (
    Array.from(candidates.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
  );
}
