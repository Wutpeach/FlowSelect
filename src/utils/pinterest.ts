const PINTEREST_PIN_PATTERN = /^https?:\/\/(?:[a-z0-9-]+\.)?pinterest\.com\/pin\/\d+/i;

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
