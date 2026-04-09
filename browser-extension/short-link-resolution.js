(function (globalScope) {
  "use strict";

  const DEFAULT_FETCH_TIMEOUT_MS = 8000;
  const DEFAULT_BACKGROUND_TAB_TIMEOUT_MS = 12000;
  const DEFAULT_BACKGROUND_TAB_SETTLED_WAIT_MS = 1200;
  const KNOWN_SHORT_LINK_HOSTS = new Set([
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
  ];
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
  ];

  function normalizeHttpUrl(raw) {
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const resolved = new URL(trimmed).toString();
      return resolved.startsWith("http://") || resolved.startsWith("https://")
        ? resolved
        : null;
    } catch {
      return null;
    }
  }

  function resolveHostname(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) {
      return null;
    }

    try {
      return new URL(normalized).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  function isKnownShortLinkHost(hostname) {
    if (typeof hostname !== "string" || !hostname) {
      return false;
    }

    return KNOWN_SHORT_LINK_HOSTS.has(hostname.toLowerCase());
  }

  function isLikelyShortLinkUrl(value) {
    const hostname = resolveHostname(value);
    return hostname ? isKnownShortLinkHost(hostname) : false;
  }

  function isRedirectWrapperUrl(value) {
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
  }

  function unwrapRedirectTargetUrl(value, maxDepth = 3) {
    let current = normalizeHttpUrl(value);
    if (!current) {
      return null;
    }

    for (let depth = 0; depth < maxDepth; depth += 1) {
      if (!isRedirectWrapperUrl(current)) {
        return current;
      }

      let next = null;
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
  }

  async function runFetchAttempt(url, method, options) {
    const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalScope.fetch;
    if (typeof fetchImpl !== "function") {
      return null;
    }

    const timeoutMs = typeof options.timeoutMs === "number"
      ? options.timeoutMs
      : DEFAULT_FETCH_TIMEOUT_MS;
    const abortController = typeof globalScope.AbortController === "function"
      ? new globalScope.AbortController()
      : null;

    let timer = null;
    try {
      if (abortController) {
        timer = globalScope.setTimeout?.(() => {
          abortController.abort();
        }, timeoutMs) ?? null;
      }

      const response = await fetchImpl(url, {
        method,
        redirect: "follow",
        cache: "no-store",
        credentials: "omit",
        signal: abortController?.signal,
      });
      const resolvedUrl = unwrapRedirectTargetUrl(response?.url);
      return resolvedUrl && resolvedUrl !== url
        ? {
            resolvedUrl,
            via: `fetch_${method.toLowerCase()}`,
          }
        : null;
    } catch {
      return null;
    } finally {
      if (timer !== null && typeof globalScope.clearTimeout === "function") {
        globalScope.clearTimeout(timer);
      }
    }
  }

  async function resolveViaFetch(url, options = {}) {
    const headResult = await runFetchAttempt(url, "HEAD", options);
    if (headResult) {
      return headResult;
    }

    return runFetchAttempt(url, "GET", options);
  }

  async function resolveViaBackgroundTab(url, options = {}) {
    const createTab = options.createTab;
    const getTab = options.getTab;
    const removeTabQuietly = options.removeTabQuietly;
    const waitForTabComplete = options.waitForTabComplete;
    const sleepImpl = typeof options.sleep === "function"
      ? options.sleep
      : (ms) => new Promise((resolve) => {
          globalScope.setTimeout(resolve, ms);
        });

    if (
      typeof createTab !== "function"
      || typeof getTab !== "function"
      || typeof removeTabQuietly !== "function"
    ) {
      return null;
    }

    const backgroundTabTimeoutMs = typeof options.backgroundTabTimeoutMs === "number"
      ? options.backgroundTabTimeoutMs
      : DEFAULT_BACKGROUND_TAB_TIMEOUT_MS;
    const backgroundTabSettledWaitMs = typeof options.backgroundTabSettledWaitMs === "number"
      ? options.backgroundTabSettledWaitMs
      : DEFAULT_BACKGROUND_TAB_SETTLED_WAIT_MS;

    const tab = await createTab({
      url,
      active: false,
    });
    const tabId = typeof tab?.id === "number" ? tab.id : null;
    if (tabId === null) {
      return null;
    }

    try {
      if (typeof waitForTabComplete === "function") {
        await waitForTabComplete(tabId, { timeoutMs: backgroundTabTimeoutMs });
      }
      await sleepImpl(backgroundTabSettledWaitMs);

      const currentTab = await getTab(tabId);
      const resolvedUrl = normalizeHttpUrl(currentTab?.url);
      return resolvedUrl && resolvedUrl !== url
        ? {
            resolvedUrl,
            via: "background_tab",
          }
        : null;
    } catch {
      return null;
    } finally {
      try {
        await removeTabQuietly(tabId);
      } catch {
        // Ignore cleanup failures for best-effort background tabs.
      }
    }
  }

  async function resolveShortLinkUrl(value, options = {}) {
    const initialUrl = normalizeHttpUrl(value);
    if (!initialUrl) {
      return null;
    }

    const unwrappedInitialUrl = unwrapRedirectTargetUrl(initialUrl);
    if (unwrappedInitialUrl && unwrappedInitialUrl !== initialUrl) {
      return {
        initialUrl,
        resolvedUrl: unwrappedInitialUrl,
        expanded: true,
        via: "unwrap_redirect",
      };
    }

    if (!isLikelyShortLinkUrl(initialUrl)) {
      return {
        initialUrl,
        resolvedUrl: initialUrl,
        expanded: false,
        via: "passthrough",
      };
    }

    const fetchResult = await resolveViaFetch(initialUrl, options);
    if (fetchResult?.resolvedUrl) {
      return {
        initialUrl,
        resolvedUrl: fetchResult.resolvedUrl,
        expanded: fetchResult.resolvedUrl !== initialUrl,
        via: fetchResult.via,
      };
    }

    const backgroundTabResult = await resolveViaBackgroundTab(initialUrl, options);
    if (backgroundTabResult?.resolvedUrl) {
      return {
        initialUrl,
        resolvedUrl: backgroundTabResult.resolvedUrl,
        expanded: backgroundTabResult.resolvedUrl !== initialUrl,
        via: backgroundTabResult.via,
      };
    }

    return {
      initialUrl,
      resolvedUrl: initialUrl,
      expanded: false,
      via: "unresolved",
    };
  }

  globalScope.FlowSelectShortLinkResolution = {
    isKnownShortLinkHost,
    isLikelyShortLinkUrl,
    normalizeHttpUrl,
    unwrapRedirectTargetUrl,
    resolveShortLinkUrl,
  };
})(typeof self !== "undefined" ? self : globalThis);
