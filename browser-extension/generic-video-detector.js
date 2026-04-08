(function () {
  "use strict";

  const domUtils = window.FlowSelectDomInjectionUtils || null;
  const selectionUtils = window.FlowSelectGenericVideoSelectionUtils || null;
  const CONTEXT_TTL_MS = 10000;
  const MIN_VIDEO_WIDTH = 120;
  const MIN_VIDEO_HEIGHT = 68;
  const PERFORMANCE_SCAN_LIMIT = 80;
  const MESSAGE_RESOLVE_VIDEO_SELECTION = "flowselect_resolve_video_selection";
  const SELECTION_SCOPE_CURRENT_ITEM = "current_item";
  const MEDIA_ROUTE_PATH_RE =
    /\/(?:video|watch|reel|reels|p|status|pin|detail|post|clip|shorts|tv)\/[^/?#]+/i;
  const XIAOHONGSHU_NOTE_PATH_RE =
    /\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)|^\/user\/profile\/[^/?#]+\/([a-zA-Z0-9]+)(?:[/?#]|$)/i;

  const playbackTimestamps = new WeakMap();
  let lastContextSelection = null;

  if (!domUtils || !selectionUtils || !chrome?.runtime?.onMessage) {
    return;
  }

  function normalizeHttpUrl(raw, baseUrl = window.location.href) {
    return selectionUtils?.normalizeHttpUrl ? selectionUtils.normalizeHttpUrl(raw, baseUrl) : null;
  }

  function isRenderableVideo(video) {
    return (
      video instanceof HTMLVideoElement &&
      domUtils?.isRenderableElement?.(video, {
        minWidth: MIN_VIDEO_WIDTH,
        minHeight: MIN_VIDEO_HEIGHT,
      }) === true
    );
  }

  function isLikelyContentUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return false;
    }

    try {
      const parsed = new URL(normalized);
      if (parsed.pathname === "/" || parsed.pathname === "") {
        return false;
      }

       if (
        isXiaohongshuHostname(parsed.hostname) &&
        !XIAOHONGSHU_NOTE_PATH_RE.test(parsed.pathname)
      ) {
        return false;
      }

      if (/\.(?:mp4|m4v|mov|webm|m3u8|mpd|jpg|jpeg|png|webp|gif|svg)(?:[?#]|$)/i.test(parsed.pathname)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  function normalizeContentUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized || !isLikelyContentUrl(normalized)) {
      return null;
    }

    const normalizedXiaohongshuNoteUrl = normalizeXiaohongshuNoteUrl(normalized);
    if (normalizedXiaohongshuNoteUrl) {
      return normalizedXiaohongshuNoteUrl;
    }

    try {
      const parsed = new URL(normalized);
      if (MEDIA_ROUTE_PATH_RE.test(parsed.pathname)) {
        parsed.search = "";
      }
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return normalized;
    }
  }

  function isXiaohongshuHostname(hostname) {
    return /(?:^|\.)xiaohongshu\.com$/i.test(hostname || "")
      || /(?:^|\.)xhslink\.com$/i.test(hostname || "");
  }

  function isXiaohongshuPageUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return false;
    }

    try {
      return isXiaohongshuHostname(new URL(normalized).hostname);
    } catch {
      return false;
    }
  }

  function normalizeXiaohongshuNoteUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      if (!isXiaohongshuHostname(parsed.hostname) || !XIAOHONGSHU_NOTE_PATH_RE.test(parsed.pathname)) {
        return null;
      }

      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function scoreRectOverlap(referenceRect, candidateRect) {
    if (!referenceRect || !candidateRect) {
      return 0;
    }

    const overlapWidth = Math.max(
      0,
      Math.min(referenceRect.right, candidateRect.right) - Math.max(referenceRect.left, candidateRect.left),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(referenceRect.bottom, candidateRect.bottom) - Math.max(referenceRect.top, candidateRect.top),
    );
    const overlapArea = overlapWidth * overlapHeight;
    if (overlapArea <= 0) {
      return 0;
    }

    const referenceArea = Math.max(1, referenceRect.width * referenceRect.height);
    return overlapArea / referenceArea;
  }

  function collectScoredRouteCandidate(scoredCandidates, rawUrl, score) {
    const normalized = normalizeXiaohongshuNoteUrl(rawUrl) || normalizeContentUrl(rawUrl);
    if (!normalized) {
      return;
    }

    const previousScore = scoredCandidates.get(normalized);
    if (typeof previousScore === "number" && previousScore >= score) {
      return;
    }

    scoredCandidates.set(normalized, score);
  }

  function collectXiaohongshuRouteCandidatesFromScope(scope, referenceElement, scoredCandidates, baseScore) {
    if (!(scope instanceof Element)) {
      return;
    }

    const referenceRect =
      referenceElement instanceof Element && typeof referenceElement.getBoundingClientRect === "function"
        ? referenceElement.getBoundingClientRect()
        : null;
    const anchors = [];
    const seenAnchors = new Set();

    const pushAnchor = (anchor) => {
      if (!(anchor instanceof HTMLAnchorElement) || seenAnchors.has(anchor)) {
        return;
      }

      seenAnchors.add(anchor);
      anchors.push(anchor);
    };

    if (scope instanceof HTMLAnchorElement) {
      pushAnchor(scope);
    }

    const closestAnchor = scope.closest('a[href*="/explore/"], a[href*="/discovery/item/"]');
    if (closestAnchor instanceof HTMLAnchorElement) {
      pushAnchor(closestAnchor);
    }

    scope
      .querySelectorAll?.('a[href*="/explore/"], a[href*="/discovery/item/"]')
      ?.forEach?.((anchor) => {
        if (anchors.length >= 18) {
          return;
        }
        pushAnchor(anchor);
      });

    anchors.forEach((anchor, index) => {
      let score = baseScore - index * 6;

      if (referenceElement instanceof Element && anchor.contains(referenceElement)) {
        score += 180;
      }

      if (typeof anchor.getBoundingClientRect === "function" && referenceRect) {
        const anchorRect = anchor.getBoundingClientRect();
        score += Math.round(scoreRectOverlap(referenceRect, anchorRect) * 220);

        const anchorCenterX = anchorRect.left + anchorRect.width / 2;
        const anchorCenterY = anchorRect.top + anchorRect.height / 2;
        const referenceCenterX = referenceRect.left + referenceRect.width / 2;
        const referenceCenterY = referenceRect.top + referenceRect.height / 2;
        const distance = Math.hypot(anchorCenterX - referenceCenterX, anchorCenterY - referenceCenterY);
        score -= Math.min(48, Math.round(distance / 12));
      }

      if (anchor.querySelector("video")) {
        score += 40;
      }
      if (anchor.querySelector("img")) {
        score += 16;
      }

      collectScoredRouteCandidate(scoredCandidates, anchor.href, score);
    });
  }

  function resolveXiaohongshuRouteUrl(referenceElement) {
    const currentNoteUrl = normalizeXiaohongshuNoteUrl(window.location.href);
    if (currentNoteUrl) {
      return currentNoteUrl;
    }

    if (!(referenceElement instanceof Element)) {
      return null;
    }

    const scoredCandidates = new Map();
    let current = referenceElement;
    for (let depth = 0; current && depth < 6; depth += 1) {
      collectXiaohongshuRouteCandidatesFromScope(
        current,
        referenceElement,
        scoredCandidates,
        1240 - depth * 90,
      );
      current = current.parentElement;
    }

    if (typeof document.elementsFromPoint === "function") {
      const rect = referenceElement.getBoundingClientRect?.();
      if (rect) {
        const points = [
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          { x: rect.left + Math.min(rect.width * 0.25, Math.max(rect.width - 1, 0)), y: rect.top + rect.height / 2 },
          { x: rect.left + Math.min(rect.width * 0.75, Math.max(rect.width - 1, 0)), y: rect.top + rect.height / 2 },
        ].filter((point) => (
          Number.isFinite(point.x)
          && Number.isFinite(point.y)
          && point.x >= 0
          && point.y >= 0
          && point.x <= window.innerWidth
          && point.y <= window.innerHeight
        ));

        points.forEach((point, index) => {
          const elements = document.elementsFromPoint(point.x, point.y);
          elements.forEach((element, elementIndex) => {
            collectXiaohongshuRouteCandidatesFromScope(
              element,
              referenceElement,
              scoredCandidates,
              1180 - index * 30 - elementIndex * 10,
            );
          });
        });
      }
    }

    return Array.from(scoredCandidates.entries())
      .sort((left, right) => right[1] - left[1])[0]?.[0] || null;
  }

  function shouldAvoidCurrentPageFallback(rawUrl = window.location.href) {
    return isXiaohongshuPageUrl(rawUrl) && !normalizeXiaohongshuNoteUrl(rawUrl);
  }

  function resolveSelectionPageUrl(routeUrl, fallbackVideoUrl, currentPageUrl = window.location.href) {
    const normalizedRouteUrl = normalizeContentUrl(routeUrl) || normalizeHttpUrl(routeUrl);
    if (normalizedRouteUrl) {
      return normalizedRouteUrl;
    }

    const normalizedCurrentPageUrl = normalizeHttpUrl(currentPageUrl) || null;
    if (normalizedCurrentPageUrl && !shouldAvoidCurrentPageFallback(normalizedCurrentPageUrl)) {
      return normalizedCurrentPageUrl;
    }

    return normalizeHttpUrl(fallbackVideoUrl) || null;
  }

  function resolveRouteUrl(referenceElement) {
    if (isXiaohongshuPageUrl(window.location.href)) {
      const xiaohongshuRouteUrl = resolveXiaohongshuRouteUrl(referenceElement);
      if (xiaohongshuRouteUrl) {
        return xiaohongshuRouteUrl;
      }
    }

    const scopedUrl = domUtils?.resolveScopedContentUrl?.(referenceElement, {
      normalizeContentUrl,
      currentUrl: window.location.href,
      canonicalUrl: domUtils.resolveCanonicalUrl?.(document) || window.location.href,
      isDetailPage: MEDIA_ROUTE_PATH_RE.test(window.location.pathname),
      extraScopedSelectors: ["article", '[role="dialog"]', "section", "main"],
      maxScopeDepth: 8,
      maxScopedContentLinks: 8,
    });

    const normalizedScopedUrl = normalizeContentUrl(scopedUrl);
    if (normalizedScopedUrl) {
      return normalizedScopedUrl;
    }

    if (shouldAvoidCurrentPageFallback(window.location.href)) {
      return null;
    }

    return normalizeContentUrl(window.location.href) || null;
  }

  function extractTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
    if (ogTitle) {
      return ogTitle;
    }

    return (document.title || "").trim();
  }

  function extractVideoCandidatesFromElement(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return [];
    }

    const candidates = [];
    const collect = (rawUrl, source) => {
      const url = normalizeHttpUrl(rawUrl);
      if (!url) {
        return;
      }

      candidates.push({
        url,
        type: selectionUtils.classifyVideoCandidateType(url),
        confidence: source === "video_element" ? "high" : "medium",
        source,
        mediaType: "video",
      });
    };

    collect(video.currentSrc, "video_element");
    collect(video.src, "video_element");
    collect(video.getAttribute("src"), "video_element");

    video.querySelectorAll("source").forEach((source) => {
      collect(source.src, "video_source");
      collect(source.getAttribute("src"), "video_source");
    });

    return candidates;
  }

  function collectPerformanceCandidates(referenceVideo) {
    const resources = performance.getEntriesByType("resource") || [];
    const referenceHosts = new Set();
    const pageHost = (() => {
      try {
        return new URL(window.location.href).hostname.toLowerCase();
      } catch {
        return null;
      }
    })();
    const directVideoUrl = normalizeHttpUrl(referenceVideo?.currentSrc || referenceVideo?.src);
    if (pageHost) {
      referenceHosts.add(pageHost);
    }
    if (directVideoUrl) {
      try {
        referenceHosts.add(new URL(directVideoUrl).hostname.toLowerCase());
      } catch {
        // Ignore invalid host parsing.
      }
    }

    const candidates = [];
    for (
      let index = resources.length - 1;
      index >= 0 && index > resources.length - PERFORMANCE_SCAN_LIMIT;
      index -= 1
    ) {
      const url = normalizeHttpUrl(resources[index]?.name);
      if (!url) {
        continue;
      }

      const type = selectionUtils.classifyVideoCandidateType(url);
      if (type === "unknown") {
        continue;
      }

      try {
        const host = new URL(url).hostname.toLowerCase();
        if (referenceHosts.size > 0 && !referenceHosts.has(host)) {
          continue;
        }
      } catch {
        continue;
      }

      candidates.push({
        url,
        type,
        confidence: type === "manifest_m3u8" ? "medium" : "low",
        source: "performance_resource",
        mediaType: "video",
      });
    }

    return candidates;
  }

  function scoreVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !isRenderableVideo(video)) {
      return -1;
    }

    const rect = video.getBoundingClientRect();
    const areaScore = rect.width * rect.height;
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    const visibleScore = visibleWidth * visibleHeight;
    const playbackBonus = video.paused ? 0 : 200000;
    const readyBonus = video.readyState >= 2 ? 90000 : 0;
    const currentTimeBonus = video.currentTime > 0 ? 45000 : 0;
    const recentPlayBonus = Math.max(0, 60000 - (Date.now() - (playbackTimestamps.get(video) || 0))) * 4;

    return areaScore + visibleScore + playbackBonus + readyBonus + currentTimeBonus + recentPlayBonus;
  }

  function getVisibleVideos(root = document) {
    return Array.from(root.querySelectorAll("video")).filter(isRenderableVideo);
  }

  function resolveBestVideo(root = document) {
    const videos = getVisibleVideos(root);
    if (videos.length === 0) {
      return null;
    }

    return videos
      .map((video) => ({ video, score: scoreVideo(video) }))
      .sort((left, right) => right.score - left.score)[0]?.video || null;
  }

  function resolveVideoFromTarget(target, point = null) {
    if (target instanceof HTMLVideoElement && isRenderableVideo(target)) {
      return target;
    }

    if (target instanceof Element) {
      const direct = target.closest("video");
      if (direct instanceof HTMLVideoElement && isRenderableVideo(direct)) {
        return direct;
      }

      const nested = target.querySelector?.("video");
      if (nested instanceof HTMLVideoElement && isRenderableVideo(nested)) {
        return nested;
      }

      let current = target;
      for (let depth = 0; current instanceof Element && depth < 4; depth += 1) {
        const descendantVideos = getVisibleVideos(current);
        if (descendantVideos.length > 0) {
          return descendantVideos.sort((left, right) => scoreVideo(right) - scoreVideo(left))[0] || null;
        }
        current = current.parentElement;
      }
    }

    if (point && typeof document.elementsFromPoint === "function") {
      const elements = document.elementsFromPoint(point.x, point.y);
      const pointedVideo = elements.find((element) => element instanceof HTMLVideoElement && isRenderableVideo(element));
      if (pointedVideo instanceof HTMLVideoElement) {
        return pointedVideo;
      }
    }

    return null;
  }

  function buildSelectionPayload(referenceVideo, source, fallbackVideoUrl = null) {
    const routeUrl = resolveRouteUrl(referenceVideo);
    const elementCandidates = extractVideoCandidatesFromElement(referenceVideo);
    const performanceCandidates = collectPerformanceCandidates(referenceVideo);
    const directFallbackCandidate = normalizeHttpUrl(fallbackVideoUrl)
      ? [{
          url: normalizeHttpUrl(fallbackVideoUrl),
          type: selectionUtils.classifyVideoCandidateType(fallbackVideoUrl),
          confidence: "medium",
          source: "message_fallback",
          mediaType: "video",
        }]
      : [];
    const videoCandidates = selectionUtils.mergeVideoCandidates(
      elementCandidates,
      performanceCandidates,
      directFallbackCandidate,
    );
    const videoUrl =
      selectionUtils.selectPreferredVideoUrl(videoCandidates) ||
      normalizeHttpUrl(fallbackVideoUrl) ||
      null;
    const pageUrl = resolveSelectionPageUrl(
      routeUrl,
      videoUrl || fallbackVideoUrl,
      normalizeHttpUrl(window.location.href) || window.location.href,
    );

    return {
      url: routeUrl || videoUrl || pageUrl || window.location.href,
      pageUrl: pageUrl || undefined,
      videoUrl: videoUrl || undefined,
      videoCandidates,
      title: extractTitle(),
      selectionScope: SELECTION_SCOPE_CURRENT_ITEM,
      diagnostics: {
        resolver: "generic_video_detector",
        source,
        candidateCount: videoCandidates.length,
      },
    };
  }

  function resolveSelectionPayload(message) {
    const requestedSrcUrl = normalizeHttpUrl(message?.requestedSrcUrl);
    const now = Date.now();

    if (
      message?.source === "context_menu" &&
      lastContextSelection &&
      now - lastContextSelection.createdAt <= CONTEXT_TTL_MS
    ) {
      return buildSelectionPayload(
        lastContextSelection.video,
        "context_menu",
        requestedSrcUrl || lastContextSelection.videoUrl,
      );
    }

    const bestVideo = resolveBestVideo(document);
    if (bestVideo instanceof HTMLVideoElement) {
      return buildSelectionPayload(bestVideo, message?.source || "popup", requestedSrcUrl);
    }

    if (requestedSrcUrl) {
      const pageUrl = resolveSelectionPageUrl(
        null,
        requestedSrcUrl,
        normalizeHttpUrl(window.location.href) || window.location.href,
      );
      return {
        url: requestedSrcUrl || pageUrl || window.location.href,
        pageUrl: pageUrl || undefined,
        videoUrl: requestedSrcUrl,
        videoCandidates: [{
          url: requestedSrcUrl,
          type: selectionUtils.classifyVideoCandidateType(requestedSrcUrl),
          confidence: "medium",
          source: "context_menu_src",
          mediaType: "video",
        }],
        title: extractTitle(),
        selectionScope: SELECTION_SCOPE_CURRENT_ITEM,
        diagnostics: {
          resolver: "generic_video_detector",
          source: message?.source || "fallback",
          candidateCount: 1,
        },
      };
    }

    return null;
  }

  window.FlowSelectGenericVideoDetectorTestHooks = {
    normalizeContentUrl,
    normalizeXiaohongshuNoteUrl,
    resolveSelectionPageUrl,
    shouldAvoidCurrentPageFallback,
  };

  function rememberContextSelection(event) {
    const point =
      event instanceof MouseEvent
        ? { x: event.clientX, y: event.clientY }
        : null;
    const video = resolveVideoFromTarget(event.target, point);
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    lastContextSelection = {
      video,
      videoUrl: normalizeHttpUrl(video.currentSrc || video.src),
      createdAt: Date.now(),
    };
  }

  document.addEventListener("play", (event) => {
    if (event.target instanceof HTMLVideoElement) {
      playbackTimestamps.set(event.target, Date.now());
    }
  }, true);

  document.addEventListener("playing", (event) => {
    if (event.target instanceof HTMLVideoElement) {
      playbackTimestamps.set(event.target, Date.now());
    }
  }, true);

  document.addEventListener("contextmenu", rememberContextSelection, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_RESOLVE_VIDEO_SELECTION) {
      return false;
    }

    try {
      const payload = resolveSelectionPayload(message);
      if (!payload) {
        sendResponse({
          success: false,
          reason: "no_video_found",
        });
        return true;
      }

      sendResponse({
        success: true,
        payload,
      });
    } catch (error) {
      console.error("[FlowSelect Generic] Failed to resolve video selection:", error);
      sendResponse({
        success: false,
        reason: "resolve_failed",
      });
    }

    return true;
  });
})();
