const WEIBO_IMAGE_HOST_PATTERN = /(?:^|\.)sinaimg\.cn$/i;
const WEIBO_HIGH_QUALITY_BUCKETS = new Set(["mw2000", "large", "orj1080"]);
const WEIBO_UPGRADE_BUCKET_BY_SOURCE: Record<string, string> = {
  thumb150: "mw2000",
  thumbnail: "mw2000",
  bmiddle: "mw2000",
  mw690: "mw2000",
  orj360: "mw2000",
  orj480: "mw2000",
};

function parseHttpUrl(raw: string): URL | null {
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw.trim())) {
    return null;
  }

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function isWeiboImageUrl(raw: string): boolean {
  const parsed = parseHttpUrl(raw);
  return parsed ? WEIBO_IMAGE_HOST_PATTERN.test(parsed.hostname) : false;
}

export function upgradeWeiboImageUrl(raw: string): string | null {
  const parsed = parseHttpUrl(raw);
  if (!parsed || !WEIBO_IMAGE_HOST_PATTERN.test(parsed.hostname)) {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const currentBucket = segments[0]?.trim().toLowerCase();
  if (!currentBucket || WEIBO_HIGH_QUALITY_BUCKETS.has(currentBucket)) {
    return null;
  }

  const nextBucket = WEIBO_UPGRADE_BUCKET_BY_SOURCE[currentBucket];
  if (!nextBucket) {
    return null;
  }

  segments[0] = nextBucket;
  parsed.pathname = `/${segments.join("/")}`;
  return parsed.toString();
}
