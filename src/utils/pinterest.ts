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
