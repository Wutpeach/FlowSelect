// FlowSelect Browser Extension - Control Style Utils
// Reusable helpers to keep injected control buttons visually aligned with native controls.

(function() {
  'use strict';

  function isRenderableElement(element, { minWidth = 8, minHeight = 8 } = {}) {
    if (!(element instanceof HTMLElement) || !element.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < minWidth || rect.height < minHeight) {
      return false;
    }

    return rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
  }

  function findNativeControlButtons(container, {
    excludeClasses = [],
    requiredClass = null,
    minWidth = 8,
    minHeight = 8,
  } = {}) {
    if (!(container instanceof HTMLElement)) {
      return [];
    }

    return Array.from(container.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false;

      const isInjected = excludeClasses.some((className) => child.classList.contains(className));
      if (isInjected) return false;

      if (requiredClass && !child.classList.contains(requiredClass)) {
        return false;
      }

      return isRenderableElement(child, { minWidth, minHeight });
    });
  }

  function isControlBarReady(container, {
    excludeClasses = [],
    requiredClass = null,
    minControlWidth = 16,
    minControlHeight = 16,
    minButtonWidth = 8,
    minButtonHeight = 8,
  } = {}) {
    if (!isRenderableElement(container, { minWidth: minControlWidth, minHeight: minControlHeight })) {
      return false;
    }

    const nativeButtons = findNativeControlButtons(container, {
      excludeClasses,
      requiredClass,
      minWidth: minButtonWidth,
      minHeight: minButtonHeight,
    });

    return nativeButtons.length > 0;
  }

  function syncHorizontalMarginsFromNative(container, customButtons, {
    excludeClasses = [],
    requiredClass = null,
    minWidth = 8,
    minHeight = 8,
  } = {}) {
    const nativeButtons = findNativeControlButtons(container, {
      excludeClasses,
      requiredClass,
      minWidth,
      minHeight,
    });

    if (nativeButtons.length === 0 || !Array.isArray(customButtons) || customButtons.length === 0) {
      return;
    }

    const withSpacing = nativeButtons.find((button) => {
      const style = window.getComputedStyle(button);
      return Number.parseFloat(style.marginLeft) > 0 || Number.parseFloat(style.marginRight) > 0;
    });
    const reference = withSpacing || nativeButtons[0];
    const referenceStyle = window.getComputedStyle(reference);

    for (const button of customButtons) {
      if (!(button instanceof HTMLElement)) continue;
      button.style.marginLeft = referenceStyle.marginLeft;
      button.style.marginRight = referenceStyle.marginRight;
    }
  }

  window.FlowSelectControlStyleUtils = {
    isRenderableElement,
    findNativeControlButtons,
    isControlBarReady,
    syncHorizontalMarginsFromNative,
  };
})();
