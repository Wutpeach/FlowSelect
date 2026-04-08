import { orderVideoCandidatesForSite, type MediaCandidate, type RawDownloadInput } from "../core/index.js";

const XIAOHONGSHU_PAGE_PATTERN = /^https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\//i;
const XIAOHONGSHU_DIRECT_VIDEO_PATTERN =
  /https?:\/\/[^"'\\\s<>]*xhscdn\.com\/[^"'\\\s<>]*(?:\.mp4|\.m4v|\.mov)(?:[^\s"'<>]*)/gi;
const XIAOHONGSHU_MANIFEST_PATTERN =
  /https?:\/\/[^"'\\\s<>]*xhscdn\.com\/[^"'\\\s<>]*\.m3u8(?:[^\s"'<>]*)/gi;
const XIAOHONGSHU_IMAGE_META_PATTERN =
  /<meta\b[^>]*(?:property|name)=(?:"(?:og:image|twitter:image)"|'(?:og:image|twitter:image)'|(?:og:image|twitter:image))[^>]*\bcontent=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;
const XIAOHONGSHU_IMAGE_URL_PATTERN =
  /https?:\/\/[^"'\\\s<>]*xhscdn\.com\/[^"'\\\s<>]*(?:(?:imageView2|format\/(?:jpe?g|png|webp|gif)|notes_pre_post|!nc_)[^"'\\\s<>]*)/gi;

export type XiaohongshuResolvedPageMedia =
  | {
      kind: "video";
      pageUrl: string;
      videoUrl: string;
      videoCandidates: MediaCandidate[];
      imageUrl: string | null;
    }
  | {
      kind: "image";
      pageUrl: string;
      imageUrl: string;
      videoUrl: null;
      videoCandidates: [];
    }
  | {
      kind: "unknown";
      pageUrl: string;
      imageUrl: string | null;
      videoUrl: null;
      videoCandidates: [];
    };

const normalizeUrl = (value: string | undefined | null): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").trim();
  if (!trimmed || /^(?:blob:|data:|file:|about:|javascript:|mailto:)/i.test(trimmed)) {
    return null;
  }

  try {
    const normalized = new URL(trimmed).toString();
    return /^https?:\/\//i.test(normalized) ? normalized : null;
  } catch {
    return null;
  }
};

const cookiesToHeader = (rawCookies: string | undefined): string | null => {
  if (!rawCookies?.trim()) {
    return null;
  }

  const pairs: string[] = [];
  for (const line of rawCookies.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 7) {
      continue;
    }

    const name = parts[5]?.trim();
    const value = parts[6]?.trim();
    if (!name) {
      continue;
    }
    pairs.push(`${name}=${value ?? ""}`);
  }

  return pairs.length > 0 ? pairs.join("; ") : null;
};

const collectCandidatesFromHtml = (html: string): MediaCandidate[] => {
  const normalizedHtml = html
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  const seen = new Set<string>();
  const candidates: MediaCandidate[] = [];

  const collect = (
    rawUrl: string,
    type: "direct_cdn" | "manifest_m3u8",
    source: "page_html" | "page_script",
    confidence: "high" | "medium",
  ) => {
    const url = normalizeUrl(rawUrl);
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    candidates.push({
      url,
      type,
      source,
      confidence,
      mediaType: "video",
    });
  };

  for (const match of normalizedHtml.matchAll(XIAOHONGSHU_DIRECT_VIDEO_PATTERN)) {
    collect(match[0], "direct_cdn", "page_html", "high");
  }

  for (const match of normalizedHtml.matchAll(XIAOHONGSHU_MANIFEST_PATTERN)) {
    collect(match[0], "manifest_m3u8", "page_script", "medium");
  }

  return orderVideoCandidatesForSite(candidates, "xiaohongshu");
};

