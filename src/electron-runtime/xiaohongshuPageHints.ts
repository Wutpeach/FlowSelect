import { orderVideoCandidatesForSite, type MediaCandidate, type RawDownloadInput } from "../core/index.js";

const XIAOHONGSHU_PAGE_PATTERN = /^https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\//i;
const XIAOHONGSHU_FEED_API_PATH = "/api/sns/web/v1/feed";
const XIAOHONGSHU_NOTE_DETAIL_PATH = "/api/sns/web/v1/note";
const XIAOHONGSHU_IMAGE_SCENES = ["CRD_PRV_WEBP", "CRD_WM_WEBP", "CRD_WM_JPG"] as const;
const XIAOHONGSHU_DIRECT_VIDEO_PATTERN =
  /https?:\/\/[^"'\\\s<>]*xhscdn\.com\/[^"'\\\s<>]*(?:\.mp4|\.m4v|\.mov)(?:[^\s"'<>]*)/gi;
const XIAOHONGSHU_MANIFEST_PATTERN =
  /https?:\/\/[^"'\\\s<>]*xhscdn\.com\/[^"'\\\s<>]*\.m3u8(?:[^\s"'<>]*)/gi;
const XIAOHONGSHU_IMAGE_META_PATTERN =
  /<meta\b[^>]*(?:property|name)=(?:"(?:og:image|twitter:image)"|'(?:og:image|twitter:image)'|(?:og:image|twitter:image))[^>]*\bcontent=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;
const XIAOHONGSHU_IMAGE_URL_PATTERN =
  /https?:\/\/[^"'\\\s<>]*xhscdn\.com\/[^"'\\\s<>]*(?:(?:imageView2|format\/(?:jpe?g|png|webp|gif)|notes_pre_post|!nc_)[^"'\\\s<>]*)/gi;

type XiaohongshuExpectedMediaType = "video" | "image" | null;

type XiaohongshuDragMediaInput = Pick<RawDownloadInput, "url" | "pageUrl" | "cookies" | "siteHint"> & {
  noteId?: string;
  imageUrl?: string;
  mediaType?: XiaohongshuExpectedMediaType;
  videoIntentConfidence?: number;
  videoIntentSources?: string[];
};

type XiaohongshuImageCandidate = {
  url: string;
  source: string;
};

export type XiaohongshuResolvedPageMedia =
  | {
      kind: "video";
      pageUrl: string;
      videoUrl: string | null;
      videoCandidates: MediaCandidate[];
      imageUrl: string | null;
      videoIntentConfidence?: number;
      videoIntentSources?: string[];
    }
  | {
      kind: "image";
      pageUrl: string;
      imageUrl: string;
      videoUrl: null;
      videoCandidates: [];
      videoIntentConfidence?: number;
      videoIntentSources?: string[];
    }
  | {
      kind: "unknown";
      pageUrl: string;
      imageUrl: string | null;
      videoUrl: null;
      videoCandidates: [];
      videoIntentConfidence?: number;
      videoIntentSources?: string[];
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

const normalizeNoteId = (value: string | undefined | null): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^[a-zA-Z0-9]+$/.test(trimmed) ? trimmed : null;
};

const extractNoteIdFromPageUrl = (value: string | undefined | null): string | null => {
  const pageUrl = normalizeUrl(value);
  if (!pageUrl) {
    return null;
  }

  try {
    const parsed = new URL(pageUrl);
    const match = parsed.pathname.match(
      /\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)|^\/user\/profile\/[^/?#]+\/([a-zA-Z0-9]+)(?:[/?#]|$)/i,
    );
    return normalizeNoteId(match?.[1] ?? match?.[2] ?? null);
  } catch {
    return null;
  }
};

