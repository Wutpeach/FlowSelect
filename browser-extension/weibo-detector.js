(function () {
  "use strict";

  const CONTROL_BUTTON_CLASS = "flowselect-weibo-control-btn";
  const FLOATING_BUTTON_CLASS = "flowselect-weibo-floating-btn";
  const CONTROL_BUTTON_ATTR = "data-flowselect-weibo-button";
  const CONTROL_BUTTON_VALUE = "control";
  const FLOATING_BUTTON_VALUE = "floating";
  const POSITION_PATCH_ATTR = "data-flowselect-weibo-position-patched";
  const DETECT_DELAY_MS = 160;
  const VJS_BASE_HEIGHT_PX = 14;
  const VJS_BASE_BUTTON_WIDTH_PX = 18;
  const VJS_BASE_GAP_PX = 5;
  const VJS_LARGE_BUTTON_ICON_OFFSET_Y_PX = -1;
  const controlStyleUtils = window.FlowSelectControlStyleUtils || null;
  const injectionDebugConfig = window.FlowSelectInjectionDebugConfig || null;
  const injectionDebugPanel = window.FlowSelectInjectionDebugPanel || null;
  const DEBUG_MARK_ATTR = "data-flowselect-weibo-debug-mark";
  const DEBUG_OVERRIDE_DEFAULTS = Object.freeze({
    buttonWidthOffset: 0,
    buttonHeightOffset: 0,
    gapOffset: 0,
    topOffset: 0,
    iconSizeOffset: 0,
    previewIconOffsetY: 0,
    detailIconOffsetY: -5,
  });
  const CONTROL_SELECTORS = [
    '.vjs-control-bar',
    '[class*="control"][class*="bar"]',
    '[class*="Control"][class*="Bar"]',
    '[class*="toolbar"]',
    '[class*="ToolBar"]',
    '[class*="controls"]',
    '[class*="Controls"]',
    '[class*="video-control"]',
    '[class*="videoControl"]',
    '[class*="player-control"]',
    '[class*="playerControl"]',
    '.xgplayer-controls',
    '.art-controls',
  ];
  const ANCHOR_SELECTORS = [
    '.vjs-playback-rate',
    '.vjs-quality',
    '.vjs-miniplayer-button',
    '.vjs-fullscreen-control',
    '[class*="fullscreen"]',
    '[class*="fullScreen"]',
    '[class*="pip"]',
    '[class*="setting"]',
    '[class*="rate"]',
  ];
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;
  let detectTimer = null;
  let lastUrl = window.location.href;
  let injectionDebugEnabled = false;
  let debugOverrides = { ...DEBUG_OVERRIDE_DEFAULTS };
  let debugSnapshot = null;

  function normalizeUrl(raw) {
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return new URL(trimmed, window.location.href).toString();
    } catch (_) {
      return null;
    }
  }

  function isRenderable(element, { minWidth = 16, minHeight = 16 } = {}) {
    if (!(element instanceof HTMLElement) || !element.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < minWidth || rect.height < minHeight) {
      return false;
    }

    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function isWeiboHost() {
    return /(?:^|\.)weibo\.(?:com|cn)$/i.test(window.location.hostname);
  }

  function extractTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
    if (ogTitle) {
      return ogTitle;
    }

    return (document.title || "").replace(/\s*-\s*微博.*$/u, "").trim();
  }

  function normalizePageUrl() {
    return normalizeUrl(window.location.href) || window.location.href;
  }

  function normalizeDebugOverrides(value) {
    const next = { ...DEBUG_OVERRIDE_DEFAULTS };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return next;
    }

    const hasPreviewIconOffsetY = Object.prototype.hasOwnProperty.call(value, "previewIconOffsetY");
    const hasDetailIconOffsetY = Object.prototype.hasOwnProperty.call(value, "detailIconOffsetY");
    const legacyIconOffsetY = typeof value.iconOffsetY === "number" ? value.iconOffsetY : Number(value.iconOffsetY);
    if (!hasPreviewIconOffsetY && !hasDetailIconOffsetY && Number.isFinite(legacyIconOffsetY)) {
      next.detailIconOffsetY = legacyIconOffsetY;
    }

    for (const key of Object.keys(next)) {
      const raw = value[key];
      const num = typeof raw === "number" ? raw : Number(raw);
      next[key] = Number.isFinite(num) ? num : next[key];
    }

    return next;
  }

  function getDebugOverrides() {
    return { ...debugOverrides };
  }

  function setDebugOverrides(nextOverrides) {
    debugOverrides = normalizeDebugOverrides({
      ...debugOverrides,
      ...nextOverrides,
    });
    scheduleEnsureButton();
    injectionDebugPanel?.refresh?.();
  }

  function resetDebugOverrides() {
    debugOverrides = { ...DEBUG_OVERRIDE_DEFAULTS };
    scheduleEnsureButton();
    injectionDebugPanel?.refresh?.();
  }

  function buildDebugText(snapshot) {
    const payload = {
      site: "weibo",
      pageUrl: normalizePageUrl(),
      pageMode: snapshot?.pageMode ?? "unknown",
      mountStrategy: snapshot?.mountStrategy ?? "unknown",
      anchorSelector: snapshot?.anchorSelector ?? null,
      overrides: getDebugOverrides(),
      metrics: snapshot?.metrics ?? null,
      anchorRect: snapshot?.anchorRect ?? null,
      buttonRect: snapshot?.buttonRect ?? null,
      controlBarRect: snapshot?.controlBarRect ?? null,
    };
    return JSON.stringify(payload, null, 2);
  }

  const debugAdapter = {
    id: "weibo",
    title: "Weibo Injection Debug",
    getControls() {
      return [
        { key: "buttonWidthOffset", label: "Width Offset", step: 1, min: -24, max: 24, defaultValue: 0 },
        { key: "buttonHeightOffset", label: "Height Offset", step: 1, min: -24, max: 24, defaultValue: 0 },
        { key: "gapOffset", label: "Gap Offset", step: 1, min: -24, max: 24, defaultValue: 0 },
        { key: "topOffset", label: "Top Offset", step: 1, min: -24, max: 24, defaultValue: 0 },
        { key: "iconSizeOffset", label: "Icon Size Offset", step: 1, min: -24, max: 24, defaultValue: 0 },
        { key: "previewIconOffsetY", label: "Preview Icon Y", step: 1, min: -24, max: 24, defaultValue: 0 },
        { key: "detailIconOffsetY", label: "Detail Icon Y", step: 1, min: -24, max: 24, defaultValue: 0 },
      ];
    },
    getOverrides: getDebugOverrides,
    setOverrides: setDebugOverrides,
    resetOverrides: resetDebugOverrides,
    getSnapshot() {
      return debugSnapshot ?? {
        site: "weibo",
        pageUrl: normalizePageUrl(),
        pageMode: "unresolved",
        mountStrategy: "waiting",
        overrides: getDebugOverrides(),
      };
    },
    formatDebugText: buildDebugText,
  };

  function clearDebugDecorations() {
    document.querySelectorAll(`[${DEBUG_MARK_ATTR}]`).forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      element.style.removeProperty("outline");
      element.style.removeProperty("outline-offset");
      element.style.removeProperty("box-shadow");
      element.removeAttribute(DEBUG_MARK_ATTR);
    });
  }

  function markDebugElement(element, styles) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.setAttribute(DEBUG_MARK_ATTR, "true");
    if (typeof styles.outline === "string") {
      element.style.outline = styles.outline;
    }
    if (typeof styles.outlineOffset === "string") {
      element.style.outlineOffset = styles.outlineOffset;
    }
    if (typeof styles.boxShadow === "string") {
      element.style.boxShadow = styles.boxShadow;
    }
  }

  function applyDebugDecorations(button, anchor, controlBar) {
    clearDebugDecorations();
    if (!injectionDebugEnabled) {
      return;
    }

    markDebugElement(button, {
      outline: "1px solid rgb(255 138 0 / 95%)",
      outlineOffset: "0px",
      boxShadow: "0 0 0 1px rgb(255 138 0 / 28%) inset",
    });
    markDebugElement(anchor, {
      outline: "1px solid rgb(0 196 140 / 90%)",
      outlineOffset: "0px",
    });
    markDebugElement(controlBar, {
      outline: "1px dashed rgb(91 165 255 / 70%)",
      outlineOffset: "0px",
    });
  }

  function syncInjectionDebugState(enabled) {
    injectionDebugEnabled = enabled === true;
    if (!injectionDebugEnabled) {
      clearDebugDecorations();
      injectionDebugPanel?.unmountAdapter?.(debugAdapter.id);
      return;
    }

    void injectionDebugPanel?.mountAdapter?.(debugAdapter);
    scheduleEnsureButton();
  }

  function sendDownloadMessage() {
    const pageUrl = normalizePageUrl();
    chrome.runtime.sendMessage(
      {
        type: "video_selection",
        url: pageUrl,
        pageUrl,
        title: extractTitle(),
        siteHint: "weibo",
      },
      (response) => {
        if (chrome.runtime?.lastError) {
          window.alert("FlowSelect extension background is unavailable. Please reload the extension.");
          return;
        }

        if (!response?.success) {
          window.alert("FlowSelect desktop app is not connected. Please open FlowSelect and try again.");
        }
      },
    );
  }

  function getActiveVideoElement() {
    const videos = Array.from(document.querySelectorAll("video"));
    return videos.find((video) => {
      if (!(video instanceof HTMLVideoElement)) {
        return false;
      }

      return (
        video.readyState >= 0 &&
        (video.videoWidth > 0 || Boolean(video.currentSrc || video.src)) &&
        isRenderable(video, { minWidth: 120, minHeight: 68 })
      );
    }) || null;
  }

  function resolvePlayerRoot(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return null;
    }

    return video.closest(
      '[class*="player"], [class*="Player"], [class*="video_box"], [class*="videoBox"], [data-testid*="video"]',
    ) || video.parentElement;
  }

  function getNativeControlButtons(container) {
    if (controlStyleUtils?.findNativeControlButtons) {
      return controlStyleUtils.findNativeControlButtons(container, {
        excludeClasses: [CONTROL_BUTTON_CLASS],
        minWidth: 12,
        minHeight: 12,
      });
    }

    return Array.from(container.children).filter((child) => (
      child instanceof HTMLElement &&
      !child.classList.contains(CONTROL_BUTTON_CLASS) &&
      isRenderable(child, { minWidth: 12, minHeight: 12 })
    ));
  }

  function getInjectedButtonSelector(type) {
    return `[${CONTROL_BUTTON_ATTR}="${type}"]`;
  }

  function getDirectChildBySelectors(container, selectors) {
    if (!(container instanceof HTMLElement) || !Array.isArray(selectors)) {
      return null;
    }

    return Array.from(container.children).find((child) => (
      child instanceof HTMLElement &&
      selectors.some((selector) => child.matches(selector)) &&
      isRenderable(child, { minWidth: 12, minHeight: 12 })
    )) || null;
  }

  function getVisibleVideoJsControlBars() {
    return Array.from(document.querySelectorAll(".vjs-control-bar")).filter((controlBar) => {
      if (!(controlBar instanceof HTMLElement)) {
        return false;
      }

      if (!isRenderable(controlBar, { minWidth: 180, minHeight: 24 })) {
        return false;
      }

      const directAnchor = getDirectChildBySelectors(controlBar, [
        ".vjs-playback-rate",
        ".vjs-quality",
        ".vjs-miniplayer-button",
        ".vjs-fullscreen-control",
      ]);

      if (!(directAnchor instanceof HTMLElement)) {
        return false;
      }

      const playerRoot = controlBar.closest(".video-js, [class*='player'], [class*='Player']");
      if (!(playerRoot instanceof HTMLElement)) {
        return true;
      }

      return isRenderable(playerRoot, { minWidth: 180, minHeight: 90 });
    });
  }

  function hasVideoJsContext() {
    return Array.from(
      document.querySelectorAll(".vjs-control-bar, .video-js, .vjs-tech, .vjs-playback-rate"),
    ).some((element) => (
      element instanceof HTMLElement &&
      isRenderable(element, { minWidth: 24, minHeight: 12 })
    ));
  }

  function resolveControlBar(video) {
    const playerRoot = resolvePlayerRoot(video);
    if (!(playerRoot instanceof HTMLElement)) {
      return null;
    }

    const playerRect = playerRoot.getBoundingClientRect();
    const candidates = [];
    const seen = new Set();

    for (const selector of CONTROL_SELECTORS) {
      for (const candidate of playerRoot.querySelectorAll(selector)) {
        if (!(candidate instanceof HTMLElement) || seen.has(candidate)) {
          continue;
        }
        if (!isRenderable(candidate, { minWidth: 120, minHeight: 24 })) {
          continue;
        }

        const rect = candidate.getBoundingClientRect();
        const withinWidth = rect.width <= playerRect.width + 24;
        const nearBottom = rect.bottom >= playerRect.bottom - playerRect.height * 0.45;
        if (!withinWidth || !nearBottom) {
          continue;
        }

        seen.add(candidate);
        const nativeButtons = getNativeControlButtons(candidate);
        if (nativeButtons.length < 3) {
          continue;
        }
        const score = rect.width + nativeButtons.length * 120 - Math.abs(playerRect.bottom - rect.bottom);
        candidates.push({ candidate, nativeButtons, score });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0] || null;
  }

  function bindButton(button) {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.title = "Download with FlowSelect";
    button.setAttribute("aria-label", "Download with FlowSelect");

    const handleActivate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendDownloadMessage();
    };

    button.addEventListener("click", handleActivate);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        handleActivate(event);
      }
    });
  }

  function buildControlBarButton() {
    const useVideoJsStyle = document.querySelector(".vjs-control-bar") instanceof HTMLElement;
    if (useVideoJsStyle) {
      const wrapper = document.createElement("div");
      wrapper.className = `${CONTROL_BUTTON_CLASS} vjs-flowselect-download vjs-menu-button vjs-menu-button-popup vjs-control vjs-button`;
      wrapper.setAttribute(CONTROL_BUTTON_ATTR, CONTROL_BUTTON_VALUE);
      wrapper.innerHTML = `
        <button
          class="vjs-flowselect-download-button vjs-button"
          type="button"
          title="Download with FlowSelect"
          aria-disabled="false"
          aria-label="Download with FlowSelect"
        >
          <span class="vjs-icon-placeholder" aria-hidden="true">${CAT_ICON_SVG}</span>
          <span class="vjs-control-text" aria-live="polite">Download with FlowSelect</span>
        </button>
      `;
      const button = wrapper.querySelector(".vjs-flowselect-download-button");
      bindButton(button instanceof HTMLElement ? button : wrapper);
      return wrapper;
    }

    const button = document.createElement("div");
    button.className = CONTROL_BUTTON_CLASS;
    button.setAttribute(CONTROL_BUTTON_ATTR, CONTROL_BUTTON_VALUE);
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.innerHTML = CAT_ICON_SVG;
    bindButton(button);
    return button;
  }

  function buildFallbackButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = FLOATING_BUTTON_CLASS;
    button.setAttribute(CONTROL_BUTTON_ATTR, FLOATING_BUTTON_VALUE);
    button.title = "Download with FlowSelect";
    button.setAttribute("aria-label", "Download with FlowSelect");
    button.innerHTML = CAT_ICON_SVG;
    bindButton(button);
    return button;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function rectToDebugData(rect) {
    if (!rect) {
      return null;
    }

    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function elementToDebugRect(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    return rectToDebugData(element.getBoundingClientRect());
  }

  function syncVideoJsButtonMetrics(button, anchor) {
    if (!(button instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.height < 8) {
      return;
    }

    const baseButtonHeight = Math.round(anchorRect.height);
    const scale = clamp(anchorRect.height / VJS_BASE_HEIGHT_PX, 0.85, 2.4);
    const baseButtonWidth = Math.round(baseButtonHeight + (VJS_BASE_BUTTON_WIDTH_PX - VJS_BASE_HEIGHT_PX));
    const baseGap = Math.round(VJS_BASE_GAP_PX * scale);
    const baseIconSize = Math.round((baseButtonHeight * 0.5) + 10);
    const baseIconOffsetY = baseButtonHeight >= 30 ? VJS_LARGE_BUTTON_ICON_OFFSET_Y_PX : 0;

    const buttonWidth = Math.max(12, Math.round(baseButtonWidth + debugOverrides.buttonWidthOffset));
    const buttonHeight = Math.max(12, Math.round(baseButtonHeight + debugOverrides.buttonHeightOffset));
    const gap = Math.max(-24, Math.round(baseGap + debugOverrides.gapOffset));
    const iconSize = Math.max(12, Math.round(baseIconSize + debugOverrides.iconSizeOffset));
    const pageMode = buttonHeight >= 30 ? "detail-player" : "home-preview";
    const modeIconOffsetY = pageMode === "detail-player"
      ? debugOverrides.detailIconOffsetY
      : debugOverrides.previewIconOffsetY;
    const iconOffsetY = Math.round(baseIconOffsetY + modeIconOffsetY);

    button.style.setProperty("--flowselect-weibo-vjs-button-width", `${buttonWidth}px`);
    button.style.setProperty("--flowselect-weibo-vjs-button-height", `${buttonHeight}px`);
    button.style.setProperty("--flowselect-weibo-vjs-button-gap", `${gap}px`);
    button.style.setProperty("--flowselect-weibo-vjs-button-top", "0px");
    button.style.setProperty("--flowselect-weibo-vjs-button-line-height", `${buttonHeight}px`);
    button.style.setProperty("--flowselect-weibo-vjs-icon-size", `${iconSize}px`);

    const buttonRect = button.getBoundingClientRect();
    const baseTopOffset = Math.round(
      (anchorRect.top + anchorRect.height / 2) - (buttonRect.top + buttonRect.height / 2),
    );
    const centerDelta = Math.round(baseTopOffset + debugOverrides.topOffset);
    button.style.setProperty("--flowselect-weibo-vjs-button-top", `${centerDelta}px`);
    button.style.setProperty("--flowselect-weibo-vjs-icon-offset-y", `${iconOffsetY}px`);

    const finalButtonRect = button.getBoundingClientRect();
    const controlBar = button.parentElement;
    const controlBarRect = controlBar instanceof HTMLElement ? controlBar.getBoundingClientRect() : null;
    debugSnapshot = {
      site: "weibo",
      pageUrl: normalizePageUrl(),
      pageMode,
      mountStrategy: "insert before .vjs-playback-rate",
      anchorSelector: ".vjs-playback-rate",
      overrides: getDebugOverrides(),
      metrics: {
        baseButtonWidth,
        baseButtonHeight,
        baseGap,
        baseIconSize,
        baseIconOffsetY,
        buttonWidth,
        buttonHeight,
        gap,
        topOffset: centerDelta,
        iconSize,
        iconOffsetY,
        modeIconOffsetY,
        },
      anchorRect: rectToDebugData(anchorRect),
      buttonRect: rectToDebugData(finalButtonRect),
      controlBarRect: rectToDebugData(controlBarRect),
    };
  }

  function resolveControlAnchor(controlBar, nativeButtons) {
    if (controlBar.matches(".vjs-control-bar")) {
      const preferred = getDirectChildBySelectors(controlBar, [
        ".vjs-playback-rate",
        ".vjs-quality",
        ".vjs-miniplayer-button",
        ".vjs-fullscreen-control",
      ]);
      if (preferred instanceof HTMLElement && preferred.parentElement === controlBar) {
        return preferred;
      }
    }

    for (const selector of ANCHOR_SELECTORS) {
      const anchor = Array.from(controlBar.querySelectorAll(selector)).find((element) => (
        element instanceof HTMLElement &&
        element.parentElement === controlBar &&
        isRenderable(element, { minWidth: 12, minHeight: 12 })
      ));
      if (anchor instanceof HTMLElement) {
        return anchor;
      }
    }

    return nativeButtons[nativeButtons.length - 1] || null;
  }

  function ensureControlBarButton(controlBar, nativeButtons) {
    let button = controlBar.querySelector(getInjectedButtonSelector(CONTROL_BUTTON_VALUE));
    if (!(button instanceof HTMLElement)) {
      button = buildControlBarButton();
      if (!(button instanceof HTMLElement)) {
        return false;
      }
    }

    const anchor = resolveControlAnchor(controlBar, nativeButtons);
    if (anchor && anchor.parentElement === controlBar) {
      if (button.parentElement !== controlBar || button.nextElementSibling !== anchor) {
        controlBar.insertBefore(button, anchor);
      }
      if (controlBar.matches(".vjs-control-bar")) {
        syncVideoJsButtonMetrics(button, anchor);
      }
      applyDebugDecorations(button, anchor, controlBar);
    } else if (button.parentElement !== controlBar) {
      controlBar.appendChild(button);
    }

    if (!controlBar.matches(".vjs-control-bar") && controlStyleUtils?.syncHorizontalMarginsFromNative) {
      controlStyleUtils.syncHorizontalMarginsFromNative(controlBar, [button], {
        excludeClasses: [CONTROL_BUTTON_CLASS],
        minWidth: 12,
        minHeight: 12,
      });
    }

    if (!controlBar.matches(".vjs-control-bar")) {
      debugSnapshot = {
        site: "weibo",
        pageUrl: normalizePageUrl(),
        pageMode: "generic-control-bar",
        mountStrategy: "generic control bar insertion",
        anchorSelector: anchor ? "resolved from native control list" : null,
        overrides: getDebugOverrides(),
        metrics: null,
        anchorRect: elementToDebugRect(anchor),
        buttonRect: elementToDebugRect(button),
        controlBarRect: elementToDebugRect(controlBar),
      };
    }

    return true;
  }

  function ensureFloatingButton(playerRoot) {
    if (!(playerRoot instanceof HTMLElement)) {
      return false;
    }

    let button = playerRoot.querySelector(getInjectedButtonSelector(FLOATING_BUTTON_VALUE));
    if (!(button instanceof HTMLElement)) {
      button = buildFallbackButton();
    }

    if (window.getComputedStyle(playerRoot).position === "static") {
      playerRoot.style.position = "relative";
      playerRoot.setAttribute(POSITION_PATCH_ATTR, "true");
    }

    if (button.parentElement !== playerRoot) {
      playerRoot.appendChild(button);
    }

    debugSnapshot = {
      site: "weibo",
      pageUrl: normalizePageUrl(),
      pageMode: "floating-fallback",
      mountStrategy: "append to player root",
      anchorSelector: null,
      overrides: getDebugOverrides(),
      metrics: null,
      anchorRect: null,
      buttonRect: elementToDebugRect(button),
      controlBarRect: elementToDebugRect(playerRoot),
    };

    return true;
  }

  function cleanupPositionPatch(root) {
    if (!(root instanceof HTMLElement)) {
      return;
    }

    if (root.getAttribute(POSITION_PATCH_ATTR) === "true") {
      root.style.removeProperty("position");
      root.removeAttribute(POSITION_PATCH_ATTR);
    }
  }

  function cleanupStaleButtons(activeHost = null) {
    document.querySelectorAll(`[${CONTROL_BUTTON_ATTR}]`).forEach((button) => {
      const host = button.parentElement;
      if (activeHost && host === activeHost) {
        return;
      }

      button.remove();
      cleanupPositionPatch(host);
    });
  }

  function cleanupStaleButtonsByHosts(activeHosts) {
    const hosts = activeHosts instanceof Set ? activeHosts : new Set();

    document.querySelectorAll(`[${CONTROL_BUTTON_ATTR}]`).forEach((button) => {
      const host = button.parentElement;
      if (host instanceof HTMLElement && hosts.has(host)) {
        return;
      }

      button.remove();
      cleanupPositionPatch(host);
    });
  }

  function ensureButton() {
    if (!isWeiboHost()) {
      debugSnapshot = null;
      cleanupStaleButtons(null);
      return;
    }

    const videoJsControlBars = getVisibleVideoJsControlBars();
    if (videoJsControlBars.length > 0) {
      const activeHosts = new Set();
      for (const controlBar of videoJsControlBars) {
        const nativeButtons = getNativeControlButtons(controlBar);
        if (nativeButtons.length === 0) {
          continue;
        }
        ensureControlBarButton(controlBar, nativeButtons);
        activeHosts.add(controlBar);
      }

      cleanupStaleButtonsByHosts(activeHosts);
      if (activeHosts.size > 0) {
        return;
      }
    }

    if (hasVideoJsContext()) {
      debugSnapshot = {
        site: "weibo",
        pageUrl: normalizePageUrl(),
        pageMode: "video-js-pending",
        mountStrategy: "waiting for visible control bar",
        overrides: getDebugOverrides(),
      };
      cleanupStaleButtons(null);
      return;
    }

    const activeVideo = getActiveVideoElement();
    if (!(activeVideo instanceof HTMLVideoElement)) {
      debugSnapshot = {
        site: "weibo",
        pageUrl: normalizePageUrl(),
        pageMode: "no-active-video",
        mountStrategy: "waiting for active video",
        overrides: getDebugOverrides(),
      };
      cleanupStaleButtons(null);
      return;
    }

    const controlBarResult = resolveControlBar(activeVideo);
    if (controlBarResult?.candidate instanceof HTMLElement && controlBarResult.nativeButtons.length > 0) {
      cleanupStaleButtons(controlBarResult.candidate);
      ensureControlBarButton(controlBarResult.candidate, controlBarResult.nativeButtons);
      return;
    }

    const playerRoot = resolvePlayerRoot(activeVideo);
    if (ensureFloatingButton(playerRoot)) {
      cleanupStaleButtons(playerRoot);
      return;
    }

    cleanupStaleButtons(null);
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

  function init() {
    if (injectionDebugConfig?.getEnabled) {
      void injectionDebugConfig.getEnabled().then((enabled) => {
        syncInjectionDebugState(enabled);
      });
    }
    if (injectionDebugConfig?.observe) {
      injectionDebugConfig.observe((enabled) => {
        syncInjectionDebugState(enabled);
      });
    }

    scheduleEnsureButton();

    const observer = new MutationObserver(() => scheduleEnsureButton());
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        scheduleEnsureButton();
      }
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
