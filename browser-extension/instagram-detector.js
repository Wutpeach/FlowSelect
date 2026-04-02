(function () {
  "use strict";

  const domUtils = window.FlowSelectDomInjectionUtils || null;
  const BUTTON_MARKER_ATTR = "data-flowselect-instagram-button";
  const URL_CHECK_INTERVAL_MS = 700;
  const CONTENT_PATH_RE = /^\/(?:p|reel|reels)\/[^/?#]+\/?$/i;
  const REEL_PATH_RE = /^\/(?:reel|reels)\/[^/?#]+\/?$/i;
  const SHARE_LABEL_RE =
    /^(share|send|send post|share post|分享|发送|發送|分享貼文|分享帖子)$/i;
  const LIKE_LABEL_RE =
    /^(like|赞|讚|喜欢|喜歡)$/i;
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;

  let observer = null;
  let lastUrl = window.location.href;

  function normalizeInstagramContentUrl(raw) {
    const normalized = domUtils?.normalizeHttpUrl(raw);
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
      return REEL_PATH_RE.test(new URL(window.location.href).pathname);
    } catch (_) {
      return false;
    }
  }

  function resolveSubmissionUrl(referenceButton) {
    return domUtils?.resolveScopedContentUrl(referenceButton, {
      normalizeContentUrl: normalizeInstagramContentUrl,
      isDetailPage: isCurrentInstagramDetailPage(),
      maxScopeDepth: 8,
      maxScopedContentLinks: 8,
    }) || null;
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

    existingSvgs.forEach((existingSvg) => {
      const catSvg = createCatIcon(existingSvg);
      if (catSvg instanceof SVGElement) {
        existingSvg.replaceWith(catSvg);
      }
    });
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

  function createMountedNode(target, kind) {
    const anchor = target?.anchor;
    const referenceButton = target?.referenceButton;
    if (!(anchor instanceof HTMLElement) || !(referenceButton instanceof HTMLElement)) {
      return null;
    }

    if (anchor === referenceButton) {
      return cloneButton(referenceButton, kind);
    }

    const buttonClone = cloneButton(referenceButton, kind);
    if (!(buttonClone instanceof HTMLElement)) {
      return null;
    }

    buttonClone.removeAttribute(BUTTON_MARKER_ATTR);
    const slotClone = domUtils?.cloneNodePath(anchor, referenceButton, buttonClone);
    if (!(slotClone instanceof HTMLElement)) {
      return null;
    }

    slotClone.setAttribute(BUTTON_MARKER_ATTR, kind);
    return slotClone;
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

  function looksLikePostShareButton(button) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }

    return button.querySelector("svg") instanceof SVGElement &&
      domUtils?.resolveActionGroup(button, "horizontal") !== null;
  }

  function looksLikeReelLikeButton(button) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }

    return button.querySelector("span svg, div svg, svg") instanceof SVGElement;
  }

  function resolvePostMountTargets() {
    return dedupeMountTargets(
      (domUtils?.findButtonsByIconLabel(SHARE_LABEL_RE, {
        markerAttr: BUTTON_MARKER_ATTR,
      }) || [])
        .filter(looksLikePostShareButton)
        .map((button) => domUtils?.resolveActionSlot(button, "horizontal"))
        .filter(Boolean),
    );
  }

  function resolveReelMountTargets() {
    if (!isCurrentInstagramReelPage()) {
      return [];
    }

    return dedupeMountTargets(
      (domUtils?.findButtonsByIconLabel(LIKE_LABEL_RE, {
        markerAttr: BUTTON_MARKER_ATTR,
      }) || [])
        .filter(looksLikeReelLikeButton)
        .map((button) => domUtils?.resolveActionSlot(button, "vertical"))
        .filter(Boolean),
    );
  }

  function cleanupDetachedButtons(kind, targets, expectedSide) {
    const anchorSet = new Set(targets.map((target) => target.anchor));

    document.querySelectorAll(`[${BUTTON_MARKER_ATTR}="${kind}"]`).forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }

      const anchor = expectedSide === "after"
        ? button.previousElementSibling
        : button.nextElementSibling;
      if (!(anchor instanceof HTMLElement) || !anchorSet.has(anchor)) {
        button.remove();
      }
    });
  }

  function ensureButtonsForTargets(targets, kind, insertionSide) {
    let mounted = false;

    cleanupDetachedButtons(kind, targets, insertionSide);

    for (const target of targets) {
      const anchor = target?.anchor;
      if (!(anchor instanceof HTMLElement)) {
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

      const mountedNode = createMountedNode(target, kind);
      if (!(mountedNode instanceof HTMLElement)) {
        continue;
      }

      if (insertionSide === "after") {
        anchor.insertAdjacentElement("afterend", mountedNode);
      } else {
        anchor.insertAdjacentElement("beforebegin", mountedNode);
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
    if (!domUtils) {
      console.warn("[FlowSelect Instagram] DOM injection utils are unavailable");
      return;
    }

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
