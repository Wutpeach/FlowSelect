const TWITTER_X_VIDEO_DRAG_HTML_PATTERNS = [
  /<video\b/i,
  /<source\b[^>]*type=(?:"video\/|'video\/'|video\/)/i,
  /(?:^|["'=])https?:\/\/[^"'\\\s<>]+(?:\.mp4|\.m3u8)(?:[?#][^"'\\\s<>]*)?/i,
  /(?:property|name)=(?:"(?:og:video|twitter:player:stream)"|'(?:og:video|twitter:player:stream)'|(?:og:video|twitter:player:stream))/i,
];

export function isTwitterXStatusUrl(value: string | null | undefined): boolean {
  return canonicalizeTwitterXPageUrl(value) !== null;
}

export function canonicalizeTwitterXPageUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!/(^|\.)twitter\.com$|(^|\.)x\.com$/i.test(parsed.hostname)) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    const statusIndex = segments.findIndex((segment) => segment.toLowerCase() === "status");
    const statusId = statusIndex >= 0 ? segments[statusIndex + 1] : null;
    if (statusIndex < 1 || !statusId || !/^\d+$/.test(statusId)) {
      return null;
    }

    parsed.pathname = `/${segments.slice(0, statusIndex + 2).join("/")}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function upgradeTwitterXImageUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (!/(^|\.)pbs\.twimg\.com$/i.test(parsed.hostname) || !/^\/media\//i.test(parsed.pathname)) {
      return null;
    }

    if (parsed.searchParams.get("name")?.toLowerCase() === "orig") {
      return null;
    }

    parsed.searchParams.set("name", "orig");
    return parsed.toString();
  } catch {
    return null;
  }
}

export function shouldPreferTwitterXImageDrop(input: {
  dropUrl: string | null | undefined;
  html: string | null | undefined;
  htmlImageUrl: string | null | undefined;
}): boolean {
  if (!input.htmlImageUrl || !isTwitterXStatusUrl(input.dropUrl)) {
    return false;
  }

  const html = typeof input.html === "string" ? input.html : "";
  if (!html.trim()) {
    return false;
  }

  return !TWITTER_X_VIDEO_DRAG_HTML_PATTERNS.some((pattern) => pattern.test(html));
}
