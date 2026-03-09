// FlowSelect Browser Extension - Pinterest Detector
// Injects download icons on animated Pinterest feed cards and pin detail pages.

(function () {
  "use strict";

  const DETAIL_BUTTON_ID = "flowselect-pinterest-download-btn";
  const DETAIL_BUTTON_CLASS = "flowselect-pinterest-action-btn";
  const CARD_BUTTON_CLASS = "flowselect-pinterest-card-btn";
  const CARD_HOST_ATTR = "data-flowselect-pinterest-card-host";
  const CARD_BUTTON_MODE_ATTR = "data-flowselect-card-mode";
  const HOST_PATCH_ATTR = "data-flowselect-pinterest-host-patched";
  const PIN_PATH_RE = /\/pin\/(\d+)\/?/i;
  const DURATION_RE = /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/;
  const VIDEO_HINT_RE =
    /(?:video_list|story_pin_data|carousel_data|v\d+\.pinimg\.com\/videos|\.m3u8\b|\.mp4\b)/i;
  const PIN_VIDEO_HOST_RE = /(?:^|\/\/)(?:v\d+\.pinimg\.com|i\.pinimg\.com)\//i;
  const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 3a1 1 0 0 1 1 1v8.086l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L11 12.086V4a1 1 0 0 1 1-1M5 17a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1"
    />
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

  function classifyCandidateType(url) {
    const lower = url.toLowerCase();
    if (/\.m3u8(\?|$)/.test(lower)) return "manifest_m3u8";
    if (PIN_VIDEO_HOST_RE.test(lower) || /\.mp4(\?|$)/.test(lower)) return "direct_mp4";
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

  function collectSignalText(root) {
    if (!(root instanceof HTMLElement || root instanceof Document)) {
      return "";
    }

    const parts = [];
    const scope = root instanceof Document ? root.body : root;
    if (!(scope instanceof HTMLElement)) {
      return "";
    }

    const text = (scope.innerText || "").trim();
    if (text) {
      parts.push(text.slice(0, 1600));
    }

    const labeledNodes = Array.from(scope.querySelectorAll("[aria-label], [title]")).slice(0, 24);
    for (const node of labeledNodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      const label = node.getAttribute("aria-label");
      if (label && label.trim()) {
        parts.push(label.trim());
      }

      const title = node.getAttribute("title");
      if (title && title.trim()) {
        parts.push(title.trim());
      }
    }

    return parts.join(" ");
  }

  function textIndicatesAnimated(text) {
    if (typeof text !== "string" || !text.trim()) {
      return false;
    }
    return /\bGIF\b/i.test(text) || /\u52a8\u56fe/.test(text) || DURATION_RE.test(text);
  }

  function rootLooksAnimated(root) {
    if (!(root instanceof HTMLElement || root instanceof Document)) {
      return false;
    }

    const scope = root instanceof Document ? root.body : root;
    if (!(scope instanceof HTMLElement)) {
      return false;
    }

    if (scope.querySelector("video")) {
      return true;
    }

    return textIndicatesAnimated(collectSignalText(scope));
  }

  function extractVideoCandidates(root = document, options = {}) {
    const { includeScripts = true, includePerformance = true } = options;
    const scope = root instanceof Document ? root : root instanceof HTMLElement ? root : document;
    const seen = new Set();
    const candidates = [];

    const collectCandidate = (raw, source) => {
      const url = normalizeCandidateUrl(raw);
      if (!url || seen.has(url)) return;
      if (!PIN_VIDEO_HOST_RE.test(url) && !/\.m3u8(\?|$)|\.mp4(\?|$)/i.test(url)) return;
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

  function selectPreferredVideoUrl(candidates) {
    const directCandidate = candidates.find((candidate) => candidate.type !== "manifest_m3u8");
    return directCandidate ? directCandidate.url : candidates[0]?.url || null;
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
      type: "video_selected",
      url: videoUrl || pageUrl,
      pageUrl,
      videoUrl,
      videoCandidates,
      title,
    });
  }

  function ensurePositionedHost(host) {
    if (!(host instanceof HTMLElement)) {
      return;
    }

    const computedStyle = window.getComputedStyle(host);
    if (computedStyle.position === "static") {
      host.style.position = "relative";
      host.setAttribute(HOST_PATCH_ATTR, "true");
    }
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

  function resolveCardHost(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return null;
    }

    const anchorRect = anchor.getBoundingClientRect();
    let current = anchor;

    for (let depth = 0; depth < 4 && current.parentElement; depth += 1) {
      const parent = current.parentElement;
      if (!(parent instanceof HTMLElement)) {
        break;
      }

      const parentRect = parent.getBoundingClientRect();
      const widthDelta = Math.abs(parentRect.width - anchorRect.width);
      const heightDelta = parentRect.height - anchorRect.height;
      if (widthDelta > 96 || heightDelta > 220) {
        break;
      }

      if (rootLooksAnimated(parent)) {
        return parent;
      }

      current = parent;
    }

    return rootLooksAnimated(anchor) ? anchor : null;
  }

  function createIconButton(className, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = DOWNLOAD_ICON_SVG;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button, event);
    });
    return button;
  }

  function isSaveLikeControl(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const label = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return /\b(save|pin)\b/i.test(label) || /\u4fdd\u5b58/.test(label);
  }

  function findActionMountPoint() {
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
        return { container, reference: reference || container.firstElementChild || null };
      }
    }

    return null;
  }

  function findCardActionMountPoint(host) {
    if (!(host instanceof HTMLElement)) {
      return null;
    }

    const controls = Array.from(
      host.querySelectorAll("button, a, div[role='button']"),
    ).filter(isSaveLikeControl);

    for (const control of controls) {
      const container =
        control.closest('[role="group"]') ||
        control.parentElement ||
        control.closest("div");
      if (!(container instanceof HTMLElement)) {
        continue;
      }

      const containerRect = container.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const isNearTop = containerRect.top <= hostRect.top + Math.min(hostRect.height * 0.4, 120);
      if (!isNearTop) {
        continue;
      }

      return { container, reference: control };
    }

    return null;
  }

  function resolveCardPageUrl(host, button) {
    const datasetUrl = button?.dataset?.pageUrl;
    const normalizedDatasetUrl = normalizePinUrl(datasetUrl);
    if (normalizedDatasetUrl) {
      return normalizedDatasetUrl;
    }

    if (host instanceof HTMLElement) {
      const anchor = host.querySelector('a[href*="/pin/"]');
      if (anchor instanceof HTMLAnchorElement) {
        const normalizedAnchorUrl = normalizePinUrl(anchor.href);
        if (normalizedAnchorUrl) {
          return normalizedAnchorUrl;
        }
      }
    }

    return null;
  }

  function ensureDetailButton() {
    const existing = document.getElementById(DETAIL_BUTTON_ID);
    if (!isPinterestPinPage() || !rootLooksAnimated(document)) {
      existing?.remove();
      return;
    }

    const mountPoint = findActionMountPoint();
    if (!mountPoint || !mountPoint.container) {
      return;
    }

    const button =
      existing ||
      createIconButton(DETAIL_BUTTON_CLASS, "Download with FlowSelect", () => {
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

  function removeStaleCardButtons(activeHosts) {
    document.querySelectorAll(`.${CARD_BUTTON_CLASS}`).forEach((button) => {
      const host = button.closest(`[${CARD_HOST_ATTR}]`);
      if (!(host instanceof HTMLElement) || !activeHosts.has(host) || !host.isConnected) {
        button.remove();
        if (host instanceof HTMLElement && !host.querySelector(`.${CARD_BUTTON_CLASS}`)) {
          maybeRestorePatchedHost(host);
          host.removeAttribute(CARD_HOST_ATTR);
        }
      }
    });
  }

  function ensureCardButtons() {
    const activeHosts = new Set();

    if (isPinterestPinPage()) {
      removeStaleCardButtons(activeHosts);
      return;
    }

    const anchors = Array.from(document.querySelectorAll('a[href*="/pin/"]'));
    for (const anchor of anchors) {
      if (!isRenderableCardAnchor(anchor)) {
        continue;
      }

      const pageUrl = normalizePinUrl(anchor.href);
      if (!pageUrl) {
        continue;
      }

      const host = resolveCardHost(anchor);
      if (!(host instanceof HTMLElement)) {
        continue;
      }

      activeHosts.add(host);
      host.setAttribute(CARD_HOST_ATTR, "true");
      const mountPoint = findCardActionMountPoint(host);
      let button = host.querySelector(`.${CARD_BUTTON_CLASS}`);
      if (button) {
        button.dataset.pageUrl = pageUrl;
        const mode = mountPoint ? "inline" : "fallback";
        if (button.getAttribute(CARD_BUTTON_MODE_ATTR) !== mode) {
          button.setAttribute(CARD_BUTTON_MODE_ATTR, mode);
        }
        if (mountPoint && mountPoint.container instanceof HTMLElement) {
          if (
            button.parentElement !== mountPoint.container ||
            button.previousSibling !== mountPoint.reference
          ) {
            mountPoint.reference.insertAdjacentElement("afterend", button);
          }
        } else if (!mountPoint && button.parentElement !== host) {
          host.appendChild(button);
        }
        continue;
      }

      if (!mountPoint) {
        ensurePositionedHost(host);
      }

      button = createIconButton(CARD_BUTTON_CLASS, "Download with FlowSelect", (currentButton) => {
        const currentPageUrl = resolveCardPageUrl(host, currentButton);
        if (!currentPageUrl) {
          return;
        }

        const scopedCandidates = extractVideoCandidates(host, {
          includeScripts: false,
          includePerformance: false,
        });
        sendDownloadMessage({
          pageUrl: currentPageUrl,
          videoUrl: selectPreferredVideoUrl(scopedCandidates),
          videoCandidates: scopedCandidates,
          title: extractTitle(host),
        });
      });
      button.dataset.pageUrl = pageUrl;
      button.setAttribute(CARD_BUTTON_MODE_ATTR, mountPoint ? "inline" : "fallback");

      if (mountPoint && mountPoint.container instanceof HTMLElement) {
        mountPoint.reference.insertAdjacentElement("afterend", button);
      } else {
        host.appendChild(button);
      }
    }

    removeStaleCardButtons(activeHosts);
  }

  function detectAll() {
    ensureDetailButton();
    ensureCardButtons();
  }

  function scheduleDetect() {
    if (detectTimer !== null) {
      return;
    }

    detectTimer = window.setTimeout(() => {
      detectTimer = null;
      detectAll();
    }, 140);
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
