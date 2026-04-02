// FlowSelect Browser Extension - Pinterest Detector
// Keeps Pinterest card drag payloads enriched and injects a download icon on animated pin detail pages.

(function () {
  "use strict";

  const DETAIL_BUTTON_ID = "flowselect-pinterest-download-btn";
  const DETAIL_BUTTON_CLASS = "flowselect-pinterest-action-btn";
  const DETAIL_GROUP_BUTTON_CLASS = "flowselect-pinterest-detail-group-btn";
  const DETAIL_GROUP_SLOT_CLASS = "flowselect-pinterest-detail-group-slot";
  const DETAIL_SLOT_ATTR = "data-flowselect-pinterest-detail-slot";
  const CARD_HOST_ATTR = "data-flowselect-pinterest-card-host";
  const HOST_PATCH_ATTR = "data-flowselect-pinterest-host-patched";
  const DRAG_SYNC_BOUND_ATTR = "data-flowselect-pinterest-drag-bound";
  const LEGACY_CARD_BUTTON_CLASS = "flowselect-pinterest-card-btn";
  const DRAG_PAYLOAD_MARKER = "FLOWSELECT_PINTEREST_DRAG";
  const PIN_PATH_RE = /\/pin\/(\d+)\/?/i;
  const EXACT_DURATION_RE = /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/;
  const VIDEO_HINT_RE =
    /(?:video_list|story_pin_data|carousel_data|v\d+\.pinimg\.com\/videos|\/videos\/iht\/hls\/|\.m3u8\b|\.mp4\b|\.cmfv\b)/i;
  const DETECT_DELAY_MS = 96;
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;

  let lastUrl = window.location.href;
  let observer = null;
  let detectTimer = null;

  function isPinterestPinPage() {
    return PIN_PATH_RE.test(window.location.pathname);
  }

  function extractPinId(rawUrl) {
    if (typeof rawUrl !== "string") {
      return null;
    }
    const match = rawUrl.match(PIN_PATH_RE);
    return match ? match[1] : null;
  }

  function normalizePinUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return null;
    }

    try {
      const parsed = new URL(rawUrl, window.location.origin);
      const pinId = extractPinId(parsed.pathname);
      if (!pinId) {
        return null;
      }
      return `${parsed.origin}/pin/${pinId}/`;
    } catch (_) {
      return null;
    }
  }

  function normalizeCandidateUrl(raw) {
    if (!raw || typeof raw !== "string") return null;
    const normalized = raw.replace(/\\u002F/g, "/").replace(/&amp;/g, "&").trim();
    if (!normalized.startsWith("http") || normalized.startsWith("blob:")) return null;
    return normalized;
  }

  function isPinterestDirectMp4Url(url) {
    return /\.mp4(?:[?#]|$)/i.test(url);
  }

  function isPinterestManifestUrl(url) {
    return /\.m3u8(?:[?#]|$)/i.test(url);
  }

  function isPinterestStreamLikeUrl(url) {
    return (
      isPinterestManifestUrl(url) ||
      /\.cmfv(?:[?#]|$)/i.test(url) ||
      /\/videos\/iht\/hls\//i.test(url)
    );
  }

  function isPinterestVideoUrl(url) {
    return isPinterestDirectMp4Url(url) || isPinterestStreamLikeUrl(url);
  }

  function classifyCandidateType(url) {
    if (isPinterestDirectMp4Url(url)) return "direct_mp4";
    if (isPinterestStreamLikeUrl(url)) return "manifest_m3u8";
    return "indirect_media";
  }

  function typeScore(type) {
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

  function sourceScore(source) {
    switch (source) {
      case "video_element":
        return 20;
      case "video_source":
        return 18;
      case "pin_json":
        return 16;
      case "script_scan":
        return 12;
      case "performance_resource":
        return 8;
      default:
        return 0;
    }
  }

  function confidenceForScore(score) {
    if (score >= 110) return "high";
    if (score >= 70) return "medium";
    return "low";
  }

  function resolveAnimatedSignalScope(root) {
    if (root instanceof Document) {
      return (
        document.querySelector(
          '[data-test-id="closeup-image"], [data-test-id="closeup-content"], [data-test-id="closeup-pin"], [data-test-id="closeupMainPin"]',
        ) || root.body
      );
    }

    return root;
  }

  function hasAnimatedTextLabel(scope) {
    if (!(scope instanceof HTMLElement)) {
      return false;
    }

    const nodes = [scope, ...Array.from(scope.querySelectorAll("[aria-label], [title], img[alt]"))].slice(
      0,
      36,
    );

    return nodes.some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      const label = [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.getAttribute("alt"),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      return /\b(video|gif)\b/i.test(label) || /\u52a8\u56fe/.test(label);
    });
  }

  function hasDurationBadge(scope) {
    if (!(scope instanceof HTMLElement)) {
      return false;
    }

    const candidates = [scope, ...Array.from(scope.querySelectorAll("span, div, time"))].slice(0, 48);
    return candidates.some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      const text = (node.innerText || node.textContent || "").trim();
      if (!text || text.length > 8) {
        return false;
      }

      return EXACT_DURATION_RE.test(text);
    });
  }

  function rootLooksAnimated(root) {
    if (!(root instanceof HTMLElement || root instanceof Document)) {
      return false;
    }

    const scope = resolveAnimatedSignalScope(root);
    if (!(scope instanceof HTMLElement)) {
      return false;
    }

    if (scope.querySelector("video")) {
      return true;
    }

    if (extractVideoCandidates(scope, { includeScripts: false, includePerformance: false }).length > 0) {
      return true;
    }

    return hasAnimatedTextLabel(scope) || hasDurationBadge(scope);
  }

  function extractVideoCandidates(root = document, options = {}) {
    const { includeScripts = true, includePerformance = true } = options;
    const scope = root instanceof Document ? root : root instanceof HTMLElement ? root : document;
    const seen = new Set();
    const candidates = [];

    const collectCandidate = (raw, source) => {
      const url = normalizeCandidateUrl(raw);
      if (!url || seen.has(url)) return;
      if (!isPinterestVideoUrl(url)) return;
      seen.add(url);
      const type = classifyCandidateType(url);
      const score = typeScore(type) + sourceScore(source);
      candidates.push({
        url,
        type,
        confidence: confidenceForScore(score),
        source,
        score,
      });
    };

    const videoElements = scope.querySelectorAll("video");
    videoElements.forEach((video) => {
      collectCandidate(video.currentSrc, "video_element");
      collectCandidate(video.src, "video_element");
      collectCandidate(video.getAttribute("src"), "video_element");
    });

    scope.querySelectorAll("video source").forEach((source) => {
      collectCandidate(source.getAttribute("src"), "video_source");
      collectCandidate(source.src, "video_source");
    });

    if (includeScripts) {
      scope.querySelectorAll("script").forEach((script) => {
        const text = script.textContent || "";
        if (!VIDEO_HINT_RE.test(text)) {
          return;
        }

        const matches = text.match(/https?:\/\/[^"'\\\s<>]+/gi) || [];
        matches.forEach((match) => collectCandidate(match, "script_scan"));
      });
    }

    if (includePerformance) {
      const resources = performance.getEntriesByType("resource") || [];
      for (
        let index = resources.length - 1;
        index >= 0 && index > resources.length - 80;
        index -= 1
      ) {
        collectCandidate(resources[index] && resources[index].name, "performance_resource");
      }
    }

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map(({ score, ...candidate }) => candidate);
  }

  function extractPinSpecificVideoCandidates(pinId) {
    if (!pinId) {
      return [];
    }

    const seen = new Set();
    const candidates = [];

    const collectCandidate = (raw, source = "pin_json") => {
      const url = normalizeCandidateUrl(raw);
      if (!url || seen.has(url) || !isPinterestVideoUrl(url)) {
        return;
      }

      seen.add(url);
      const type = classifyCandidateType(url);
      const score = typeScore(type) + sourceScore(source);
      candidates.push({
        url,
        type,
        confidence: confidenceForScore(score),
        source,
        score,
      });
    };

    const collectFromVideoList = (videoList) => {
      if (!videoList || typeof videoList !== "object") {
        return;
      }

      Object.values(videoList).forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }
        collectCandidate(entry.url, "pin_json");
      });
    };

    const collectFromPinObject = (value) => {
      if (!value || typeof value !== "object") {
        return;
      }

      collectFromVideoList(value?.videos?.video_list);

      const storyPages = value?.story_pin_data?.pages;
      if (Array.isArray(storyPages)) {
        storyPages.forEach((page) => {
          const blocks = page?.blocks;
          if (!Array.isArray(blocks)) {
            return;
          }
          blocks.forEach((block) => collectFromVideoList(block?.video?.video_list));
        });
      }

      const carouselSlots = value?.carousel_data?.carousel_slots;
      if (Array.isArray(carouselSlots)) {
        carouselSlots.forEach((slot) => collectFromVideoList(slot?.videos?.video_list));
      } else if (carouselSlots && typeof carouselSlots === "object") {
        Object.values(carouselSlots).forEach((slot) => collectFromVideoList(slot?.videos?.video_list));
      }
    };

    const visitValue = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visitValue);
        return;
      }

      if (!value || typeof value !== "object") {
        return;
      }

      const idMatches =
        String(value.id ?? "") === pinId ||
        String(value.pin_id ?? "") === pinId ||
        String(value.pinId ?? "") === pinId;
      if (idMatches) {
        collectFromPinObject(value);
      }

      Object.values(value).forEach(visitValue);
    };

    const parseScriptJson = (scriptText) => {
      if (!scriptText || !scriptText.includes(pinId)) {
        return null;
      }

      const trimmed = scriptText.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return JSON.parse(trimmed);
        } catch (_) {
          return null;
        }
      }

      if (trimmed.includes("__PWS_DATA__")) {
        const jsonStart = trimmed.indexOf("{");
        if (jsonStart >= 0) {
          try {
            return JSON.parse(trimmed.slice(jsonStart).replace(/;\s*$/, ""));
          } catch (_) {
            return null;
          }
        }
      }

      return null;
    };

    document.querySelectorAll("script").forEach((script) => {
      const text = script.textContent || "";
      if (!text.includes(pinId)) {
        return;
      }

      const parsed = parseScriptJson(text);
      if (parsed) {
        visitValue(parsed);
      }
    });

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map(({ score, ...candidate }) => candidate);
  }

  function selectPreferredVideoUrl(candidates) {
    const directCandidate = candidates.find((candidate) => isPinterestDirectMp4Url(candidate?.url || ""));
    if (directCandidate) {
      return directCandidate.url;
    }

    const manifestCandidate = candidates.find((candidate) => isPinterestManifestUrl(candidate?.url || ""));
    if (manifestCandidate) {
      return manifestCandidate.url;
    }

    return null;
  }

  function extractTitle(scope = document.body) {
    const root = scope instanceof HTMLElement ? scope : document.body;
    const metaTitle = document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content");
    if (metaTitle && metaTitle.trim()) {
      return metaTitle.trim();
    }

    const label = root?.getAttribute?.("aria-label");
    if (label && label.trim()) {
      return label.trim();
    }

    const imageAlt = root?.querySelector?.("img")?.getAttribute("alt");
    if (imageAlt && imageAlt.trim()) {
      return imageAlt.trim();
    }

    return document.title.replace(/\s*\|\s*Pinterest\s*$/i, "").trim();
  }

  function sendDownloadMessage({ pageUrl, videoUrl = null, videoCandidates = [], title = "" }) {
    chrome.runtime.sendMessage({
      type: "video_selection",
      url: videoUrl || pageUrl,
      pageUrl,
      videoUrl,
      videoCandidates,
      title,
    });
  }

  function encodeUtf8Base64(value) {
    try {
      return btoa(
        encodeURIComponent(value).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        ),
      );
    } catch (_) {
      return "";
    }
  }

  function buildDragPayloadComment(payload) {
    const encoded = encodeUtf8Base64(JSON.stringify(payload));
    if (!encoded) {
      return "";
    }
    return `<!--${DRAG_PAYLOAD_MARKER}:${encoded}-->`;
  }

  function buildDragPayloadText(payload) {
    const encoded = encodeUtf8Base64(JSON.stringify(payload));
    if (!encoded) {
      return "";
    }
    return `${DRAG_PAYLOAD_MARKER}:${encoded}`;
  }

  function buildDragHtml(scope, payload) {
    const htmlRoot = scope instanceof HTMLElement ? scope : null;
    const sourceHtml = htmlRoot?.outerHTML || "";
    const payloadComment = buildDragPayloadComment(payload);
    return `${payloadComment}${sourceHtml}`;
  }

  function collectDragVideoCandidates(scope, pageUrl) {
    const pinId = extractPinId(pageUrl);
    const pinCandidates = extractPinSpecificVideoCandidates(pinId);
    if (pinCandidates.length > 0) {
      return pinCandidates;
    }

    const scopedCandidates = extractVideoCandidates(scope, {
      includeScripts: false,
      includePerformance: false,
    });
    if (scopedCandidates.length > 0) {
      return scopedCandidates;
    }

    if (isPinterestPinPage() && normalizePinUrl(window.location.href) === pageUrl) {
      return extractVideoCandidates(document, {
        includeScripts: true,
        includePerformance: true,
      });
    }

    return scopedCandidates;
  }

  function buildDragPayload(scope, pageUrl) {
    const videoCandidates = collectDragVideoCandidates(scope, pageUrl);
    return {
      pageUrl,
      videoUrl: selectPreferredVideoUrl(videoCandidates),
      videoCandidates,
      title: extractTitle(scope instanceof HTMLElement ? scope : document.body),
    };
  }

  function enrichPinterestDragDataTransfer(event, scope, pageUrl) {
    if (!(event instanceof DragEvent) || !event.dataTransfer || !pageUrl) {
      return;
    }

    const payload = buildDragPayload(scope, pageUrl);
    const enrichedHtml = buildDragHtml(scope, payload);
    const dragPayloadText = buildDragPayloadText(payload);
    if (enrichedHtml) {
      event.dataTransfer.setData("text/html", enrichedHtml);
    }
    if (dragPayloadText) {
      event.dataTransfer.setData("text/plain", `${pageUrl}\n${dragPayloadText}`);
      event.dataTransfer.setData("application/x-flowselect-pinterest-drag", dragPayloadText);
    } else {
      event.dataTransfer.setData("text/plain", pageUrl);
    }
    event.dataTransfer.setData("text/uri-list", pageUrl);
  }

  function resolveDragPinterestContext(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const host = target.closest(`[${CARD_HOST_ATTR}]`);
    if (host instanceof HTMLElement) {
      const pageUrl = resolveCardPageUrl(host);
      if (pageUrl) {
        return { scope: host, pageUrl };
      }
    }

    const anchor = target.closest('a[href*="/pin/"]');
    if (anchor instanceof HTMLAnchorElement) {
      const pageUrl = normalizePinUrl(anchor.href);
      if (pageUrl) {
        return {
          scope: resolveCardHost(anchor) || anchor,
          pageUrl,
        };
      }
    }

    if (isPinterestPinPage() && rootLooksAnimated(document)) {
      const pageUrl = normalizePinUrl(window.location.href);
      if (pageUrl) {
        return {
          scope: document.body,
          pageUrl,
        };
      }
    }

    return null;
  }

  function maybeRestorePatchedHost(host) {
    if (!(host instanceof HTMLElement)) {
      return;
    }

    if (host.getAttribute(HOST_PATCH_ATTR) === "true") {
      host.style.removeProperty("position");
      host.removeAttribute(HOST_PATCH_ATTR);
    }
  }

  function removeLegacyCardButtons() {
    document.querySelectorAll(`.${LEGACY_CARD_BUTTON_CLASS}`).forEach((button) => {
      const host = button.closest(`[${CARD_HOST_ATTR}]`);
      button.remove();
      if (host instanceof HTMLElement && !host.querySelector(`.${LEGACY_CARD_BUTTON_CLASS}`)) {
        host.removeAttribute(CARD_HOST_ATTR);
        maybeRestorePatchedHost(host);
      }
    });
  }

  function collectDistinctPinUrls(root) {
    if (!(root instanceof HTMLElement)) {
      return [];
    }

    const urls = new Set();
    if (root instanceof HTMLAnchorElement) {
      const rootUrl = normalizePinUrl(root.href);
      if (rootUrl) {
        urls.add(rootUrl);
      }
    }

    root.querySelectorAll('a[href*="/pin/"]').forEach((anchor) => {
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const url = normalizePinUrl(anchor.href);
      if (url) {
        urls.add(url);
      }
    });

    return Array.from(urls);
  }

  function isRenderableCardAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return false;
    }

    if (!normalizePinUrl(anchor.href)) {
      return false;
    }

    if (!anchor.querySelector("img, video")) {
      return false;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) {
      return false;
    }

    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function rectFitsCardBounds(candidateRect, anchorRect) {
    const widthDelta = Math.abs(candidateRect.width - anchorRect.width);
    const heightDelta = Math.abs(candidateRect.height - anchorRect.height);
    const topDelta = Math.abs(candidateRect.top - anchorRect.top);
    const leftDelta = Math.abs(candidateRect.left - anchorRect.left);

    return (
      widthDelta <= 48 &&
      heightDelta <= 112 &&
      topDelta <= 48 &&
      leftDelta <= 48 &&
      candidateRect.width >= 120 &&
      candidateRect.height >= 120
    );
  }

  function resolveCardHost(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return null;
    }

    const anchorRect = anchor.getBoundingClientRect();
    let bestHost = rootLooksAnimated(anchor) ? anchor : null;
    let current = anchor;

    for (let depth = 0; depth < 4 && current.parentElement; depth += 1) {
      const parent = current.parentElement;
      if (!(parent instanceof HTMLElement)) {
        break;
      }

      const parentRect = parent.getBoundingClientRect();
      if (!rectFitsCardBounds(parentRect, anchorRect)) {
        break;
      }

      if (rootLooksAnimated(parent)) {
        bestHost = parent;
      }

      current = parent;
    }

    return bestHost;
  }

  function createIconButton(className, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = CAT_ICON_SVG;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button, event);
    });
    return button;
  }

  function createCatSvgElement() {
    const template = document.createElement("template");
    template.innerHTML = CAT_ICON_SVG.trim();
    const catSvg = template.content.firstElementChild;
    return catSvg instanceof SVGElement ? catSvg : null;
  }

  function extractControlLabel(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function isSaveLikeControl(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const label = extractControlLabel(element);
    return /\b(save|pin)\b/i.test(label) || /\u4fdd\u5b58/.test(label);
  }

  function resolveCardPageUrl(host) {
    if (host instanceof HTMLElement) {
      const hostPinUrls = collectDistinctPinUrls(host);
      if (hostPinUrls.length === 1) {
        return hostPinUrls[0];
      }
    }

    return null;
  }

  function ensureCardHostDragSync(host) {
    if (!(host instanceof HTMLElement) || host.getAttribute(DRAG_SYNC_BOUND_ATTR) === "true") {
      return;
    }

    host.addEventListener(
      "dragstart",
      (event) => {
        const pageUrl = resolveCardPageUrl(host);
        if (!pageUrl) {
          return;
        }
        enrichPinterestDragDataTransfer(event, host, pageUrl);
      },
      true,
    );
    host.setAttribute(DRAG_SYNC_BOUND_ATTR, "true");
  }

  function removeStaleCardHosts(activeHosts) {
    document.querySelectorAll(`[${CARD_HOST_ATTR}]`).forEach((host) => {
      if (!(host instanceof HTMLElement)) {
        return;
      }

      if (activeHosts.has(host) && host.isConnected) {
        return;
      }

      host.removeAttribute(CARD_HOST_ATTR);
      maybeRestorePatchedHost(host);
    });
  }

  function ensureCardDragHosts() {
    const activeHosts = new Set();
    const currentPinUrl = isPinterestPinPage() ? normalizePinUrl(window.location.href) : null;
    const anchors = Array.from(document.querySelectorAll('a[href*="/pin/"]'));

    for (const anchor of anchors) {
      if (!isRenderableCardAnchor(anchor)) {
        continue;
      }

      const pageUrl = normalizePinUrl(anchor.href);
      if (!pageUrl || (currentPinUrl && pageUrl === currentPinUrl)) {
        continue;
      }

      const host = resolveCardHost(anchor);
      if (!(host instanceof HTMLElement)) {
        continue;
      }

      const hostPinUrls = collectDistinctPinUrls(host);
      if (hostPinUrls.length !== 1 || hostPinUrls[0] !== pageUrl) {
        continue;
      }

      activeHosts.add(host);
      host.setAttribute(CARD_HOST_ATTR, "true");
      ensureCardHostDragSync(host);
    }

    removeStaleCardHosts(activeHosts);
  }

  function findActionMountPoint() {
    const detailShareMount = findDetailShareMountPoint();
    if (detailShareMount) {
      return detailShareMount;
    }

    const explicitSelectors = [
      '[data-test-id="closeupActionBar"]',
      '[data-test-id="closeup-action-bar"]',
      '[data-test-id="closeupActions"]',
      '[data-test-id="pin-action-bar"]',
      '[data-test-id="closeupPrimaryAction"]',
    ];

    for (const selector of explicitSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        const reference = Array.from(
          container.querySelectorAll("button, a, div[role='button']"),
        ).find(isSaveLikeControl);
        return {
          mode: "action-bar",
          container,
          reference: reference || container.firstElementChild || null,
        };
      }
    }

    return null;
  }

  function findDetailShareMountPoint() {
    const shareRoot = document.querySelector('[data-test-id="closeup-share-button"]');
    if (!(shareRoot instanceof HTMLElement)) {
      return null;
    }

    const referenceSlot = shareRoot.closest(".oRZ5_s");
    const container = referenceSlot?.parentElement;
    if (!(referenceSlot instanceof HTMLElement) || !(container instanceof HTMLElement)) {
      return null;
    }

    return {
      mode: "detail-social-group",
      container,
      reference: referenceSlot,
      template: referenceSlot,
    };
  }

  function createDetailGroupSlot(templateSlot, onClick) {
    if (!(templateSlot instanceof HTMLElement)) {
      return null;
    }

    const slot = templateSlot.cloneNode(true);
    if (!(slot instanceof HTMLElement)) {
      return null;
    }

    slot.setAttribute(DETAIL_SLOT_ATTR, "true");
    slot.classList.add(DETAIL_GROUP_SLOT_CLASS);
    const button = slot.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) {
      return null;
    }

    slot.querySelector('[data-test-id="reactions-count"]')?.remove();
    slot.querySelectorAll("[data-test-id]").forEach((element) => {
      element.removeAttribute("data-test-id");
    });

    slot.querySelectorAll("[aria-label]").forEach((element) => {
      const label = element.getAttribute("aria-label") || "";
      if (
        /\b(react|comments?|share|send|more actions?)\b/i.test(label) ||
        /(\u8d5e|\u70b9\u8d5e|\u8bc4\u8bba|\u5206\u4eab|\u53d1\u9001)/.test(label)
      ) {
        element.setAttribute("aria-label", "Download with FlowSelect");
      }
    });

    button.id = DETAIL_BUTTON_ID;
    button.type = "button";
    button.classList.add(DETAIL_GROUP_BUTTON_CLASS);
    button.title = "Download with FlowSelect";
    button.setAttribute("aria-label", "Download with FlowSelect");
    button.removeAttribute("aria-expanded");
    button.removeAttribute("aria-haspopup");

    const iconShell = button.querySelector(".VHreRh");
    if (iconShell instanceof HTMLElement) {
      const nativeSvg = iconShell.querySelector("svg");
      const catSvg = createCatSvgElement();
      if (nativeSvg instanceof SVGElement && catSvg instanceof SVGElement) {
        for (const attribute of nativeSvg.getAttributeNames()) {
          const value = nativeSvg.getAttribute(attribute);
          if (value != null && attribute !== "viewBox") {
            catSvg.setAttribute(attribute, value);
          }
        }
        catSvg.setAttribute("role", "img");
        catSvg.setAttribute("aria-hidden", "true");
        catSvg.setAttribute("focusable", "false");
        nativeSvg.replaceWith(catSvg);
      } else if (catSvg instanceof SVGElement) {
        iconShell.replaceChildren(catSvg);
      }
    } else {
      button.innerHTML = CAT_ICON_SVG;
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button, event);
    });

    return slot;
  }

  function ensureDetailButton() {
    const existing = document.getElementById(DETAIL_BUTTON_ID);
    const existingSlot = document.querySelector(`[${DETAIL_SLOT_ATTR}="true"]`);
    if (!isPinterestPinPage() || !rootLooksAnimated(document)) {
      existing?.remove();
      existingSlot?.remove();
      return;
    }

    const mountPoint = findActionMountPoint();
    if (!mountPoint || !mountPoint.container) {
      return;
    }

    const handleDownload = () => {
      const pageUrl = normalizePinUrl(window.location.href);
      if (!pageUrl) {
        return;
      }
      const videoCandidates = extractVideoCandidates(document, {
        includeScripts: true,
        includePerformance: true,
      });
      sendDownloadMessage({
        pageUrl,
        videoUrl: selectPreferredVideoUrl(videoCandidates),
        videoCandidates,
        title: extractTitle(document.body),
      });
    };

    if (mountPoint.mode === "detail-social-group") {
      let slot = existingSlot instanceof HTMLElement ? existingSlot : null;
      let button = existing instanceof HTMLElement ? existing : null;

      if (!(slot instanceof HTMLElement) || !(button instanceof HTMLElement) || !slot.contains(button)) {
        slot?.remove();
        button?.remove();
        slot = createDetailGroupSlot(mountPoint.template, handleDownload);
        button = slot?.querySelector(`#${DETAIL_BUTTON_ID}`) || null;
      }

      if (!(slot instanceof HTMLElement) || !(button instanceof HTMLElement)) {
        return;
      }

      if (slot.parentElement !== mountPoint.container || slot.previousSibling !== mountPoint.reference) {
        mountPoint.reference.insertAdjacentElement("afterend", slot);
      }
      return;
    }

    existingSlot?.remove();
    const button =
      existing ||
      createIconButton(DETAIL_BUTTON_CLASS, "Download with FlowSelect", () => {
        handleDownload();
      });

    if (!button.id) {
      button.id = DETAIL_BUTTON_ID;
    }

    if (mountPoint.reference && mountPoint.reference.parentElement === mountPoint.container) {
      if (button.parentElement !== mountPoint.container || button.previousSibling !== mountPoint.reference) {
        mountPoint.reference.insertAdjacentElement("afterend", button);
      }
      return;
    }

    if (button.parentElement !== mountPoint.container) {
      mountPoint.container.appendChild(button);
    }
  }

  function detectAll() {
    ensureDetailButton();
    removeLegacyCardButtons();
    ensureCardDragHosts();
  }

  function scheduleDetect() {
    if (detectTimer !== null) {
      return;
    }

    detectTimer = window.setTimeout(() => {
      detectTimer = null;
      detectAll();
    }, DETECT_DELAY_MS);
  }

  function handleUrlChange() {
    if (window.location.href === lastUrl) {
      return;
    }

    lastUrl = window.location.href;
    document.getElementById(DETAIL_BUTTON_ID)?.remove();
    scheduleDetect();
  }

  function init() {
    scheduleDetect();

    document.addEventListener("dragstart", (event) => {
      const context = resolveDragPinterestContext(event.target);
      if (!context) {
        return;
      }

      enrichPinterestDragDataTransfer(event, context.scope, context.pageUrl);
    });

    observer = new MutationObserver(() => {
      handleUrlChange();
      scheduleDetect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(handleUrlChange, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
