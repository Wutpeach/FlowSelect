import { useEffect } from "react";
import { Agentation } from "agentation";

const AGENTATION_ENDPOINT = "http://localhost:4747";

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

    window.addEventListener("keydown", handleKeyDownCapture, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true);
    };
  }, []);

  return <Agentation endpoint={AGENTATION_ENDPOINT} />;
}
