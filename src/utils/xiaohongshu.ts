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
  noteId: string | null;
  exactImageUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: XiaohongshuDragCandidate[];
  mediaType: "video" | "image" | null;
  title: string | null;
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
      noteId: normalizeNoteId(parsed.noteId ?? parsed.note_id),
      exactImageUrl: normalizeHttpUrl(parsed.exactImageUrl ?? parsed.exact_image_url),
      imageUrl: normalizeHttpUrl(parsed.imageUrl),
      videoUrl: normalizeHttpUrl(parsed.videoUrl),
      videoCandidates: normalizeDragCandidates(parsed.videoCandidates),
      mediaType: normalizeMediaType(parsed.mediaType),
      title: typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : null,
    };
  } catch {
    return null;
  }
}