const normalizeImageUrl = (value: string | undefined | null): string | null => {
  const normalized = normalizeUrl(value);
  if (
    !normalized
    || /\.(?:mp4|m4v|mov|m3u8)(?:$|\?)/i.test(normalized)
    || /\.(?:css|js|json|txt|map|woff2?|ttf)(?:[?#]|$)/i.test(normalized)
  ) {
    return null;
  }

  if (
    !/sns-webpic[^/]*\.xhscdn\.com/i.test(normalized)
    && !/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(normalized)
    && !/(?:imageView2|format\/(?:jpe?g|png|webp|gif)|notes_pre_post|!nc_)/i.test(normalized)
  ) {
    return null;
  }

  return normalized;
};

const resolveImageUrlCandidate = (value: string | undefined | null): string | null => normalizeImageUrl(value);

const normalizeVideoIntentConfidence = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return Math.round(value * 1000) / 1000;
};

const normalizeVideoIntentSources = (value: string[] | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

const applyVideoIntentFallback = (
  media: XiaohongshuResolvedPageMedia | null,
  confidence: number,
  sources: string[],
  preferredImageUrl: string | null,
  pageUrl: string,
): XiaohongshuResolvedPageMedia | null => {
  if (confidence < 0.7) {
    return media;
  }

  if (media?.kind === "video") {
    return {
      ...media,
      videoIntentConfidence: confidence,
      videoIntentSources: sources,
    };
  }

  const imageUrl = media?.imageUrl ?? preferredImageUrl ?? null;
  return {
    kind: "video",
    pageUrl: media?.pageUrl ?? pageUrl,
    imageUrl,
    videoUrl: null,
    videoCandidates: [],
    videoIntentConfidence: confidence,
    videoIntentSources: sources,
  };
};

const normalizeImageIdentity = (value: string | undefined | null): string | null => {
  const normalized = normalizeImageUrl(value);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tail = segments[segments.length - 1] || "";
    if (tail) {
      return tail.replace(/!nc_[^/]+$/i, "");
    }
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/!nc_[^/]+$/i, "");
    return parsed.toString();
  } catch {
    return normalized;
  }
};

