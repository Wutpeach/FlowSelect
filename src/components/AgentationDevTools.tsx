import { useEffect } from "react";
import { Agentation } from "agentation";

const AGENTATION_ENDPOINT = "http://localhost:4747";
const AGENTATION_ACTIVE_STYLE_ID = "feedback-cursor-styles";
const AGENTATION_SETTINGS_STORAGE_KEY = "feedback-toolbar-settings";
const FORWARDED_AGENTATION_CLICK_FLAG = "__flowselectAgentationForwardedClick";
const AGENTATION_UI_SELECTOR =
  "[data-feedback-toolbar], [data-annotation-popup], [data-annotation-marker], [data-agentation-root]";
const INTERACTIVE_TARGET_SELECTOR =
  "button, a, input, select, textarea, [role='button'], [onclick]";

type ForwardedAgentationClickEvent = MouseEvent & {
  [FORWARDED_AGENTATION_CLICK_FLAG]?: boolean;
};

const isAgentationInputTarget = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      "[data-feedback-toolbar] input, [data-feedback-toolbar] textarea, [data-annotation-popup] input, [data-annotation-popup] textarea",
    ),
  );
};

const isImeEnterConfirm = (event: KeyboardEvent): boolean => {
  const keyCode = event.keyCode || (event as KeyboardEvent & { which?: number }).which;
  return event.key === "Enter" && (event.isComposing || keyCode === 229);
};

const isAgentationUiTarget = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest(AGENTATION_UI_SELECTOR));
};

const isInteractiveTarget = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest(INTERACTIVE_TARGET_SELECTOR));
};

const isAgentationCaptureActive = (): boolean =>
  document.getElementById(AGENTATION_ACTIVE_STYLE_ID) !== null;

const shouldBlockUnderlyingInteractions = (): boolean => {
  try {
    const raw = window.localStorage.getItem(AGENTATION_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return true;
    }
    const parsed = JSON.parse(raw) as { blockInteractions?: unknown };
    if (typeof parsed.blockInteractions === "boolean") {
      return parsed.blockInteractions;
    }
  } catch {
    return true;
  }
  return true;
};

const forwardClickToAgentation = (event: MouseEvent) => {
  const forwardedClick = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
  }) as ForwardedAgentationClickEvent;

  Object.defineProperty(forwardedClick, FORWARDED_AGENTATION_CLICK_FLAG, {
    value: true,
  });

  document.dispatchEvent(forwardedClick);
};

export function AgentationDevTools() {
  useEffect(() => {
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (!isAgentationInputTarget(event.target)) {
        return;
      }

      if (!isImeEnterConfirm(event)) {
        return;
      }

      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleMouseDownCapture = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      if (!isAgentationCaptureActive() || !shouldBlockUnderlyingInteractions()) {
        return;
      }

      if (isAgentationUiTarget(event.target) || !isInteractiveTarget(event.target)) {
        return;
      }

      event.preventDefault();
    };

    const handleClickCapture = (event: MouseEvent) => {
      const maybeForwardedEvent = event as ForwardedAgentationClickEvent;
      if (maybeForwardedEvent[FORWARDED_AGENTATION_CLICK_FLAG]) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (!isAgentationCaptureActive() || !shouldBlockUnderlyingInteractions()) {
        return;
      }

      if (isAgentationUiTarget(event.target) || !isInteractiveTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      forwardClickToAgentation(event);
    };

    window.addEventListener("keydown", handleKeyDownCapture, true);
    window.addEventListener("mousedown", handleMouseDownCapture, true);
    window.addEventListener("click", handleClickCapture, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true);
      window.removeEventListener("mousedown", handleMouseDownCapture, true);
      window.removeEventListener("click", handleClickCapture, true);
    };
  }, []);

  return <Agentation endpoint={AGENTATION_ENDPOINT} />;
}
