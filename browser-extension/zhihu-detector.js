// FlowSelect Browser Extension - Zhihu Video Detector
// Detects Zhihu zvideo player controls and injects a download button into the control bar.

(function () {
  "use strict";

  const PROCESSED_ATTR = "data-flowselect-zhihu-processed";
  const BUTTON_CLASS = "flowselect-zhihu-control-btn";
  const BUTTON_ATTR = "data-flowselect-zhihu-button";
  const BUTTON_VALUE = "control";
  const ITEM_ATTR = "data-flowselect-zhihu-item";
  const ITEM_VALUE = "control";
  const DETECT_DELAY_MS = 140;
  const URL_CHECK_INTERVAL_MS = 900;
  const MIN_VIDEO_WIDTH = 220;
  const MIN_VIDEO_HEIGHT = 120;
  const CONTROL_SELECTORS = [
    "[class*='ControlBar']",
    "[class*='controlBar']",
    "[class*='Controls']",
    "[class*='controls']",
    "[class*='Toolbar']",
    "[class*='toolbar']",
    "[class*='ActionBar']",
    "[class*='actionBar']",
    "[class*='Operations']",
    "[class*='operations']",
    "[class*='Footer']",
    "[class*='footer']",
  ];
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;

  let detectTimer = null;
  let lastUrl = window.location.href;

  function isZhihuVideoPage() {
    return /^\/zvideo\/\d+/i.test(window.location.pathname);
  }

  function normalizeHttpUrl(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.replace(/\\u002F/g, "/").trim();
    if (!trimmed || /^(?:blob|data|file|javascript|mailto):/i.test(trimmed)) {
      return null;
    }

    try {
      const normalized = new URL(trimmed).toString();
      return /^https?:\/\//i.test(normalized) ? normalized : null;
    } catch {
      return null;
    }
  }

  function normalizePageUrl(value = window.location.href) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return window.location.href;
    }
  }

  function isRenderable(element, { minWidth = 1, minHeight = 1 } = {}) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < minWidth || rect.height < minHeight) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none"
      && style.visibility !== "hidden"
      && Number.parseFloat(style.opacity || "1") > 0
    );
  }

  function collectVisibleVideos() {
    return Array.from(document.querySelectorAll("video"))
      .filter((video) => (
        video instanceof HTMLVideoElement
        && isRenderable(video, { minWidth: MIN_VIDEO_WIDTH, minHeight: MIN_VIDEO_HEIGHT })
      ));
  }

  function getActiveVideoElement() {
    const videos = collectVisibleVideos();
    if (videos.length === 0) {
      return null;
    }

    return videos
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const area = rect.width * rect.height;
        const viewportScore = Math.max(0, rect.bottom) - Math.max(0, rect.top);
        return { video, area, viewportScore };
      })
      .sort((left, right) => {
        if (right.area !== left.area) {
          return right.area - left.area;
        }
        return right.viewportScore - left.viewportScore;
      })[0]?.video || null;
  }

  function resolvePlayerRoot(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return null;
    }

    const videoRect = video.getBoundingClientRect();
    const candidateSelectors = [
      "[class*='VideoPlayer']",
      "[class*='videoPlayer']",
      "[class*='Player']",
      "[class*='player']",
      "[class*='ZVideo']",
      "[class*='zvideo']",
      "[class*='VideoCard']",
      "[class*='videoCard']",
    ];

    for (const selector of candidateSelectors) {
      const candidate = video.closest(selector);
      if (
        candidate instanceof HTMLElement
        && isRenderable(candidate, { minWidth: videoRect.width, minHeight: videoRect.height })
      ) {
        return candidate;
      }
    }

    let current = video.parentElement;
    let best = video.parentElement instanceof HTMLElement ? video.parentElement : null;

    while (current && current !== document.body) {
      if (!isRenderable(current, { minWidth: MIN_VIDEO_WIDTH, minHeight: MIN_VIDEO_HEIGHT })) {
        current = current.parentElement;
        continue;
      }

      const rect = current.getBoundingClientRect();
      const widthDelta = rect.width - videoRect.width;
      const heightDelta = rect.height - videoRect.height;
      const notTooLarge = rect.width <= window.innerWidth * 0.96 && rect.height <= window.innerHeight * 0.96;

      if (widthDelta >= 0 && heightDelta >= 0 && widthDelta <= 260 && heightDelta <= 220 && notTooLarge) {
        best = current;
      }

      current = current.parentElement;
    }

    return best;
  }

  function scoreControlBarCandidate(candidate, videoRect, source) {
    const rect = candidate.getBoundingClientRect();
    const label = `${candidate.className || ""} ${candidate.id || ""}`.toLowerCase();
    const buttonLikeCount = candidate.querySelectorAll("button, [role='button'], [class*='Button'], [class*='button']").length;
    const horizontalOverlap = Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left);
    if (horizontalOverlap < Math.min(videoRect.width * 0.35, 140)) {
      return -1;
    }

    if (rect.bottom < videoRect.bottom - 100 || rect.top > videoRect.bottom + 18) {
      return -1;
    }

    let score = source === "selector" ? 80 : 0;
    if (/(control|toolbar|action|operation|footer|button|bar)/.test(label)) {
      score += 60;
    }
    score += Math.min(buttonLikeCount, 8) * 8;

    const bottomDelta = Math.abs(rect.bottom - videoRect.bottom);
    score += Math.max(0, 42 - bottomDelta);

    const widthRatio = rect.width / Math.max(videoRect.width, 1);
    if (widthRatio >= 0.3 && widthRatio <= 1.08) {
      score += 20;
    }

    return score;
  }

  function collectControlBarCandidates(playerRoot, video) {
    if (!(playerRoot instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) {
      return [];
    }

    const videoRect = video.getBoundingClientRect();
    const seen = new Set();
    const ranked = [];

    const pushCandidate = (candidate, source) => {
      if (!(candidate instanceof HTMLElement) || seen.has(candidate)) {
        return;
      }
      if (!playerRoot.contains(candidate)) {
        return;
      }
      if (!isRenderable(candidate, { minWidth: 140, minHeight: 24 })) {
        return;
      }

      const score = scoreControlBarCandidate(candidate, videoRect, source);
      if (score < 0) {
        return;
      }

      seen.add(candidate);
      ranked.push({ candidate, score });
    };

    for (const selector of CONTROL_SELECTORS) {
      for (const candidate of playerRoot.querySelectorAll(selector)) {
        pushCandidate(candidate, "selector");
      }
    }

    const nativeButtons = playerRoot.querySelectorAll("button, [role='button'], [class*='Button'], [class*='button']");
    for (const nativeButton of nativeButtons) {
      let current = nativeButton instanceof HTMLElement ? nativeButton.parentElement : null;
      let depth = 0;
      while (current && current !== playerRoot && depth < 3) {
        pushCandidate(current, "button-parent");
        current = current.parentElement;
        depth += 1;
      }
    }

    return ranked
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.candidate);
  }

  function resolveControlBar(playerRoot, video) {
    return collectControlBarCandidates(playerRoot, video)[0] || null;
  }

  function getControlButtons(controlBar) {
    if (!(controlBar instanceof HTMLElement)) {
      return [];
    }

    return Array.from(
      controlBar.querySelectorAll("button, [role='button'], [class*='Button'], [class*='button']"),
    )
      .filter((candidate) => (
        candidate instanceof HTMLElement
        && candidate.getAttribute(BUTTON_ATTR) !== BUTTON_VALUE
        && isRenderable(candidate, { minWidth: 12, minHeight: 12 })
      ))
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.right - leftRect.right;
      });
  }

  function syncButtonMetrics(button, referenceButton) {
    if (!(button instanceof HTMLElement) || !(referenceButton instanceof HTMLElement)) {
      return;
    }

    const rect = referenceButton.getBoundingClientRect();
    const style = window.getComputedStyle(referenceButton);

    if (rect.height >= 18 && rect.height <= 56) {
      button.style.height = `${Math.round(rect.height)}px`;
      button.style.minWidth = `${Math.max(Math.round(rect.height), 28)}px`;
    }

    if (style.marginLeft) {
      button.style.marginLeft = style.marginLeft;
    }
    if (style.marginRight) {
      button.style.marginRight = style.marginRight;
    }
    if (style.borderRadius && style.borderRadius !== "0px") {
      button.style.borderRadius = style.borderRadius;
    }
  }

  function extractTitle() {
    const ogTitle = document.querySelector("meta[property='og:title']")?.getAttribute("content");
    if (ogTitle && ogTitle.trim()) {
      return ogTitle.trim();
    }

    const heading = document.querySelector("h1");
    if (heading?.textContent?.trim()) {
      return heading.textContent.trim();
    }

    return document.title.replace(/\s*-\s*知乎\s*$/, "").trim();
  }

  function isLikelyZhihuMediaUrl(url) {
    const normalized = normalizeHttpUrl(url);
    if (!normalized) {
      return false;
    }

    if (/\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/i.test(normalized)) {
      return false;
    }

    return (
      /(zhimg\.com|zhihu\.com|vod|video|play|stream)/i.test(normalized)
      || /\.(?:mp4|m3u8|mov|m4v)(?:[?#]|$)/i.test(normalized)
    );
  }

  function classifyCandidateType(url) {
    const lower = url.toLowerCase();
    if (/\.m3u8(?:[?#]|$)/i.test(lower)) {
      return "manifest_m3u8";
    }
    if (/(zhimg\.com|vod|video|stream)/i.test(lower)) {
      return "direct_cdn";
    }
    if (/\.mp4(?:[?#]|$)/i.test(lower)) {
      return "direct_mp4";
    }
    return "indirect_media";
  }

  function candidateTypeScore(type) {
    switch (type) {
      case "direct_cdn":
        return 100;
      case "direct_mp4":
        return 90;
      case "indirect_media":
        return 45;
      case "manifest_m3u8":
        return 15;
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
      case "json_ld":
        return 16;
      case "performance_resource":
        return 12;
      case "script_scan":
        return 6;
      default:
        return 0;
    }
  }

  function confidenceForScore(score) {
    if (score >= 108) {
      return "high";
    }
    if (score >= 72) {
      return "medium";
    }
    return "low";
  }

  function extractVideoCandidates() {
    const seen = new Set();
    const candidates = [];

    const pushCandidate = (rawUrl, source) => {
      const url = normalizeHttpUrl(rawUrl);
      if (!url || seen.has(url) || !isLikelyZhihuMediaUrl(url)) {
        return;
      }

      seen.add(url);
      const type = classifyCandidateType(url);
      const score = candidateTypeScore(type) + sourceScore(source);
      candidates.push({
        url,
        type,
        confidence: confidenceForScore(score),
        source,
        score,
      });
    };

    for (const video of collectVisibleVideos()) {
      pushCandidate(video.currentSrc, "video_element");
      pushCandidate(video.src, "video_element");
      pushCandidate(video.getAttribute("src"), "video_element");

      for (const source of video.querySelectorAll("source")) {
        pushCandidate(source.src, "video_source");
        pushCandidate(source.getAttribute("src"), "video_source");
      }
    }

    for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
      try {
        const payload = JSON.parse(script.textContent || "{}");
        pushCandidate(payload?.contentUrl, "json_ld");
        pushCandidate(payload?.video?.contentUrl, "json_ld");
      } catch {
        // Ignore malformed JSON-LD from the page.
      }
    }

    const resources = performance.getEntriesByType("resource") || [];
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      pushCandidate(resources[index]?.name, "performance_resource");
    }

    const urlPattern = /https?:\/\/[^\s"'\\]+/g;
    for (const script of document.querySelectorAll("script")) {
      const text = (script.textContent || "").replace(/\\u002F/g, "/");
      if (!text) {
        continue;
      }

      const matches = text.match(urlPattern) || [];
      for (const match of matches) {
        pushCandidate(match, "script_scan");
      }
    }

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map(({ score, ...candidate }) => candidate);
  }

  function extractVideoUrl(candidates = extractVideoCandidates()) {
    const bestDirect = candidates.find((candidate) => (
      candidate.type === "direct_cdn" || candidate.type === "direct_mp4"
    ));

    return bestDirect?.url || null;
  }

  function handleDownload() {
    const pageUrl = normalizePageUrl();
    const videoCandidates = extractVideoCandidates();
    const videoUrl = extractVideoUrl(videoCandidates);

    chrome.runtime.sendMessage({
      type: "video_selection",
      url: videoUrl || pageUrl,
      pageUrl,
      videoUrl: videoUrl || undefined,
      videoCandidates,
      title: extractTitle(),
      selectionScope: "current_item",
    });
  }

  function createControlButton(nativeClassName = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [nativeClassName.trim(), BUTTON_CLASS].filter(Boolean).join(" ");
    button.title = "Download with FlowSelect";
    button.setAttribute("aria-label", "Download with FlowSelect");
    button.setAttribute(BUTTON_ATTR, BUTTON_VALUE);
    button.innerHTML = CAT_ICON_SVG;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleDownload();
    });

    return button;
  }

  function resolveExactMountTarget(controlBar) {
    if (!(controlBar instanceof HTMLElement)) {
      return null;
    }

    const speedLabel = Array.from(controlBar.querySelectorAll("span, button"))
      .find((candidate) => candidate.textContent?.trim() === "倍速");
    const speedButton = speedLabel?.closest("button");
    const speedItem = speedButton?.parentElement;
    const groupContainer = speedItem?.parentElement;

    if (
      !(speedButton instanceof HTMLElement)
      || !(speedItem instanceof HTMLElement)
      || !(groupContainer instanceof HTMLElement)
      || !groupContainer.contains(speedItem)
    ) {
      return null;
    }

    const iconReference = Array.from(groupContainer.querySelectorAll("button"))
      .find((candidate) => (
        candidate instanceof HTMLElement
        && candidate !== speedButton
        && candidate.getAttribute(BUTTON_ATTR) !== BUTTON_VALUE
        && !!candidate.getAttribute("aria-label")
      )) || speedButton;

    return {
      mountTarget: groupContainer,
      anchorItem: speedItem,
      referenceButton: iconReference instanceof HTMLElement ? iconReference : speedButton,
      itemClassName: speedItem.className || "",
      nativeButtonClassName: iconReference instanceof HTMLElement ? iconReference.className || "" : "",
    };
  }

  function ensureExactMountItem(exactTarget) {
    if (!exactTarget) {
      return null;
    }

    const {
      mountTarget,
      anchorItem,
      itemClassName,
      nativeButtonClassName,
    } = exactTarget;

    let item = mountTarget.querySelector(`[${ITEM_ATTR}='${ITEM_VALUE}']`);
    if (!(item instanceof HTMLElement)) {
      item = document.createElement("div");
      if (itemClassName) {
        item.className = itemClassName;
      }
      item.setAttribute(ITEM_ATTR, ITEM_VALUE);
    } else if (itemClassName && item.className !== itemClassName) {
      item.className = itemClassName;
    }

    let button = item.querySelector(`button.${BUTTON_CLASS}`);
    if (!(button instanceof HTMLElement)) {
      button?.remove();
      button = createControlButton(nativeButtonClassName);
      item.replaceChildren(button);
    } else if (nativeButtonClassName) {
      button.className = [nativeButtonClassName.trim(), BUTTON_CLASS].filter(Boolean).join(" ");
    }

    if (item.parentElement !== mountTarget) {
      mountTarget.insertBefore(item, anchorItem);
    } else if (item.nextElementSibling !== anchorItem) {
      mountTarget.insertBefore(item, anchorItem);
    }

    return { item, button };
  }

  function insertButton(controlBar, button, referenceButton) {
    if (!(controlBar instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      return;
    }

    let mountTarget = controlBar;
    if (
      referenceButton instanceof HTMLElement
      && referenceButton.parentElement instanceof HTMLElement
      && referenceButton.parentElement !== controlBar
      && referenceButton.parentElement.childElementCount <= 8
    ) {
      mountTarget = referenceButton.parentElement;
    }

    if (button.parentElement !== mountTarget) {
      button.remove();
    }

    if (button.parentElement !== mountTarget) {
      if (referenceButton instanceof HTMLElement && referenceButton.parentElement === mountTarget) {
        mountTarget.insertBefore(button, referenceButton.nextSibling);
      } else {
        mountTarget.appendChild(button);
      }
    }
  }

  function cleanupStaleButtons(activeControlBar) {
    document.querySelectorAll(`[${ITEM_ATTR}='${ITEM_VALUE}']`).forEach((item) => {
      const active = activeControlBar instanceof HTMLElement && activeControlBar.contains(item);
      if (!active) {
        item.remove();
      }
    });

    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
      const active = activeControlBar instanceof HTMLElement && activeControlBar.contains(button);
      if (!active) {
        button.remove();
      }
    });

    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((element) => {
      if (element !== activeControlBar) {
        element.removeAttribute(PROCESSED_ATTR);
      }
    });
  }

  function ensureButton() {
    if (!isZhihuVideoPage()) {
      cleanupStaleButtons(null);
      return;
    }

    const video = getActiveVideoElement();
    if (!(video instanceof HTMLVideoElement)) {
      cleanupStaleButtons(null);
      return;
    }

    const playerRoot = resolvePlayerRoot(video);
    const controlBar = resolveControlBar(playerRoot, video);
    if (!(controlBar instanceof HTMLElement)) {
      cleanupStaleButtons(null);
      return;
    }

    cleanupStaleButtons(controlBar);

    let button = controlBar.querySelector(`.${BUTTON_CLASS}`);
    if (!(button instanceof HTMLElement)) {
      button = createControlButton();
    }

    const exactTarget = resolveExactMountTarget(controlBar);
    if (exactTarget) {
      const exactItem = ensureExactMountItem(exactTarget);
      if (exactItem?.button instanceof HTMLElement) {
        button = exactItem.button;
        syncButtonMetrics(button, exactTarget.referenceButton);
        button.style.marginLeft = "0px";
        button.style.marginRight = "0px";
      }
      controlBar.setAttribute(PROCESSED_ATTR, "true");
      return;
    }

    const referenceButtons = getControlButtons(controlBar);
    const referenceButton = referenceButtons[0] || null;
    if (referenceButton) {
      syncButtonMetrics(button, referenceButton);
    }
    insertButton(controlBar, button, referenceButton);
    controlBar.setAttribute(PROCESSED_ATTR, "true");
  }

  function scheduleEnsureButton() {
    if (detectTimer !== null) {
      return;
    }

    detectTimer = window.setTimeout(() => {
      detectTimer = null;
      ensureButton();
    }, DETECT_DELAY_MS);
  }

  function handleUrlChange() {
    if (window.location.href === lastUrl) {
      return;
    }

    lastUrl = window.location.href;
    cleanupStaleButtons(null);
    scheduleEnsureButton();
  }

  function init() {
    scheduleEnsureButton();

    const observer = new MutationObserver(() => {
      handleUrlChange();
      scheduleEnsureButton();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    window.setInterval(handleUrlChange, URL_CHECK_INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
