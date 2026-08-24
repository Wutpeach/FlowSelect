import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMainWindowPresentationState,
  reduceMainWindowPresentation,
  type MainWindowPresentationState,
} from "../presentation/main-window/lifecycle";
import {
  createCenterOverlayState,
  isCenterOverlayLockActive,
  reduceCenterOverlayState,
  type CenterOverlayOutcomeStatus,
  type CenterOverlayState,
} from "../utils/centerOverlayState";

const createTerminalRetentionHarness = ({ pointerInside = false } = {}) => {
  let overlay = createCenterOverlayState();
  let lifecycle = createMainWindowPresentationState({ startsCompact: false });
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const applyLifecycle = (
    event: Parameters<typeof reduceMainWindowPresentation>[1],
  ) => {
    lifecycle = reduceMainWindowPresentation(lifecycle, event).state;
  };

  const projectCenterOutcomeLock = () => {
    applyLifecycle({
      type: "setLock",
      lock: "centerOutcome",
      active: isCenterOverlayLockActive(overlay),
    });
  };

  const clearRetentionTimers = () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  };

  if (pointerInside) {
    applyLifecycle({ type: "pointerEnter" });
  }

  return {
    begin(
      status: CenterOverlayOutcomeStatus,
      durationMs: number,
      { preserveStaleTimer = false } = {},
    ) {
      if (!preserveStaleTimer) {
        clearRetentionTimers();
      }
      overlay = reduceCenterOverlayState(overlay, {
        type: "beginTaskOutcomeLoading",
        status,
        origin: "terminal",
        durationMs,
      });
      const requestId = overlay.requestId;

      // Mirrors App's existing full intent and centerOutcome projection. The
      // static risk-path gate pins this sequence to the production callback.
      applyLifecycle({ type: "requestFull", reason: "task", recipe: "instant" });
      overlay = reduceCenterOverlayState(overlay, {
        type: "showTaskOutcome",
        requestId,
      });
      projectCenterOutcomeLock();

      const timer = setTimeout(() => {
        timers.delete(timer);
        if (overlay.requestId !== requestId) {
          return;
        }
        overlay = reduceCenterOverlayState(overlay, {
          type: "finishTaskOutcome",
          requestId,
        });
        projectCenterOutcomeLock();
      }, durationMs);
      timers.add(timer);
    },
    invalidateForNewPrimary() {
      clearRetentionTimers();
      overlay = reduceCenterOverlayState(overlay, { type: "dismissTransient" });
      projectCenterOutcomeLock();
    },
    pointerLeave() {
      applyLifecycle({ type: "pointerLeave" });
    },
    get overlay(): CenterOverlayState {
      return overlay;
    },
    get lifecycle(): MainWindowPresentationState {
      return lifecycle;
    },
  };
};

describe("MR6 terminal retention without renderer-frame authority", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["success", 1500],
    ["cancelled", 1500],
    ["failure", 5000],
  ] as const)("retains %s for exactly %d ms and releases outside", (status, durationMs) => {
    const harness = createTerminalRetentionHarness();
    harness.begin(status, durationMs);

    expect(harness.overlay).toMatchObject({
      kind: "task-outcome-visible",
      status,
      durationMs,
    });
    vi.advanceTimersByTime(durationMs - 1);
    expect(isCenterOverlayLockActive(harness.overlay)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(harness.overlay.kind).toBe("idle");
    expect(harness.lifecycle.phase.kind).toBe("collapsePending");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("keeps full after timeout inside, then uses the real pointer leave", () => {
    const harness = createTerminalRetentionHarness({ pointerInside: true });
    harness.begin("success", 1500);
    vi.advanceTimersByTime(1500);

    expect(harness.lifecycle.phase.kind).toBe("full");
    harness.pointerLeave();
    expect(harness.lifecycle.phase.kind).toBe("collapsePending");
  });

  it("makes an older scheduled completion a request-id no-op", () => {
    const harness = createTerminalRetentionHarness();
    harness.begin("success", 1500);
    vi.advanceTimersByTime(500);
    harness.begin("failure", 5000, { preserveStaleTimer: true });

    vi.advanceTimersByTime(1000);
    expect(harness.overlay).toMatchObject({
      kind: "task-outcome-visible",
      status: "failure",
      durationMs: 5000,
    });
    vi.advanceTimersByTime(4000);
    expect(harness.overlay.kind).toBe("idle");
  });

  it("invalidates the old timer when a new primary arrives", () => {
    const harness = createTerminalRetentionHarness();
    harness.begin("failure", 5000);
    vi.advanceTimersByTime(500);
    harness.invalidateForNewPrimary();
    const invalidatedRequestId = harness.overlay.requestId;

    vi.advanceTimersByTime(5000);
    expect(harness.overlay).toEqual({
      kind: "idle",
      requestId: invalidatedRequestId,
    });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
