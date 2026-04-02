(function () {
  "use strict";

  const BUTTON_MARKER_ATTR = "data-flowselect-instagram-button";
  const URL_CHECK_INTERVAL_MS = 700;
  const CONTENT_PATH_RE = /^\/(?:p|reel|reels)\/[^/?#]+\/?$/i;
  const SHARE_LABEL_RE =
    /^(share|send|send post|share post|分享|发送|發送|分享貼文|分享帖子)$/i;
  const LIKE_LABEL_RE =
    /^(like|赞|讚|喜欢|喜歡)$/i;
  const MAX_SCOPE_DEPTH = 8;
  const MAX_SCOPED_CONTENT_LINKS = 8;
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;

  let observer = null;
  let lastUrl = window.location.href;

  function normalizeHttpUrl(raw) {
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const resolved = new URL(trimmed, window.location.href).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  function resolveCanonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (!(canonical instanceof HTMLLinkElement)) {
      return null;
    }
    return normalizeHttpUrl(canonical.href || canonical.getAttribute("href"));
  }

  function normalizeInstagramContentUrl(raw) {
    const normalized = normalizeHttpUrl(raw);
    if (!normalized) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      if (!CONTENT_PATH_RE.test(parsed.pathname)) {
        return null;
      }

      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch (_) {
      return null;
    }
  }

  function isCurrentInstagramDetailPage() {
    try {
      return CONTENT_PATH_RE.test(new URL(window.location.href).pathname);
    } catch (_) {
      return false;
    }
  }

  function isCurrentInstagramReelPage() {
    try {
      return /^\/(?:reel|reels)\/[^/?#]+\/?$/i.test(new URL(window.location.href).pathname);
    } catch (_) {
      return false;
    }
  }

  function scoreScopeAnchor(anchor, baseScore) {
    let score = baseScore;
    if (!(anchor instanceof HTMLAnchorElement)) {
      return score;
    }

    if (anchor.querySelector("time")) {
      score += 40;
    }
    if (anchor.querySelector("img, video")) {
      score += 20;
    }
    if (anchor.textContent?.trim()) {
      score += 6;
    }

    return score;
  }

  function collectScopedContentUrls(scope, collect, baseScore, maxMatches = MAX_SCOPED_CONTENT_LINKS) {
    if (!(scope instanceof Element)) {
      return;
    }

    const contentAnchors = [];
    for (const anchor of scope.querySelectorAll('a[href]')) {
      if (!(anchor instanceof HTMLAnchorElement)) {
        continue;
      }

      const normalized = normalizeInstagramContentUrl(anchor.href);
      if (!normalized) {
        continue;
      }

      contentAnchors.push(anchor);
      if (contentAnchors.length > maxMatches) {
        return;
      }
    }

    contentAnchors.forEach((anchor, index) => {
      collect(anchor.href, scoreScopeAnchor(anchor, baseScore - index * 6));
    });
  }

  function collectContextCandidateUrls(referenceButton) {
    const scoredCandidates = new Map();

    const collect = (raw, score) => {
      const normalized = normalizeInstagramContentUrl(raw);
      if (!normalized) {
        return;
      }

      const previousScore = scoredCandidates.get(normalized);
      if (typeof previousScore === "number" && previousScore >= score) {
        return;
      }

      scoredCandidates.set(normalized, score);
    };

    if (isCurrentInstagramDetailPage()) {
      collect(window.location.href, 1200);
      collect(resolveCanonicalUrl(), 1180);
    }

    const scopedContainers = new Set();
    let current = referenceButton instanceof Element ? referenceButton : null;
    for (let depth = 0; current && depth < MAX_SCOPE_DEPTH; depth += 1) {
      if (current instanceof HTMLAnchorElement) {
        collect(current.href, 1100 - depth * 24);
      }

      if (!scopedContainers.has(current)) {
        collectScopedContentUrls(current, collect, 1020 - depth * 28, depth < 3 ? 8 : 4);
        scopedContainers.add(current);
      }

      if (depth === 0) {
        const article = current.closest("article");
        if (article && !scopedContainers.has(article)) {
          collectScopedContentUrls(article, collect, 1140, 8);
          scopedContainers.add(article);
        }

        const dialog = current.closest('[role="dialog"]');
        if (dialog && !scopedContainers.has(dialog)) {
          collectScopedContentUrls(dialog, collect, 1080, 6);
          scopedContainers.add(dialog);
        }
      }

      current = current.parentElement;
    }

    if (!isCurrentInstagramDetailPage()) {
      collect(resolveCanonicalUrl(), 60);
      collect(window.location.href, 40);
    }

    return Array.from(scoredCandidates.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([url]) => url);
  }

  function resolveSubmissionUrl(referenceButton) {
    const candidates = collectContextCandidateUrls(referenceButton);
    return candidates[0] || null;
  }

  function extractTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogTitleValue = ogTitle?.getAttribute("content")?.trim();
    if (ogTitleValue) {
      return ogTitleValue;
    }

    return (document.title || "").trim();
  }

  function alertDesktopUnavailable() {
    window.alert("FlowSelect desktop app is not connected. Please open FlowSelect and try again.");
  }

  function submitCurrentPageUrl(referenceButton) {
    const pageUrl = resolveSubmissionUrl(referenceButton);
    if (!pageUrl) {
      console.warn("[FlowSelect Instagram] Unable to resolve a valid page URL");
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "video_selection",
        url: pageUrl,
        pageUrl,
        title: extractTitle(),
      },
      (response) => {
        if (chrome.runtime?.lastError) {
          console.warn(
            "[FlowSelect Instagram] Failed to contact background:",
            chrome.runtime.lastError.message,
          );
          alertDesktopUnavailable();
          return;
        }

        if (!response?.success) {
          alertDesktopUnavailable();
        }
      },
    );
  }

  function isRenderable(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) {
      return false;
    }

    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function getSvgLabel(svg) {
    if (!(svg instanceof SVGElement)) {
      return "";
    }

    const ariaLabel = svg.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    const titleNode = svg.querySelector("title");
    const titleText = titleNode?.textContent?.trim();
    return titleText || "";
  }

  function findButtonsByIconLabel(labelRe) {
    const buttons = [];
    const seen = new Set();

    for (const svg of document.querySelectorAll("svg")) {
      const label = getSvgLabel(svg);
      if (!label || !labelRe.test(label)) {
        continue;
      }

      const button = svg.closest('[role="button"], button');
      if (!(button instanceof HTMLElement) || !isRenderable(button)) {
        continue;
      }

      if (button.hasAttribute(BUTTON_MARKER_ATTR) || seen.has(button)) {
        continue;
      }

      seen.add(button);
      buttons.push(button);
    }

    return buttons;
  }

  function resolveDirectActionButtons(container) {
    if (!(container instanceof HTMLElement)) {
      return [];
    }

    const buttons = [];
    const seen = new Set();
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      const candidate = child.matches('[role="button"], button')
        ? child
        : child.querySelector('[role="button"], button');
      if (!(candidate instanceof HTMLElement) || seen.has(candidate) || !isRenderable(candidate)) {
        continue;
      }

      seen.add(candidate);
      buttons.push(candidate);
    }

    return buttons;
  }

  function resolveActionAxis(buttons) {
    if (!Array.isArray(buttons) || buttons.length < 2) {
      return null;
    }

    const rects = buttons
      .map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.width >= 16 && rect.height >= 16);
    if (rects.length < 2) {
      return null;
    }

    const topValues = rects.map((rect) => rect.top + rect.height / 2);
    const leftValues = rects.map((rect) => rect.left + rect.width / 2);
    const topSpread = Math.max(...topValues) - Math.min(...topValues);
    const leftSpread = Math.max(...leftValues) - Math.min(...leftValues);
    const averageHeight = rects.reduce((sum, rect) => sum + rect.height, 0) / rects.length;
    const averageWidth = rects.reduce((sum, rect) => sum + rect.width, 0) / rects.length;
    const horizontalTolerance = Math.max(18, averageHeight * 0.75);
    const verticalTolerance = Math.max(18, averageWidth * 0.75);

    if (topSpread <= horizontalTolerance && leftSpread > topSpread) {
      return "horizontal";
    }
    if (leftSpread <= verticalTolerance && topSpread > leftSpread) {
      return "vertical";
    }

    return null;
  }

  function resolveActionGroup(button, expectedAxis) {
    if (!(button instanceof HTMLElement)) {
      return null;
    }

    let current = button.parentElement;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const actionButtons = resolveDirectActionButtons(current);
      if (!actionButtons.includes(button) || actionButtons.length < 3) {
        current = current.parentElement;
        continue;
      }

      const axis = resolveActionAxis(actionButtons);
      if (!expectedAxis || axis === expectedAxis) {
        return {
          container: current,
          buttons: actionButtons,
          axis,
        };
      }

      current = current.parentElement;
    }

    return null;
  }

  function looksLikePostShareButton(button) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }

    if (!(button.querySelector("svg") instanceof SVGElement)) {
      return false;
    }

    return resolveActionGroup(button, "horizontal") !== null;
  }

  function looksLikeWrappedActionButton(button) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }

    if (!(button.querySelector("span svg, div svg, svg") instanceof SVGElement)) {
      return false;
    }

    return true;
  }

  function resolveActionSlot(button, expectedAxis) {
    const group = resolveActionGroup(button, expectedAxis);
    if (!group?.container) {
      return null;
    }

    let slot = button;
    while (slot.parentElement && slot.parentElement !== group.container) {
      slot = slot.parentElement;
    }

    if (!(slot instanceof HTMLElement)) {
      return null;
    }

    return {
      anchor: slot,
      referenceButton: button,
    };
  }

  function resolveButtonShell(root) {
    if (!(root instanceof HTMLElement)) {
      return null;
    }

    if (root.matches('[role="button"], button')) {
      return root;
    }

    return root.querySelector('[role="button"], button');
  }

  function createCatIcon(templateSvg = null) {
    const template = document.createElement("template");
    template.innerHTML = CAT_ICON_SVG.trim();
    const svg = template.content.firstElementChild;
    if (!(svg instanceof SVGElement)) {
      return null;
    }

    if (!(templateSvg instanceof SVGElement)) {
      return svg;
    }

    for (const attribute of templateSvg.getAttributeNames()) {
      if (attribute === "aria-label" || attribute === "role") {
        continue;
      }
      const value = templateSvg.getAttribute(attribute);
      if (value != null) {
        svg.setAttribute(attribute, value);
      }
    }

    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    return svg;
  }

  function replaceButtonIcon(button) {
    const existingSvgs = Array.from(button.querySelectorAll("svg"));
    if (existingSvgs.length === 0) {
      return;
    }

    for (const existingSvg of existingSvgs) {
      const catSvg = createCatIcon(existingSvg);
      if (!(catSvg instanceof SVGElement)) {
        continue;
      }
      existingSvg.replaceWith(catSvg);
    }
  }

  function clearClickArtifacts(button) {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.removeAttribute("id");
    button.removeAttribute("data-pressed");
    button.removeAttribute("aria-pressed");
    button.removeAttribute("aria-describedby");
  }

  function bindButtonInteraction(button, title) {
    const handleActivate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitCurrentPageUrl(button);
    };

    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", handleActivate);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        handleActivate(event);
      }
    });
  }

  function cloneButton(referenceButton, kind) {
    const clone = referenceButton.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return null;
    }

    clearClickArtifacts(clone);
    clone.setAttribute(BUTTON_MARKER_ATTR, kind);
    replaceButtonIcon(clone);
    bindButtonInteraction(clone, "Download with FlowSelect");
    return clone;
  }

  function resolveElementPath(root, target) {
    if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return null;
    }

    const path = [];
    let current = target;

    while (current && current !== root) {
      path.unshift(current);
      current = current.parentElement;
    }

    return current === root ? path : null;
  }

  function cloneActionSlot(target, kind) {
    const anchor = target?.anchor;
    const referenceButton = target?.referenceButton;
    if (!(anchor instanceof HTMLElement)) {
      return null;
    }
    if (!(referenceButton instanceof HTMLElement)) {
      return null;
    }
    if (anchor === referenceButton) {
      return cloneButton(referenceButton, kind);
    }

    const path = resolveElementPath(anchor, referenceButton);
    if (!Array.isArray(path) || path.length === 0) {
      return null;
    }

    const clone = anchor.cloneNode(false);
    if (!(clone instanceof HTMLElement)) {
      return null;
    }

    clone.setAttribute(BUTTON_MARKER_ATTR, kind);

    let parentClone = clone;
    for (const wrapper of path.slice(0, -1)) {
      const wrapperClone = wrapper.cloneNode(false);
      if (!(wrapperClone instanceof HTMLElement)) {
        return null;
      }
      parentClone.appendChild(wrapperClone);
      parentClone = wrapperClone;
    }

    const buttonClone = cloneButton(referenceButton, kind);
    if (!(buttonClone instanceof HTMLElement)) {
      return null;
    }
    buttonClone.removeAttribute(BUTTON_MARKER_ATTR);
    parentClone.appendChild(buttonClone);
    return clone;
  }

  function createMountedNode(target, kind) {
    const anchor = target?.anchor;
    const referenceButton = target?.referenceButton;
    if (!(anchor instanceof HTMLElement) || !(referenceButton instanceof HTMLElement)) {
      return null;
    }

    return cloneActionSlot(target, kind);
  }

  function dedupeMountTargets(targets) {
    const deduped = [];
    const seenAnchors = new Set();

    for (const target of targets) {
      const anchor = target?.anchor;
      const referenceButton = target?.referenceButton;
      if (!(anchor instanceof HTMLElement) || !(referenceButton instanceof HTMLElement)) {
        continue;
      }
      if (seenAnchors.has(anchor)) {
        continue;
      }

      seenAnchors.add(anchor);
      deduped.push(target);
    }

    return deduped;
  }

  function resolvePostMountTargets() {
    return dedupeMountTargets(
      findButtonsByIconLabel(SHARE_LABEL_RE)
        .filter(looksLikePostShareButton)
        .map((button) => resolveActionSlot(button, "horizontal"))
        .filter(Boolean),
    );
  }

  function resolveReelMountTargets() {
    if (!isCurrentInstagramReelPage()) {
      return [];
    }

    return dedupeMountTargets(
      findButtonsByIconLabel(LIKE_LABEL_RE)
        .filter(looksLikeWrappedActionButton)
        .map((button) => resolveActionSlot(button, "vertical"))
        .filter(Boolean),
    );
  }

  function cleanupDetachedButtons(kind, targets, expectedSide) {
    const anchorSet = new Set(targets.map((target) => target.anchor));
    for (const button of document.querySelectorAll(`[${BUTTON_MARKER_ATTR}="${kind}"]`)) {
      if (!(button instanceof HTMLElement)) {
        continue;
      }

      const anchor = expectedSide === "after"
        ? button.previousElementSibling
        : button.nextElementSibling;
      if (!(anchor instanceof HTMLElement) || !anchorSet.has(anchor)) {
        button.remove();
      }
    }
  }

  function ensureButtonsForTargets(targets, kind, insertionSide) {
    let mounted = false;

    cleanupDetachedButtons(kind, targets, insertionSide);

    for (const target of targets) {
      const anchor = target?.anchor;
      const referenceButton = target?.referenceButton;
      if (!(anchor instanceof HTMLElement) || !(referenceButton instanceof HTMLElement)) {
        continue;
      }

      const adjacent = insertionSide === "after"
        ? anchor.nextElementSibling
        : anchor.previousElementSibling;
      if (
        adjacent instanceof HTMLElement &&
        adjacent.getAttribute(BUTTON_MARKER_ATTR) === kind
      ) {
        mounted = true;
        continue;
      }

      const button = createMountedNode(target, kind);
      if (!(button instanceof HTMLElement)) {
        continue;
      }

      if (insertionSide === "after") {
        anchor.insertAdjacentElement("afterend", button);
      } else {
        anchor.insertAdjacentElement("beforebegin", button);
      }
      mounted = true;
    }

    return mounted;
  }

  function ensureButtons() {
    const postMountTargets = resolvePostMountTargets();
    const reelMountTargets = resolveReelMountTargets();
    const mountedPostButtons = ensureButtonsForTargets(postMountTargets, "post", "after");
    const mountedReelButtons = ensureButtonsForTargets(reelMountTargets, "reel", "before");

    if (!mountedPostButtons) {
      cleanupDetachedButtons("post", [], "after");
    }
    if (!mountedReelButtons) {
      cleanupDetachedButtons("reel", [], "before");
    }

    if (isCurrentInstagramDetailPage()) {
      return;
    }
  }

  function handleUrlChange() {
    if (window.location.href === lastUrl) {
      return;
    }

    lastUrl = window.location.href;
    document.querySelectorAll(`[${BUTTON_MARKER_ATTR}]`).forEach((button) => button.remove());
    ensureButtons();
  }

  function init() {
    ensureButtons();

    observer = new MutationObserver(() => {
      handleUrlChange();
      ensureButtons();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(handleUrlChange, URL_CHECK_INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
