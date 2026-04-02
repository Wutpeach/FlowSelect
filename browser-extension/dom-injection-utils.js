(function () {
  "use strict";

  function isRenderableElement(element, { minWidth = 8, minHeight = 8 } = {}) {
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

  function normalizeHttpUrl(raw, baseUrl = window.location.href) {
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const resolved = new URL(trimmed, baseUrl).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  function resolveCanonicalUrl(root = document) {
    const canonical = root.querySelector?.('link[rel="canonical"]');
    if (!(canonical instanceof HTMLLinkElement)) {
      return null;
    }

    return normalizeHttpUrl(canonical.href || canonical.getAttribute("href"));
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

  function collectScopedContentUrls(scope, collect, {
    normalizeContentUrl,
    baseScore,
    maxMatches = 8,
  }) {
    if (!(scope instanceof Element) || typeof normalizeContentUrl !== "function") {
      return;
    }

    const contentAnchors = [];
    for (const anchor of scope.querySelectorAll('a[href]')) {
      if (!(anchor instanceof HTMLAnchorElement)) {
        continue;
      }

      const normalized = normalizeContentUrl(anchor.href);
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

  function collectRankedScopedContentUrls(referenceElement, {
    normalizeContentUrl,
    isDetailPage = false,
    currentUrl = window.location.href,
    canonicalUrl = resolveCanonicalUrl(document),
    maxScopeDepth = 8,
    maxScopedContentLinks = 8,
    extraScopedSelectors = ["article", '[role="dialog"]'],
    detailCurrentScore = 1200,
    detailCanonicalScore = 1180,
    ancestorCurrentScore = 1100,
    ancestorDepthPenalty = 24,
    ancestorScopeScore = 1020,
    ancestorScopePenalty = 28,
    fallbackCanonicalScore = 60,
    fallbackCurrentScore = 40,
  } = {}) {
    if (typeof normalizeContentUrl !== "function") {
      return [];
    }

    const scoredCandidates = new Map();

    const collect = (raw, score) => {
      const normalized = normalizeContentUrl(raw);
      if (!normalized) {
        return;
      }

      const previousScore = scoredCandidates.get(normalized);
      if (typeof previousScore === "number" && previousScore >= score) {
        return;
      }

      scoredCandidates.set(normalized, score);
    };

    if (isDetailPage) {
      collect(currentUrl, detailCurrentScore);
      collect(canonicalUrl, detailCanonicalScore);
    }

    const scopedContainers = new Set();
    let current = referenceElement instanceof Element ? referenceElement : null;

    for (let depth = 0; current && depth < maxScopeDepth; depth += 1) {
      if (current instanceof HTMLAnchorElement) {
        collect(current.href, ancestorCurrentScore - depth * ancestorDepthPenalty);
      }

      if (!scopedContainers.has(current)) {
        collectScopedContentUrls(current, collect, {
          normalizeContentUrl,
          baseScore: ancestorScopeScore - depth * ancestorScopePenalty,
          maxMatches: depth < 3 ? maxScopedContentLinks : Math.max(4, Math.floor(maxScopedContentLinks / 2)),
        });
        scopedContainers.add(current);
      }

      if (depth === 0) {
        extraScopedSelectors.forEach((selector, index) => {
          const scope = current.closest(selector);
          if (!scope || scopedContainers.has(scope)) {
            return;
          }

          collectScopedContentUrls(scope, collect, {
            normalizeContentUrl,
            baseScore: 1140 - index * 60,
            maxMatches: maxScopedContentLinks,
          });
          scopedContainers.add(scope);
        });
      }

      current = current.parentElement;
    }

    if (!isDetailPage) {
      collect(canonicalUrl, fallbackCanonicalScore);
      collect(currentUrl, fallbackCurrentScore);
    }

    return Array.from(scoredCandidates.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([url]) => url);
  }

  function resolveScopedContentUrl(referenceElement, options = {}) {
    const urls = collectRankedScopedContentUrls(referenceElement, options);
    return urls[0] || null;
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

  function findButtonsByIconLabel(labelRe, {
    markerAttr = null,
    root = document,
    minWidth = 16,
    minHeight = 16,
  } = {}) {
    const buttons = [];
    const seen = new Set();

    for (const svg of root.querySelectorAll("svg")) {
      const label = getSvgLabel(svg);
      if (!label || !labelRe.test(label)) {
        continue;
      }

      const button = svg.closest('[role="button"], button');
      if (!isRenderableElement(button, { minWidth, minHeight })) {
        continue;
      }

      if (markerAttr && button.hasAttribute(markerAttr)) {
        continue;
      }
      if (seen.has(button)) {
        continue;
      }

      seen.add(button);
      buttons.push(button);
    }

    return buttons;
  }

  function resolveDirectActionButtons(container, {
    buttonSelector = '[role="button"], button',
    minWidth = 16,
    minHeight = 16,
  } = {}) {
    if (!(container instanceof HTMLElement)) {
      return [];
    }

    const buttons = [];
    const seen = new Set();

    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      const candidate = child.matches(buttonSelector)
        ? child
        : child.querySelector(buttonSelector);
      if (
        !(candidate instanceof HTMLElement) ||
        seen.has(candidate) ||
        !isRenderableElement(candidate, { minWidth, minHeight })
      ) {
        continue;
      }

      seen.add(candidate);
      buttons.push(candidate);
    }

    return buttons;
  }

  function resolveActionAxis(buttons, {
    baseTolerance = 18,
    toleranceFactor = 0.75,
  } = {}) {
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
    const horizontalTolerance = Math.max(baseTolerance, averageHeight * toleranceFactor);
    const verticalTolerance = Math.max(baseTolerance, averageWidth * toleranceFactor);

    if (topSpread <= horizontalTolerance && leftSpread > topSpread) {
      return "horizontal";
    }
    if (leftSpread <= verticalTolerance && topSpread > leftSpread) {
      return "vertical";
    }

    return null;
  }

  function resolveActionGroup(button, expectedAxis, {
    maxDepth = 5,
    buttonSelector = '[role="button"], button',
    minButtons = 3,
  } = {}) {
    if (!(button instanceof HTMLElement)) {
      return null;
    }

    let current = button.parentElement;
    for (let depth = 0; current && depth < maxDepth; depth += 1) {
      const actionButtons = resolveDirectActionButtons(current, { buttonSelector });
      if (!actionButtons.includes(button) || actionButtons.length < minButtons) {
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

  function resolveActionSlot(button, expectedAxis, options = {}) {
    const group = resolveActionGroup(button, expectedAxis, options);
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
      group,
    };
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

  function cloneNodePath(root, target, leafNode) {
    if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement) || !(leafNode instanceof Node)) {
      return null;
    }

    if (root === target) {
      return leafNode;
    }

    const path = resolveElementPath(root, target);
    if (!Array.isArray(path) || path.length === 0) {
      return null;
    }

    const clone = root.cloneNode(false);
    if (!(clone instanceof HTMLElement)) {
      return null;
    }

    let parentClone = clone;
    for (const wrapper of path.slice(0, -1)) {
      const wrapperClone = wrapper.cloneNode(false);
      if (!(wrapperClone instanceof HTMLElement)) {
        return null;
      }

      parentClone.appendChild(wrapperClone);
      parentClone = wrapperClone;
    }

    parentClone.appendChild(leafNode);
    return clone;
  }

  window.FlowSelectDomInjectionUtils = {
    isRenderableElement,
    normalizeHttpUrl,
    resolveCanonicalUrl,
    collectRankedScopedContentUrls,
    resolveScopedContentUrl,
    getSvgLabel,
    findButtonsByIconLabel,
    resolveDirectActionButtons,
    resolveActionAxis,
    resolveActionGroup,
    resolveActionSlot,
    resolveElementPath,
    cloneNodePath,
  };
})();
