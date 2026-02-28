import { useEffect } from "react";
import { Agentation } from "agentation";

const AGENTATION_ENDPOINT = "http://localhost:4747";
const AGENTATION_ACTIVE_STYLE_ID = "feedback-cursor-styles";
const AGENTATION_SETTINGS_STORAGE_KEY = "feedback-toolbar-settings";
const AGENTATION_UI_SELECTOR =
  "[data-feedback-toolbar], [data-annotation-popup], [data-annotation-marker], [data-agentation-root]";
const EARLY_INTERACTIVE_TARGET_SELECTOR = "select";

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

const isEarlyInteractiveTarget = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest(EARLY_INTERACTIVE_TARGET_SELECTOR));
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

      if (isAgentationUiTarget(event.target) || !isEarlyInteractiveTarget(event.target)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDownCapture, true);
    window.addEventListener("mousedown", handleMouseDownCapture, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true);
      window.removeEventListener("mousedown", handleMouseDownCapture, true);
    };
  }, []);

  return <Agentation endpoint={AGENTATION_ENDPOINT} />;
}
