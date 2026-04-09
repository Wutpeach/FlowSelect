const XIAOHONGSHU_PAGE_URL_PATTERN = /^https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\//i;
const XIAOHONGSHU_VIDEO_HINT_PATTERN = /<video\b|https?:\/\/[^"'\\\s<>]+(?:\.mp4|\.m4v|\.mov|\.m3u8)(?:[?#][^"'\\\s<>]*)?|:\/\/[^"'\\\s<>]*video[^"'\\\s<>]*\.xhscdn\.com\//i;
const XIAOHONGSHU_DRAG_PAYLOAD_RE = /FLOWSELECT_XIAOHONGSHU_DRAG:([A-Za-z0-9+/=_-]+)/i;

export type XiaohongshuDragCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
  mediaType?: "video" | "image";
};

export type EmbeddedXiaohongshuDragPayload = {
  token: string | null;
  pageUrl: string | null;
  detailUrl: string | null;
  sourcePageUrl: string | null;
  noteId: string | null;
  exactImageUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: XiaohongshuDragCandidate[];
  mediaType: "video" | "image" | null;
  videoIntentConfidence: number | null;
  videoIntentSources: string[];
  title: string | null;
};

export type XiaohongshuResolvedDragMedia = {
  kind: "video" | "image" | "unknown";
  pageUrl: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: XiaohongshuDragCandidate[];
  videoIntentConfidence?: number | null;
  videoIntentSources?: string[];
};

export function isXiaohongshuPageUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && XIAOHONGSHU_PAGE_URL_PATTERN.test(url.trim());
}

export function looksLikeXiaohongshuVideoHtml(html: string): boolean {
  return typeof html === "string" && XIAOHONGSHU_VIDEO_HINT_PATTERN.test(html);
}

function decodeUtf8Base64(value: string): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const binary = atob(value);
    const escaped = Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("");
    return decodeURIComponent(escaped);
  } catch {
    return null;
  }
}

function normalizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed || /^(?:blob:|data:|file:|about:|javascript:|mailto:)/i.test(trimmed)) {
    return null;
  }

  try {
    const resolved = new URL(trimmed).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function normalizeXiaohongshuImageUrl(raw: unknown): string | null {
  const normalized = normalizeHttpUrl(raw);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (/(?:^|\.)xhscdn\.com$/i.test(parsed.hostname) && (!parsed.pathname || parsed.pathname === "/")) {
      return null;
    }
  } catch {
    return null;
  }

  return normalized;
}

function normalizeOptionalLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed || undefined;
}

function normalizeNoteId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  return /^[a-zA-Z0-9]+$/.test(trimmed) ? trimmed : null;
}

function normalizeMediaType(raw: unknown): "video" | "image" | null {
  return raw === "video" || raw === "image" ? raw : null;
}

function normalizeVideoIntentConfidence(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }

  if (raw <= 0) {
    return 0;
  }

  if (raw >= 1) {
    return 1;
  }

  return Math.round(raw * 1000) / 1000;
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    values.push(trimmed);
  }

  return values;
}

function normalizeDragCandidates(raw: unknown): XiaohongshuDragCandidate[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const candidates: XiaohongshuDragCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const url = normalizeHttpUrl(record.url);
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    candidates.push({
      url,
      type: normalizeOptionalLabel(record.type),
      source: normalizeOptionalLabel(record.source),
      confidence: normalizeOptionalLabel(record.confidence),
      mediaType: normalizeMediaType(record.mediaType ?? record.media_type) ?? undefined,
    });
  }

  return candidates;
}

export function extractEmbeddedXiaohongshuDragPayload(
  value: string,
): EmbeddedXiaohongshuDragPayload | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const match = value.match(XIAOHONGSHU_DRAG_PAYLOAD_RE);
  if (!match) {
    return null;
  }

  const decoded = decodeUtf8Base64(match[1]);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const pageUrl = normalizeHttpUrl(parsed.pageUrl);
    return {
      token: typeof parsed.token === "string" && parsed.token.trim()
        ? parsed.token.trim()
        : null,
      pageUrl: isXiaohongshuPageUrl(pageUrl) ? pageUrl : null,
      detailUrl: normalizeHttpUrl(parsed.detailUrl),
      sourcePageUrl: normalizeHttpUrl(parsed.sourcePageUrl),
      noteId: normalizeNoteId(parsed.noteId ?? parsed.note_id),
      exactImageUrl: normalizeXiaohongshuImageUrl(parsed.exactImageUrl ?? parsed.exact_image_url),
      imageUrl: normalizeXiaohongshuImageUrl(parsed.imageUrl),
      videoUrl: normalizeHttpUrl(parsed.videoUrl),
      videoCandidates: normalizeDragCandidates(parsed.videoCandidates),
      mediaType: normalizeMediaType(parsed.mediaType),
      videoIntentConfidence: normalizeVideoIntentConfidence(parsed.videoIntentConfidence ?? parsed.video_intent_confidence),
      videoIntentSources: normalizeStringArray(parsed.videoIntentSources ?? parsed.video_intent_sources),
      title: typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : null,
    };
  } catch {
    return null;
  }
}

export function hasXiaohongshuVideoSignals(
  media: Pick<XiaohongshuResolvedDragMedia, "kind" | "videoUrl" | "videoCandidates" | "videoIntentConfidence"> | null | undefined,
): boolean {
  if (!media) {
    return false;
  }

  return media.kind === "video"
    || Boolean(media.videoUrl)
    || (Array.isArray(media.videoCandidates) && media.videoCandidates.length > 0)
    || (typeof media.videoIntentConfidence === "number" && media.videoIntentConfidence >= 0.7);
}

export function pickXiaohongshuImageForDownload(options: {
  embeddedPayload?: EmbeddedXiaohongshuDragPayload | null;
  resolvedMedia?: XiaohongshuResolvedDragMedia | null;
}): string | null {
  const { embeddedPayload, resolvedMedia } = options;

  if (resolvedMedia?.kind === "video") {
    return null;
  }

  if (resolvedMedia?.kind === "image" && resolvedMedia.imageUrl) {
    return normalizeXiaohongshuImageUrl(resolvedMedia.imageUrl);
  }

  if (resolvedMedia?.kind === "unknown" && resolvedMedia.imageUrl) {
    return normalizeXiaohongshuImageUrl(resolvedMedia.imageUrl);
  }

  if (embeddedPayload?.mediaType === "image") {
    return normalizeXiaohongshuImageUrl(embeddedPayload.imageUrl)
      ?? normalizeXiaohongshuImageUrl(embeddedPayload.exactImageUrl)
      ?? null;
  }

  return null;
}
