(function (globalScope) {
  "use strict";

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

  function resolveHost(value) {
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

  function hostsConflict(primaryUrl, secondaryUrl) {
    const primaryHost = resolveHost(primaryUrl);
    const secondaryHost = resolveHost(secondaryUrl);
    return Boolean(primaryHost && secondaryHost && primaryHost !== secondaryHost);
  }

  function resolveVideoSelectionRouting(input) {
    const requestedUrl = normalizeHttpUrl(input?.requestedUrl);
    const pageUrl = normalizeHttpUrl(input?.pageUrl);
    const senderTabUrl = normalizeHttpUrl(input?.senderTabUrl);
    const fallbackUrl = normalizeHttpUrl(input?.fallbackUrl);

    const routeUrl = requestedUrl || pageUrl || senderTabUrl || fallbackUrl;
    let resolvedPageUrl = pageUrl || senderTabUrl || requestedUrl || fallbackUrl;

    if (hostsConflict(routeUrl, resolvedPageUrl)) {
      resolvedPageUrl = routeUrl;
    }

    return {
      routeUrl: routeUrl || null,
      pageUrl: resolvedPageUrl || null,
    };
  }

  globalScope.FlowSelectVideoSelectionRouting = {
    resolveVideoSelectionRouting,
  };
})(typeof self !== "undefined" ? self : globalThis);