const valueSuggestsVideoNote = (value: unknown, seen = new WeakSet<object>(), depth = 0): boolean => {
  if (value == null || depth > 12) {
    return false;
  }

  if (typeof value === "string") {
    return /^video$/i.test(value.trim())
      || /(?:^|["'{,\s])(?:type|note_?type)["']?\s*[:=]\s*["']video["']/i.test(value)
      || /hasVideo["']?\s*[:=]\s*true/i.test(value)
      || /master[_-]?url/i.test(value)
      || /stream\/[A-Za-z0-9_-]+/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((entry) => valueSuggestsVideoNote(entry, seen, depth + 1));
  }

  if (typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  return Object.entries(value).some(([key, entry]) => {
    if ((/^type$|note_?type/i.test(key)) && typeof entry === "string") {
      return /^video$/i.test(entry.trim());
    }
    if (/hasVideo/i.test(key) && entry === true) {
      return true;
    }
    if (/^video$|video[_-]?(?:info|media|consumer|id)/i.test(key) && entry != null) {
      return true;
    }
    if (/master[_-]?url|stream|h26[45]/i.test(key) && entry != null) {
      return true;
    }
    return valueSuggestsVideoNote(entry, seen, depth + 1);
  });
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

const buildRequestHeaders = (
  pageUrl: string,
  cookies: string | undefined,
  accept: string,
  contentType?: string,
): Headers => {
  const headers = new Headers();
  headers.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  );
  headers.set("Accept", accept);
  headers.set("Referer", pageUrl);

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const cookieHeader = cookiesToHeader(cookies);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  return headers;
};

const readJsonResponse = async (response: Response): Promise<unknown | null> => {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

const collectUrlsFromString = (
  raw: string,
  addVideoCandidate: (url: string, source: string) => void,
  addImageCandidate: (url: string, source: string) => void,
) => {
  const normalized = raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  const matches = normalized.match(/https?:\/\/[^\s"'\\<>]+/g) || [];
  for (const match of matches) {
    const normalizedUrl = normalizeUrl(match);
    if (!normalizedUrl) {
      continue;
    }

    if (/\.(?:mp4|m4v|mov|m3u8)(?:$|\?)/i.test(normalizedUrl)) {
      addVideoCandidate(normalizedUrl, "detail_api");
      continue;
    }

    const imageUrl = resolveImageUrlCandidate(normalizedUrl);
    if (imageUrl) {
      addImageCandidate(imageUrl, "detail_api");
    }
  }
};

const collectMediaFromValue = (
  value: unknown,
  addVideoCandidate: (url: string, source: string) => void,
  addImageCandidate: (url: string, source: string) => void,
  seen = new WeakSet<object>(),
  depth = 0,
) => {
  if (value == null || depth > 12) {
    return;
  }

  if (typeof value === "string") {
    collectUrlsFromString(value, addVideoCandidate, addImageCandidate);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectMediaFromValue(item, addVideoCandidate, addImageCandidate, seen, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      if (/video|stream|master|play(?:_?url)?|h26[45]/i.test(key)) {
        addVideoCandidate(entry, "detail_api");
      }
      collectUrlsFromString(entry, addVideoCandidate, addImageCandidate);
      if (/image|cover|poster|thumbnail/i.test(key)) {
        const imageUrl = resolveImageUrlCandidate(entry);
        if (imageUrl) {
          addImageCandidate(imageUrl, key);
        }
      }
    } else {
      collectMediaFromValue(entry, addVideoCandidate, addImageCandidate, seen, depth + 1);
    }
  }
};

const pickPreferredResolvedImage = (
  preferredImageUrl: string | null,
  imageCandidates: XiaohongshuImageCandidate[],
): string | null => {
  const normalizedPreferredIdentity = normalizeImageIdentity(preferredImageUrl);
  if (normalizedPreferredIdentity) {
    const preferredMatch = imageCandidates.find(
      (candidate) => normalizeImageIdentity(candidate.url) === normalizedPreferredIdentity,
    );
    if (preferredMatch) {
      return preferredMatch.url;
    }
  }

  return imageCandidates[0]?.url ?? preferredImageUrl ?? null;
};

const resolveMediaFromCandidates = (options: {
  pageUrl: string;
  preferredImageUrl: string | null;
  expectedMediaType: XiaohongshuExpectedMediaType;
  videoCandidates: MediaCandidate[];
  imageCandidates: XiaohongshuImageCandidate[];
}): XiaohongshuResolvedPageMedia | null => {
  const orderedCandidates = orderVideoCandidatesForSite(options.videoCandidates, "xiaohongshu");
  const videoUrl = orderedCandidates.find((candidate) => candidate.type === "direct_cdn")?.url
    ?? orderedCandidates.find((candidate) => candidate.type === "manifest_m3u8")?.url
    ?? null;
  const imageUrl = pickPreferredResolvedImage(options.preferredImageUrl, options.imageCandidates);

  if (videoUrl || orderedCandidates.length > 0) {
    return {
      kind: "video",
      pageUrl: options.pageUrl,
      videoUrl: videoUrl ?? orderedCandidates[0]?.url ?? null,
      videoCandidates: orderedCandidates,
      imageUrl,
    };
  }

  if (imageUrl) {
    return {
      kind: "image",
      pageUrl: options.pageUrl,
      imageUrl,
      videoUrl: null,
      videoCandidates: [],
    };
  }

  if (options.expectedMediaType === "image" && options.preferredImageUrl) {
    return {
      kind: "image",
      pageUrl: options.pageUrl,
      imageUrl: options.preferredImageUrl,
      videoUrl: null,
      videoCandidates: [],
    };
  }

  return null;
};

const extractImageFromHtml = (html: string): string | null => {
  const normalizedHtml = html
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");

  const metaMatch = normalizedHtml.match(XIAOHONGSHU_IMAGE_META_PATTERN);
  const metaCandidate = resolveImageUrlCandidate(metaMatch?.[1] ?? metaMatch?.[2] ?? metaMatch?.[3] ?? null);
  if (metaCandidate) {
    return metaCandidate;
  }

  for (const match of normalizedHtml.matchAll(XIAOHONGSHU_IMAGE_URL_PATTERN)) {
    const candidate = resolveImageUrlCandidate(match[0]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
};

const fetchXiaohongshuApiMedia = async (
  input: XiaohongshuDragMediaInput,
  fetchImpl: typeof fetch,
): Promise<XiaohongshuResolvedPageMedia | null> => {
  const pageUrl = normalizeUrl(input.pageUrl ?? input.url);
  const noteId = normalizeNoteId(input.noteId) ?? extractNoteIdFromPageUrl(pageUrl);
  if (!pageUrl || !noteId) {
    return null;
  }

  const preferredImageUrl = normalizeImageUrl(input.imageUrl);
  const expectedMediaType = input.mediaType ?? null;
  const videoCandidates: MediaCandidate[] = [];
  const imageCandidates: XiaohongshuImageCandidate[] = [];
  const seenVideoUrls = new Set<string>();
  const seenImageUrls = new Set<string>();
  let detectedVideoIntent = false;

  const addVideoCandidate = (rawUrl: string, source: string) => {
    const candidateUrl = normalizeUrl(rawUrl);
    if (!candidateUrl || seenVideoUrls.has(candidateUrl) || !/\.(?:mp4|m4v|mov|m3u8)(?:$|\?)/i.test(candidateUrl)) {
      return;
    }

    seenVideoUrls.add(candidateUrl);
    const type = /\.m3u8(?:$|\?)/i.test(candidateUrl) ? "manifest_m3u8" : "direct_cdn";
    videoCandidates.push({
      url: candidateUrl,
      type,
      confidence: type === "direct_cdn" ? "high" : "medium",
      source,
      mediaType: "video",
    });
  };

  const addImageCandidate = (rawUrl: string, source: string) => {
    const imageUrl = normalizeImageUrl(rawUrl);
    if (!imageUrl || seenImageUrls.has(imageUrl)) {
      return;
    }
    seenImageUrls.add(imageUrl);
    imageCandidates.push({
      url: imageUrl,
      source,
    });
  };

  const requests = [
    async () => {
      const response = await fetchImpl(new URL(XIAOHONGSHU_FEED_API_PATH, pageUrl), {
        method: "POST",
        headers: buildRequestHeaders(
          pageUrl,
          input.cookies,
          "application/json, text/plain, */*",
          "application/json;charset=UTF-8",
        ),
        body: JSON.stringify({
          source_note_id: noteId,
          image_scenes: XIAOHONGSHU_IMAGE_SCENES,
        }),
        redirect: "follow",
      });
      if (!response.ok) {
        return null;
      }
      return readJsonResponse(response);
    },
    async () => {
      const response = await fetchImpl(new URL(`${XIAOHONGSHU_NOTE_DETAIL_PATH}/${noteId}/detail`, pageUrl), {
        headers: buildRequestHeaders(pageUrl, input.cookies, "application/json, text/plain, */*"),
        redirect: "follow",
      });
      if (!response.ok) {
        return null;
      }
      return readJsonResponse(response);
    },
  ];

  for (const request of requests) {
    try {
      const data = await request();
      if (!data) {
        continue;
      }

      detectedVideoIntent = detectedVideoIntent || valueSuggestsVideoNote(data);
      collectMediaFromValue(data, addVideoCandidate, addImageCandidate);
      if (videoCandidates.length > 0 || imageCandidates.length > 0) {
        break;
      }
    } catch {
      // Ignore API fetch failures and fall back to page/html resolution.
    }
  }

  const resolvedMedia = resolveMediaFromCandidates({
    pageUrl,
    preferredImageUrl,
    expectedMediaType,
    videoCandidates,
    imageCandidates,
  });
  if (
    resolvedMedia?.kind === "image"
    && imageCandidates.length === 0
    && videoCandidates.length === 0
    && expectedMediaType === "image"
    && preferredImageUrl
  ) {
    return null;
  }
  if (resolvedMedia?.kind === "image" && detectedVideoIntent) {
    return {
      kind: "video",
      pageUrl,
      imageUrl: resolvedMedia.imageUrl,
      videoUrl: null,
      videoCandidates: [],
    };
  }

  if (resolvedMedia) {
    return resolvedMedia;
  }

  if (detectedVideoIntent) {
    return {
      kind: "video",
      pageUrl,
      imageUrl: pickPreferredResolvedImage(preferredImageUrl, imageCandidates),
      videoUrl: null,
      videoCandidates: [],
    };
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

  try {
    const response = await fetchImpl(pageUrl, {
      headers: buildRequestHeaders(pageUrl, input.cookies, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
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
  const detectedVideoIntent = valueSuggestsVideoNote(html);

  if (videoCandidates.length > 0) {
    const videoUrl = videoCandidates.find((candidate) => candidate.type === "direct_cdn")?.url
      ?? videoCandidates.find((candidate) => candidate.type === "manifest_m3u8")?.url;
    return {
      kind: "video",
      pageUrl,
      videoUrl: videoUrl ?? null,
      videoCandidates,
      imageUrl,
    };
  }

  if (detectedVideoIntent) {
    return {
      kind: "video",
      pageUrl,
      imageUrl,
      videoUrl: null,
      videoCandidates: [],
    };
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

  try {
    const response = await fetchImpl(pageUrl, {
      headers: buildRequestHeaders(pageUrl, input.cookies, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
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

export async function resolveXiaohongshuDragMedia(
  input: XiaohongshuDragMediaInput,
  fetchImpl: typeof fetch | undefined,
): Promise<XiaohongshuResolvedPageMedia | null> {
  if (!fetchImpl) {
    return null;
  }

  const pageUrl = normalizeUrl(input.pageUrl ?? input.url);
  if (!pageUrl || !XIAOHONGSHU_PAGE_PATTERN.test(pageUrl)) {
    return null;
  }
  const preferredImageUrl = normalizeImageUrl(input.imageUrl);
  const videoIntentConfidence = normalizeVideoIntentConfidence(input.videoIntentConfidence);
  const videoIntentSources = normalizeVideoIntentSources(input.videoIntentSources);

  const resolvedFromApi = await fetchXiaohongshuApiMedia(input, fetchImpl);
  if (resolvedFromApi) {
    return applyVideoIntentFallback(
      resolvedFromApi,
      videoIntentConfidence,
      videoIntentSources,
      preferredImageUrl,
      pageUrl,
    );
  }

  const resolvedFromPage = await resolveXiaohongshuPageMedia(
    {
      url: input.url,
      pageUrl,
      cookies: input.cookies,
      siteHint: input.siteHint,
    },
    fetchImpl,
  );
  if (resolvedFromPage?.kind === "image" || resolvedFromPage?.kind === "video") {
    return applyVideoIntentFallback(
      resolvedFromPage,
      videoIntentConfidence,
      videoIntentSources,
      preferredImageUrl,
      pageUrl,
    );
  }

  if (videoIntentConfidence >= 0.7) {
    return applyVideoIntentFallback(
      resolvedFromPage,
      videoIntentConfidence,
      videoIntentSources,
      preferredImageUrl,
      pageUrl,
    );
  }

  if (input.mediaType === "image" && preferredImageUrl) {
    return {
      kind: "image",
      pageUrl,
      imageUrl: preferredImageUrl,
      videoUrl: null,
      videoCandidates: [],
    };
  }

  return resolvedFromPage;
}
