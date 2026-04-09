export const KNOWN_SHORT_LINK_HOSTS = new Set([
  "t.cn",
  "t.co",
  "bit.ly",
  "tinyurl.com",
  "is.gd",
  "ow.ly",
  "buff.ly",
  "reurl.cc",
  "b23.tv",
  "xhslink.com",
  "v.douyin.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "pin.it",
]);

const REDIRECT_WRAPPER_HOST_PATTERNS = [
  /(?:^|\.)passport\.weibo\.com$/i,
  /(?:^|\.)link\.zhihu\.com$/i,
  /(?:^|\.)link\.weibo\.com$/i,
] as const;

const REDIRECT_WRAPPER_PATH_PATTERN = /\/(?:redirect|jump|away|visitor|out|dispatch)(?:[/?#]|$)/i;

const REDIRECT_TARGET_PARAM_KEYS = [
  "url",
  "target",
  "target_url",
  "targeturl",
  "redirect",
  "redirect_url",
  "redirecturl",
  "dest",
  "destination",
  "to",
  "u",
  "href",
  "link",
  "goto",
] as const;

export const normalizeHttpUrl = (value: string | null | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const normalized = new URL(trimmed).toString();
    return /^https?:\/\//i.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
};

export const resolveUrlHostname = (value: string | null | undefined): string | undefined => {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return undefined;
  }

  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

export const isKnownShortLinkHost = (hostname: string | null | undefined): boolean => (
  typeof hostname === "string" && KNOWN_SHORT_LINK_HOSTS.has(hostname.toLowerCase())
);

export const isLikelyShortLinkUrl = (value: string | null | undefined): boolean => {
  const hostname = resolveUrlHostname(value);
  return typeof hostname === "string" && isKnownShortLinkHost(hostname);
};

export const isRedirectWrapperUrl = (value: string | null | undefined): boolean => {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return REDIRECT_WRAPPER_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))
      || REDIRECT_WRAPPER_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
};

export const unwrapRedirectTargetUrl = (
  value: string | null | undefined,
  maxDepth = 3,
): string | undefined => {
  let current = normalizeHttpUrl(value);
  if (!current) {
    return undefined;
  }

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!isRedirectWrapperUrl(current)) {
      return current;
    }

    let next: string | undefined;
    try {
      const parsed = new URL(current);
      for (const key of REDIRECT_TARGET_PARAM_KEYS) {
        const candidate = normalizeHttpUrl(parsed.searchParams.get(key));
        if (candidate && candidate !== current) {
          next = candidate;
          break;
        }
      }
    } catch {
      return current;
    }

    if (!next || next === current) {
      return current;
    }

    current = next;
  }

  return current;
};
