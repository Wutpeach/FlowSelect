const PINTEREST_PIN_PATTERN = /^https?:\/\/(?:[a-z0-9-]+\.)?pinterest\.com\/pin\/\d+/i;
const VIDEO_HINT_PATTERN =
  /(?:video_list|story_pin_data|carousel_data|v\d+\.pinimg\.com\/videos|\/videos\/iht\/hls\/|\.m3u8\b|\.mp4\b|\.cmfv\b)/i;

export type PinterestVideoCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
};

export type PinterestVideoSelection = {
  videoUrl: string | null;
  videoCandidates: PinterestVideoCandidate[];
};

export type PinterestDragDiagnostic = {
  htmlLength: number;
  htmlPreview: string;
  flags: {
    hasEmbeddedPayload: boolean;
    hasVideoTag: boolean;
    hasVideoList: boolean;
    hasStoryPinData: boolean;
    hasCarouselData: boolean;
    hasMp4: boolean;
    hasM3u8: boolean;
    hasCmfv: boolean;
    hasPinimgVideoHost: boolean;
  };
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidatesCount: number;
  videoCandidates: PinterestVideoCandidate[];
};

type EmbeddedPinterestDragPayload = {
  pageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: PinterestVideoCandidate[];
  title: string | null;
};

const PINTEREST_DRAG_PAYLOAD_RE = /FLOWSELECT_PINTEREST_DRAG:([A-Za-z0-9+/=_-]+)/i;

