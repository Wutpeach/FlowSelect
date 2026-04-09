import {
  normalizeHttpUrl,
  isLikelyShortLinkUrl,
  isRedirectWrapperUrl,
  resolveSiteHint,
  unwrapRedirectTargetUrl,
  type RawDownloadInput,
} from "../core/index.js";

const runRedirectAttempt = async (
  url: string,
  fetchImpl: typeof fetch,
  method: "HEAD" | "GET",
): Promise<string | undefined> => {
  try {
    const response = await fetchImpl(url, {
      method,
      redirect: "follow",
      cache: "no-store",
    });
    const resolvedUrl = unwrapRedirectTargetUrl(response.url);
    return resolvedUrl && resolvedUrl !== url ? resolvedUrl : undefined;
  } catch {
    return undefined;
  }
};

const resolveShortLinkUrl = async (
  url: string,
  fetchImpl: typeof fetch,
  resolveViaNavigation?: (url: string) => Promise<string | undefined>,
): Promise<string> => {
  const headResolvedUrl = await runRedirectAttempt(url, fetchImpl, "HEAD");
  if (headResolvedUrl) {
    return headResolvedUrl;
  }

  const getResolvedUrl = await runRedirectAttempt(url, fetchImpl, "GET");
  if (getResolvedUrl) {
    return getResolvedUrl;
  }

  if (typeof resolveViaNavigation === "function") {
    const navigationResolvedUrl = unwrapRedirectTargetUrl(await resolveViaNavigation(url));
    if (navigationResolvedUrl && navigationResolvedUrl !== url) {
      return navigationResolvedUrl;
    }
  }

  return url;
};

export const resolveShortLinkDownloadInput = async (
  input: RawDownloadInput,
  fetchImpl: typeof fetch | undefined,
  resolveViaNavigation?: (url: string) => Promise<string | undefined>,
): Promise<RawDownloadInput> => {
  const normalizedUrl = normalizeHttpUrl(input.url);
  const normalizedPageUrl = normalizeHttpUrl(input.pageUrl);
  const unwrappedUrl = unwrapRedirectTargetUrl(normalizedUrl) ?? normalizedUrl;
  const unwrappedPageUrl = unwrapRedirectTargetUrl(normalizedPageUrl) ?? normalizedPageUrl;
  const candidates = Array.from(
    new Set(
      [unwrappedUrl, unwrappedPageUrl].filter((value): value is string => (
        typeof value === "string" && (isLikelyShortLinkUrl(value) || isRedirectWrapperUrl(value))
      )),
    ),
  );

  if (candidates.length === 0 && unwrappedUrl === input.url && unwrappedPageUrl === input.pageUrl) {
    return input;
  }

  const resolvedEntries = typeof fetchImpl === "function"
    ? await Promise.all(
        candidates.map(async (candidate) => [
          candidate,
          await resolveShortLinkUrl(candidate, fetchImpl, resolveViaNavigation),
        ] as const),
      )
    : typeof resolveViaNavigation === "function"
      ? await Promise.all(
          candidates.map(async (candidate) => [
            candidate,
            unwrapRedirectTargetUrl(await resolveViaNavigation(candidate)) ?? candidate,
          ] as const),
        )
      : [];
  const resolvedMap = new Map(resolvedEntries);

  const resolvedUrl = unwrappedUrl
    ? resolvedMap.get(unwrappedUrl) ?? unwrappedUrl
    : input.url;
  const resolvedPageUrl = unwrappedPageUrl
    ? resolvedMap.get(unwrappedPageUrl) ?? unwrappedPageUrl
    : (
        resolvedUrl && resolvedUrl !== input.url
          ? resolvedUrl
          : unwrappedUrl && unwrappedUrl !== input.url
            ? unwrappedUrl
          : input.pageUrl
      );
  const resolvedSiteHint = resolveSiteHint(
    input.siteHint,
    resolvedPageUrl,
    resolvedUrl,
    input.videoUrl,
  );

  if (
    resolvedUrl === input.url
    && resolvedPageUrl === input.pageUrl
    && resolvedSiteHint === input.siteHint
  ) {
    return input;
  }

  return {
    ...input,
    url: resolvedUrl,
    pageUrl: resolvedPageUrl,
    siteHint: resolvedSiteHint ?? input.siteHint,
  };
};