const extractImageFromHtml = (html: string): string | null => {
  const normalizedHtml = html
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");

  const metaMatch = normalizedHtml.match(XIAOHONGSHU_IMAGE_META_PATTERN);
  const metaCandidate = normalizeUrl(metaMatch?.[1] ?? metaMatch?.[2] ?? metaMatch?.[3] ?? null);
  if (metaCandidate && !/\.(?:mp4|m4v|mov|m3u8)(?:$|\?)/i.test(metaCandidate)) {
    return metaCandidate;
  }

  for (const match of normalizedHtml.matchAll(XIAOHONGSHU_IMAGE_URL_PATTERN)) {
    const candidate = normalizeUrl(match[0]);
    if (candidate && !/\.(?:mp4|m4v|mov|m3u8)(?:$|\?)/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

const shouldResolveXiaohongshuPageHints = (input: RawDownloadInput): boolean => {
  const pageUrl = input.pageUrl ?? input.url;
  if (!pageUrl || !XIAOHONGSHU_PAGE_PATTERN.test(pageUrl)) {
    return false;
  }

  const hasDirectHint = [input.videoUrl, input.url, ...(input.videoCandidates ?? []).map((candidate) => candidate.url)]
    .some((value) => typeof value === "string" && /xhscdn\.com/i.test(value) && /\.(mp4|m4v|mov|m3u8)(?:$|\?)/i.test(value));

  return !hasDirectHint;
};

export async function resolveXiaohongshuPageHints(
  input: RawDownloadInput,
  fetchImpl: typeof fetch | undefined,
): Promise<RawDownloadInput> {
  if (!shouldResolveXiaohongshuPageHints(input) || !fetchImpl) {
    return input;
  }

  const pageUrl = normalizeUrl(input.pageUrl ?? input.url);
  if (!pageUrl) {
    return input;
  }

  const headers = new Headers();
  headers.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  );
  headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("Referer", pageUrl);

  const cookieHeader = cookiesToHeader(input.cookies);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  try {
    const response = await fetchImpl(pageUrl, {
      headers,
      redirect: "follow",
    });
    if (!response.ok) {
      return input;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/json/i.test(contentType)) {
      return input;
    }

    const html = await response.text();
    const resolvedMedia = resolveXiaohongshuMediaFromHtml(pageUrl, html);
    if (resolvedMedia.kind !== "video") {
      return input;
    }

    const mergedCandidates = orderVideoCandidatesForSite(
      [...resolvedMedia.videoCandidates, ...(input.videoCandidates ?? [])],
      "xiaohongshu",
    );
    const videoUrl = mergedCandidates.find((candidate) => candidate.type === "direct_cdn")?.url
      ?? mergedCandidates.find((candidate) => candidate.type === "manifest_m3u8")?.url
      ?? input.videoUrl;

    return {
      ...input,
      siteHint: input.siteHint ?? "xiaohongshu",
      pageUrl,
      videoUrl,
      videoCandidates: mergedCandidates,
    };
  } catch {
    return input;
  }
}

export function resolveXiaohongshuMediaFromHtml(
  pageUrl: string,
  html: string,
): XiaohongshuResolvedPageMedia {
  const videoCandidates = collectCandidatesFromHtml(html);
  const imageUrl = extractImageFromHtml(html);

  if (videoCandidates.length > 0) {
    const videoUrl = videoCandidates.find((candidate) => candidate.type === "direct_cdn")?.url
      ?? videoCandidates.find((candidate) => candidate.type === "manifest_m3u8")?.url;
    if (videoUrl) {
      return {
        kind: "video",
        pageUrl,
        videoUrl,
        videoCandidates,
        imageUrl,
      };
    }
  }

  if (imageUrl) {
    return {
      kind: "image",
      pageUrl,
      imageUrl,
      videoUrl: null,
      videoCandidates: [],
    };
  }

  return {
    kind: "unknown",
    pageUrl,
    imageUrl: null,
    videoUrl: null,
    videoCandidates: [],
  };
}

export async function resolveXiaohongshuPageMedia(
  input: Pick<RawDownloadInput, "url" | "pageUrl" | "cookies" | "siteHint">,
  fetchImpl: typeof fetch | undefined,
): Promise<XiaohongshuResolvedPageMedia | null> {
  const pageUrl = normalizeUrl(input.pageUrl ?? input.url);
  if (!pageUrl || !XIAOHONGSHU_PAGE_PATTERN.test(pageUrl) || !fetchImpl) {
    return null;
  }

  const headers = new Headers();
  headers.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  );
  headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("Referer", pageUrl);

  const cookieHeader = cookiesToHeader(input.cookies);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  try {
    const response = await fetchImpl(pageUrl, {
      headers,
      redirect: "follow",
    });
    if (!response.ok) {
      return {
        kind: "unknown",
        pageUrl,
        imageUrl: null,
        videoUrl: null,
        videoCandidates: [],
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/json/i.test(contentType)) {
      return {
        kind: "unknown",
        pageUrl,
        imageUrl: null,
        videoUrl: null,
        videoCandidates: [],
      };
    }

    return resolveXiaohongshuMediaFromHtml(pageUrl, await response.text());
  } catch {
    return {
      kind: "unknown",
      pageUrl,
      imageUrl: null,
      videoUrl: null,
      videoCandidates: [],
    };
  }
}