function scorePinterestImageUrl(url: string): number {
  if (/\/originals\//i.test(url)) {
    return 1000;
  }

  const sizeMatch = url.match(/\/(\d+)x\//i);
  if (sizeMatch) {
    return Number(sizeMatch[1]) || 0;
  }

  return 0;
}

export function isPinterestPinUrl(url: string): boolean {
  if (typeof url !== "string") {
    return false;
  }

  return PINTEREST_PIN_PATTERN.test(url.trim());
}

export function looksLikePinterestVideoHtml(html: string): boolean {
  if (typeof html !== "string" || html.trim().length === 0) {
    return false;
  }

  const embeddedPayload = extractEmbeddedPinterestDragPayload(html);
  if (embeddedPayload && (embeddedPayload.videoUrl || embeddedPayload.videoCandidates.length > 0)) {
    return true;
  }

  return /(?:<video\b|video_list|story_pin_data|carousel_data|v\d+\.pinimg\.com\/videos|\.m3u8\b|\.mp4\b)/i.test(
    html,
  );
}

export function extractPinterestImageUrlFromHtml(html: string): string | null {
  if (typeof html !== "string" || html.trim().length === 0) {
    return null;
  }

  const normalizedHtml = html.replace(/&amp;/gi, "&");
  const candidates = new Set<string>();
  const srcsetMatch = normalizedHtml.match(/srcset=(?:"([^"]+)"|'([^']+)')/i);

  if (srcsetMatch) {
    const srcset = srcsetMatch[1] ?? srcsetMatch[2] ?? "";
    for (const entry of srcset.split(",")) {
      const url = entry.trim().split(/\s+/)[0];
      if (/^https:\/\/i\.pinimg\.com\//i.test(url)) {
        candidates.add(url);
      }
    }
  }

  for (const match of normalizedHtml.matchAll(/https:\/\/i\.pinimg\.com\/[^"'<> \t\r\n]+/gi)) {
    candidates.add(match[0]);
  }

  return (
    Array.from(candidates).sort((left, right) => {
      return scorePinterestImageUrl(right) - scorePinterestImageUrl(left);
    })[0] ?? null
  );
}

function normalizePinterestHtml(html: string): string {
  return html
    .replace(/&amp;/gi, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/");
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

function normalizePinterestCandidateUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const normalized = normalizePinterestHtml(raw).trim();
  if (!/^https?:\/\//i.test(normalized) || /^blob:/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizePinterestTitle(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizePinterestDragCandidates(raw: unknown): PinterestVideoCandidate[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const candidates: PinterestVideoCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const url = normalizePinterestCandidateUrl((item as { url?: string }).url);
    if (!url || seen.has(url) || !isPinterestVideoCandidateUrl(url)) {
      continue;
    }

    seen.add(url);
    candidates.push({
      url,
      type: normalizePinterestTitle((item as { type?: string }).type) ?? undefined,
      source: normalizePinterestTitle((item as { source?: string }).source) ?? undefined,
      confidence: normalizePinterestTitle((item as { confidence?: string }).confidence) ?? undefined,
    });
  }

  return candidates;
}

export function extractEmbeddedPinterestDragPayload(html: string): EmbeddedPinterestDragPayload | null {
  if (typeof html !== "string" || html.trim().length === 0) {
    return null;
  }

  const match = html.match(PINTEREST_DRAG_PAYLOAD_RE);
  if (!match) {
    return null;
  }

  const decoded = decodeUtf8Base64(match[1]);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded) as {
      pageUrl?: unknown;
      videoUrl?: unknown;
      videoCandidates?: unknown;
      title?: unknown;
    };
    return {
      pageUrl: isPinterestPinUrl(typeof parsed.pageUrl === "string" ? parsed.pageUrl : "")
        ? (parsed.pageUrl as string).trim()
        : null,
      videoUrl: normalizePinterestCandidateUrl(
        typeof parsed.videoUrl === "string" ? parsed.videoUrl : null,
      ),
      videoCandidates: normalizePinterestDragCandidates(parsed.videoCandidates),
      title: normalizePinterestTitle(parsed.title),
    };
  } catch {
    return null;
  }
}

function isPinterestDirectMp4Url(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.mp4(?:[?#]|$)/i.test(url) || lower.includes("/videos/iht/expmp4/");
}

function isPinterestManifestUrl(url: string): boolean {
  return /\.m3u8(?:[?#]|$)/i.test(url);
}

function isPinterestStreamLikeUrl(url: string): boolean {
  return (
    isPinterestManifestUrl(url) ||
    /\.cmfv(?:[?#]|$)/i.test(url) ||
    /\/videos\/iht\/hls\//i.test(url)
  );
}

function isPinterestVideoCandidateUrl(url: string): boolean {
  return isPinterestDirectMp4Url(url) || isPinterestStreamLikeUrl(url);
}

function classifyPinterestVideoCandidateType(url: string): string {
  if (isPinterestDirectMp4Url(url)) {
    return "direct_mp4";
  }

  if (isPinterestStreamLikeUrl(url)) {
    return "manifest_m3u8";
  }

  return "indirect_media";
}

function pinterestVideoTypeScore(type: string): number {
  switch (type) {
    case "direct_mp4":
      return 100;
    case "indirect_media":
      return 50;
    case "manifest_m3u8":
      return 10;
    default:
      return 0;
  }
}

function pinterestVideoSourceScore(source: string): number {
  switch (source) {
    case "video_element":
      return 20;
    case "video_source":
      return 18;
    case "script_scan":
      return 12;
    case "html_scan":
      return 8;
    default:
      return 0;
  }
}

function pinterestVideoConfidence(score: number): string {
  if (score >= 110) {
    return "high";
  }

  if (score >= 70) {
    return "medium";
  }

  return "low";
}

export function extractPinterestVideoSelectionFromHtml(html: string): PinterestVideoSelection {
  if (typeof html !== "string" || html.trim().length === 0) {
    return {
      videoUrl: null,
      videoCandidates: [],
    };
  }

  const normalizedHtml = normalizePinterestHtml(html);
  const embeddedPayload = extractEmbeddedPinterestDragPayload(html);
  const seen = new Set<string>();
  const candidates: Array<PinterestVideoCandidate & { score: number }> = [];

  const collectCandidate = (raw: string | null | undefined, source: string) => {
    const url = normalizePinterestCandidateUrl(raw);
    if (!url || seen.has(url) || !isPinterestVideoCandidateUrl(url)) {
      return;
    }

    seen.add(url);
    const type = classifyPinterestVideoCandidateType(url);
    const score = pinterestVideoTypeScore(type) + pinterestVideoSourceScore(source);
    candidates.push({
      url,
      type,
      source,
      confidence: pinterestVideoConfidence(score),
      score,
    });
  };

  for (const candidate of embeddedPayload?.videoCandidates ?? []) {
    const url = normalizePinterestCandidateUrl(candidate.url);
    if (!url || seen.has(url) || !isPinterestVideoCandidateUrl(url)) {
      continue;
    }

    seen.add(url);
    const type = classifyPinterestVideoCandidateType(url);
    const score = pinterestVideoTypeScore(type) + 30;
    candidates.push({
      url,
      type: candidate.type ?? type,
      source: candidate.source ?? "embedded_drag_payload",
      confidence: candidate.confidence ?? pinterestVideoConfidence(score),
      score,
    });
  }

  if (embeddedPayload?.videoUrl) {
    collectCandidate(embeddedPayload.videoUrl, "embedded_drag_payload");
  }

  try {
    const doc = new DOMParser().parseFromString(normalizedHtml, "text/html");

    doc.querySelectorAll("video").forEach((video) => {
      collectCandidate(video.getAttribute("src"), "video_element");
    });

    doc.querySelectorAll("video source").forEach((source) => {
      collectCandidate(source.getAttribute("src"), "video_source");
    });

    doc.querySelectorAll("script").forEach((script) => {
      const text = script.textContent ?? "";
      if (!VIDEO_HINT_PATTERN.test(text)) {
        return;
      }

      const matches = text.match(/https?:\/\/[^"'\\\s<>]+/gi) ?? [];
      matches.forEach((match) => collectCandidate(match, "script_scan"));
    });
  } catch {
    // Drag HTML can be malformed; fall back to raw URL scanning below.
  }

  const htmlMatches = normalizedHtml.match(/https?:\/\/[^"'\\\s<>]+/gi) ?? [];
  htmlMatches.forEach((match) => collectCandidate(match, "html_scan"));

  const videoCandidates = candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map(({ score, ...candidate }) => candidate);

  const preferredVideoUrl =
    videoCandidates.find((candidate) => isPinterestDirectMp4Url(candidate.url))?.url ??
    videoCandidates.find((candidate) => isPinterestManifestUrl(candidate.url))?.url ??
    null;

  return {
    videoUrl: preferredVideoUrl,
    videoCandidates,
  };
}

export function buildPinterestDragDiagnostic(html: string): PinterestDragDiagnostic {
  const safeHtml = typeof html === "string" ? html : "";
  const normalizedHtml = normalizePinterestHtml(safeHtml);
  const embeddedPayload = extractEmbeddedPinterestDragPayload(safeHtml);
  const videoSelection = extractPinterestVideoSelectionFromHtml(safeHtml);
  const htmlPreview = normalizedHtml.replace(/\s+/g, " ").trim().slice(0, 320);

  return {
    htmlLength: safeHtml.length,
    htmlPreview,
    flags: {
      hasEmbeddedPayload: Boolean(embeddedPayload),
      hasVideoTag: /<video\b/i.test(normalizedHtml),
      hasVideoList: /video_list/i.test(normalizedHtml),
      hasStoryPinData: /story_pin_data/i.test(normalizedHtml),
      hasCarouselData: /carousel_data/i.test(normalizedHtml),
      hasMp4: /\.mp4\b/i.test(normalizedHtml),
      hasM3u8: /\.m3u8\b/i.test(normalizedHtml),
      hasCmfv: /\.cmfv\b/i.test(normalizedHtml),
      hasPinimgVideoHost: /v\d+\.pinimg\.com\/videos/i.test(normalizedHtml),
    },
    imageUrl: extractPinterestImageUrlFromHtml(safeHtml),
    videoUrl: embeddedPayload?.videoUrl ?? videoSelection.videoUrl,
    videoCandidatesCount: videoSelection.videoCandidates.length,
    videoCandidates: videoSelection.videoCandidates.slice(0, 6),
  };
}
