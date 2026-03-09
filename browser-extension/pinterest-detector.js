// FlowSelect Browser Extension - Pinterest Detector
// Injects download icons on animated Pinterest feed cards and pin detail pages.

(function () {
  "use strict";

  const DETAIL_BUTTON_ID = "flowselect-pinterest-download-btn";
  const DETAIL_BUTTON_CLASS = "flowselect-pinterest-action-btn";
  const DETAIL_SLOT_ATTR = "data-flowselect-pinterest-detail-slot";
  const CARD_BUTTON_CLASS = "flowselect-pinterest-card-btn";
  const CARD_HOST_ATTR = "data-flowselect-pinterest-card-host";
  const CARD_BUTTON_MODE_ATTR = "data-flowselect-card-mode";
  const HOST_PATCH_ATTR = "data-flowselect-pinterest-host-patched";
  const CARD_SHARE_CLASS_SETS = [
    ["VHreRh", "cLlqFl", "cUw_ba", "bCyBIM"],
    ["VHreRh", "cLlqFl", "cUw_ba", "bCy", "BIM"],
    ["VHreRh", "cLlqFl", "cUw_ba", "bCy"],
    ["VHreRh", "cLlqFl", "cUw_ba"],
  ];
  const PIN_PATH_RE = /\/pin\/(\d+)\/?/i;
  const DURATION_RE = /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/;
  const VIDEO_HINT_RE =
    /(?:video_list|story_pin_data|carousel_data|v\d+\.pinimg\.com\/videos|\.m3u8\b|\.mp4\b)/i;
  const PIN_VIDEO_HOST_RE = /(?:^|\/\/)(?:v\d+\.pinimg\.com|i\.pinimg\.com)\//i;
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

  function isShareLikeControl(element) {
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

    return /\b(share|send)\b/i.test(label) || /\u5206\u4eab/.test(label);
  }

  function matchesClassSet(element, classSet) {
    return classSet.every((className) => element.classList.contains(className));
  }

  function findExplicitCardShareControl(host) {
    if (!(host instanceof HTMLElement)) {
      return null;
    }

    const elements = Array.from(host.querySelectorAll("div, button, a, span")).filter(
      (element) => element instanceof HTMLElement,
    );
    for (const classSet of CARD_SHARE_CLASS_SETS) {
      const matched = elements.find(
        (element) => element instanceof HTMLElement && matchesClassSet(element, classSet),
      );
      if (matched instanceof HTMLElement) {
        return matched;
      }
    }

    return null;
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
    button.title = "Download with FlowSelect";
    button.setAttribute("aria-label", "Download with FlowSelect");
    button.removeAttribute("aria-expanded");
    button.removeAttribute("aria-haspopup");

    const iconShell = button.querySelector(".VHreRh");
    if (iconShell instanceof HTMLElement) {
      const nativeSvg = iconShell.querySelector("svg");
      const nativeSvgClassName =
        nativeSvg instanceof SVGElement ? nativeSvg.getAttribute("class") || "" : "";
      iconShell.innerHTML = CAT_ICON_SVG;
      const catSvg = iconShell.querySelector("svg");
      if (catSvg instanceof SVGElement) {
        if (nativeSvgClassName) {
          catSvg.setAttribute("class", nativeSvgClassName);
        }
        catSvg.setAttribute("width", "32");
        catSvg.setAttribute("height", "32");
        catSvg.setAttribute("role", "img");
        catSvg.setAttribute("aria-hidden", "true");
        catSvg.setAttribute("focusable", "false");
        catSvg.style.width = "32px";
        catSvg.style.height = "32px";
        catSvg.style.display = "block";
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

  function findCardControl(host, predicate, placement) {
    if (!(host instanceof HTMLElement)) {
      return null;
    }

    const hostRect = host.getBoundingClientRect();
    const controls = Array.from(
      host.querySelectorAll("button, a, div[role='button']"),
    ).filter((control) => predicate(control));

    let bestControl = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) {
        continue;
      }

      let score = Number.POSITIVE_INFINITY;
      if (placement === "top-right") {
        const topInset = Math.abs(rect.top - hostRect.top);
        const rightInset = Math.abs(hostRect.right - rect.right);
        if (topInset > Math.min(hostRect.height * 0.45, 120)) {
          continue;
        }
        score = topInset * 2 + rightInset;
      } else if (placement === "bottom-right") {
        const bottomInset = Math.abs(hostRect.bottom - rect.bottom);
        const rightInset = Math.abs(hostRect.right - rect.right);
        if (bottomInset > Math.min(hostRect.height * 0.45, 140)) {
          continue;
        }
        score = bottomInset * 2 + rightInset;
      }

      if (score < bestScore) {
        bestScore = score;
        bestControl = control;
      }
    }

    return bestControl;
  }

  function syncCardButtonPlacement(host, button) {
    if (!(host instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const shareControl =
      findExplicitCardShareControl(host) || findCardControl(host, isShareLikeControl, "bottom-right");

    if (shareControl instanceof HTMLElement) {
      const shareRect = shareControl.getBoundingClientRect();
      const shareStyle = window.getComputedStyle(shareControl);
      const rightOffset = Math.min(
        Math.max(Math.ceil(hostRect.right - shareRect.right), 12),
        Math.max(12, Math.round(hostRect.width - 40)),
      );
      const bottomOffset = Math.min(
        Math.max(Math.ceil(hostRect.bottom - shareRect.top + 8), 52),
        Math.max(52, Math.round(hostRect.height - 40)),
      );

      button.style.setProperty("--flowselect-pinterest-card-right", `${rightOffset}px`);
      button.style.setProperty("--flowselect-pinterest-card-bottom", `${bottomOffset}px`);
      button.style.setProperty("--flowselect-pinterest-card-top", "auto");
      button.style.setProperty(
        "--flowselect-pinterest-card-size",
        `${Math.round(Math.max(32, Math.min(40, Math.max(shareRect.width, shareRect.height))))}px`,
      );
      button.style.setProperty(
        "--flowselect-pinterest-card-bg",
        shareStyle.backgroundColor && shareStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
          ? shareStyle.backgroundColor
          : "rgba(0, 0, 0, 0.55)",
      );
      button.style.setProperty(
        "--flowselect-pinterest-card-shadow",
        shareStyle.boxShadow && shareStyle.boxShadow !== "none"
          ? shareStyle.boxShadow
          : "0 6px 16px rgba(0, 0, 0, 0.18)",
      );
      button.style.setProperty(
        "--flowselect-pinterest-card-border-radius",
        shareStyle.borderRadius || "999px",
      );
      return;
    }

    button.style.setProperty("--flowselect-pinterest-card-right", "12px");
    button.style.setProperty("--flowselect-pinterest-card-bottom", "56px");
    button.style.setProperty("--flowselect-pinterest-card-top", "auto");
    button.style.removeProperty("--flowselect-pinterest-card-size");
    button.style.removeProperty("--flowselect-pinterest-card-bg");
    button.style.removeProperty("--flowselect-pinterest-card-shadow");
    button.style.removeProperty("--flowselect-pinterest-card-border-radius");
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

      const existingHost = anchor.closest(`[${CARD_HOST_ATTR}]`);
      const host =
        existingHost instanceof HTMLElement && existingHost.querySelector(`.${CARD_BUTTON_CLASS}`)
          ? existingHost
          : resolveCardHost(anchor);
      if (!(host instanceof HTMLElement)) {
        continue;
      }

      activeHosts.add(host);
      host.setAttribute(CARD_HOST_ATTR, "true");
      ensurePositionedHost(host);
      let button = host.querySelector(`.${CARD_BUTTON_CLASS}`);
      if (button) {
        button.dataset.pageUrl = pageUrl;
        if (button.getAttribute(CARD_BUTTON_MODE_ATTR) !== "fallback") {
          button.setAttribute(CARD_BUTTON_MODE_ATTR, "fallback");
        }
        if (button.parentElement !== host) {
          host.appendChild(button);
        }
        syncCardButtonPlacement(host, button);
        continue;
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
      button.setAttribute(CARD_BUTTON_MODE_ATTR, "fallback");
      host.appendChild(button);
      syncCardButtonPlacement(host, button);
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
