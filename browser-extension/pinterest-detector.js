// FlowSelect Browser Extension - Pinterest Video Detector
// Injects a FlowSelect button next to the native Save/Pin actions on Pinterest pin pages.

(function () {
  "use strict";

  const BUTTON_ID = "flowselect-pinterest-download-btn";
  const BUTTON_CLASS = "flowselect-pinterest-action-btn";
  const VIDEO_HINT_RE =
    /(?:video_list|story_pin_data|carousel_data|v\d+\.pinimg\.com\/videos|\.m3u8\b|\.mp4\b)/i;
  const PIN_VIDEO_HOST_RE = /(?:^|\/\/)(?:v\d+\.pinimg\.com|i\.pinimg\.com)\//i;
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;

  let lastUrl = window.location.href;
  let observer = null;

  function isPinterestPinPage() {
    return /\/pin\/\d+\/?/.test(window.location.pathname);
  }

  function getCanonicalPinUrl() {
    const pinMatch = window.location.pathname.match(/\/pin\/(\d+)\/?/);
    if (!pinMatch) {
      return window.location.href;
    }

    return `${window.location.origin}/pin/${pinMatch[1]}/`;
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

  function extractVideoCandidates() {
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

    const videoElements = document.querySelectorAll("video");
    videoElements.forEach((video) => {
      collectCandidate(video.currentSrc, "video_element");
      collectCandidate(video.src, "video_element");
      collectCandidate(video.getAttribute("src"), "video_element");
    });

    document.querySelectorAll("video source").forEach((source) => {
      collectCandidate(source.getAttribute("src"), "video_source");
      collectCandidate(source.src, "video_source");
    });

    document.querySelectorAll("script").forEach((script) => {
      const text = script.textContent || "";
      if (!VIDEO_HINT_RE.test(text)) {
        return;
      }

      const matches = text.match(/https?:\/\/[^"'\\\s<>]+/gi) || [];
      matches.forEach((match) => collectCandidate(match, "script_scan"));
    });

    const resources = performance.getEntriesByType("resource") || [];
    for (let index = resources.length - 1; index >= 0 && index > resources.length - 80; index -= 1) {
      collectCandidate(resources[index] && resources[index].name, "performance_resource");
    }

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map(({ score, ...candidate }) => candidate);
  }

  function pinPageLooksVideo() {
    if (document.querySelector("video")) {
      return true;
    }

    for (const script of document.querySelectorAll("script")) {
      if (VIDEO_HINT_RE.test(script.textContent || "")) {
        return true;
      }
    }

    return false;
  }

  function extractTitle() {
    const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
    if (metaTitle && metaTitle.trim()) {
      return metaTitle.trim();
    }

    return document.title.replace(/\s*\|\s*Pinterest\s*$/i, "").trim();
  }

  function selectPreferredVideoUrl(candidates) {
    const directCandidate = candidates.find((candidate) => candidate.type !== "manifest_m3u8");
    return directCandidate ? directCandidate.url : candidates[0]?.url || null;
  }

  function handleDownload(event) {
    event.preventDefault();
    event.stopPropagation();

    const pageUrl = getCanonicalPinUrl();
    const videoCandidates = extractVideoCandidates();
    const videoUrl = selectPreferredVideoUrl(videoCandidates);

    chrome.runtime.sendMessage({
      type: "video_selected",
      url: videoUrl || pageUrl,
      pageUrl,
      videoUrl,
      videoCandidates,
      title: extractTitle(),
    });
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

    return /\b(save|pin)\b/i.test(label);
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
        const reference = Array.from(container.querySelectorAll("button, a, div[role='button']")).find(
          isSaveLikeControl,
        );
        return { container, reference: reference || container.firstElementChild || null };
      }
    }

    const actionControls = Array.from(
      document.querySelectorAll("button, a, div[role='button']"),
    ).filter(isSaveLikeControl);

    for (const control of actionControls) {
      const container =
        control.closest('[role="group"]') ||
        control.parentElement ||
        control.closest("section") ||
        control.closest("header");
      if (container) {
        return { container, reference: control };
      }
    }

    return null;
  }

  function removeExistingButton() {
    document.getElementById(BUTTON_ID)?.remove();
  }

  function injectButton() {
    if (!isPinterestPinPage() || !pinPageLooksVideo()) {
      removeExistingButton();
      return;
    }

    const mountPoint = findActionMountPoint();
    if (!mountPoint || !mountPoint.container) {
      return;
    }

    const existing = document.getElementById(BUTTON_ID);
    if (existing && mountPoint.container.contains(existing)) {
      return;
    }

    removeExistingButton();

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.title = "Download with FlowSelect";
    button.innerHTML = `${CAT_ICON_SVG}<span>FlowSelect</span>`;
    button.addEventListener("click", handleDownload);

    if (mountPoint.reference && mountPoint.reference.parentElement === mountPoint.container) {
      mountPoint.reference.insertAdjacentElement("afterend", button);
      return;
    }

    mountPoint.container.appendChild(button);
  }

  function detectAll() {
    injectButton();
  }

  function handleUrlChange() {
    if (window.location.href === lastUrl) {
      return;
    }

    lastUrl = window.location.href;
    removeExistingButton();
    detectAll();
  }

  function init() {
    detectAll();

    observer = new MutationObserver(() => {
      handleUrlChange();
      detectAll();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(handleUrlChange, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
