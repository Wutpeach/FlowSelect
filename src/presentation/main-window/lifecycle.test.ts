import { describe, expect, it } from "vitest";

import {
  createCenterOverlayState,
  isCenterOverlayLockActive,
  reduceCenterOverlayState,
} from "../../utils/centerOverlayState";

import {
  createMainWindowPresentationState,
  reduceMainWindowPresentation,
  type MainWindowPresentationEvent,
  type MainWindowPresentationState,
} from "./lifecycle";

const apply = (
  state: MainWindowPresentationState,
  ...events: MainWindowPresentationEvent[]
) => {
  let current = state;
  const effects = [];
  for (const event of events) {
    const result = reduceMainWindowPresentation(current, event);
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
};

describe("mainWindowPresentation lifecycle", () => {
  it("expands immediately from compact on pointer enter with animated recipe", () => {
    const result = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "pointerEnter" },
    );

    expect(result.state.phase).toMatchObject({ kind: "expanding", recipe: "animated" });
    expect(result.state.pointerInside).toBe(true);
    expect(result.effects).toEqual([
      { type: "collapseTimer.cancel" },
      { type: "native.setInteraction", mode: "interactive", epoch: 0 },
      { type: "native.cancelCompactReachability", epoch: 0 },
    ]);
  });

  it("collapses full mode after one 80 ms leave timer fires", () => {
    const left = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
    );
    const timerEpoch = (left.state.phase as { timerEpoch: number }).timerEpoch;

    expect(left.state.phase).toMatchObject({ kind: "collapsePending", timerEpoch });
    expect(left.effects).toEqual([
      { type: "collapseTimer.start", timerEpoch, delayMs: 80 },
    ]);

    const collapsed = apply(left.state, { type: "collapseTimerFired", timerEpoch });
    expect(collapsed.state.phase).toMatchObject({ kind: "collapsing" });
    expect(collapsed.effects).toEqual([
      { type: "collapseTimer.cancel" },
      { type: "native.prepareCompactReachability", epoch: 1 },
    ]);
  });

  it("rejects stale collapse timers", () => {
    const left = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
    );
    const timerEpoch = (left.state.phase as { timerEpoch: number }).timerEpoch;

    const fired = apply(left.state, { type: "collapseTimerFired", timerEpoch: timerEpoch + 1 });
    expect(fired.state.phase.kind).toBe("collapsePending");
    expect(fired.effects).toEqual([]);
  });

  it("cancels pending collapse when pointer re-enters and rejects the stale timer", () => {
    const pending = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
    ).state;
    const timerEpoch = (pending.phase as { timerEpoch: number }).timerEpoch;
    const reentered = apply(pending, { type: "pointerEnter" });

    expect(reentered.state.phase.kind).toBe("full");
    expect(reentered.state.pointerInside).toBe(true);
    expect(reentered.effects).toEqual([{ type: "collapseTimer.cancel" }]);
    expect(apply(reentered.state, { type: "collapseTimerFired", timerEpoch }).state.phase.kind)
      .toBe("full");
  });

  it("records pointer-outside during expand and hands into collapse pending on completion", () => {
    const expanding = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;
    const leftDuringExpand = apply(expanding, { type: "pointerLeave" });

    expect(leftDuringExpand.state.phase.kind).toBe("expanding");
    expect(leftDuringExpand.state.pointerInside).toBe(false);
    expect(leftDuringExpand.effects).toEqual([]);

    const epoch = (leftDuringExpand.state.phase as { epoch: number }).epoch;
    const pending = apply(leftDuringExpand.state, {
      type: "visualTransitionCompleted",
      target: "full",
      epoch,
    });
    expect(pending.state.phase.kind).toBe("collapsePending");
    expect(pending.effects).toEqual([
      expect.objectContaining({ type: "collapseTimer.start", delayMs: 80 }),
    ]);
  });

  it("reverses enter during collapse to a new expanding epoch and ignores the stale completion", () => {
    const collapsing = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch: 0 },
    ).state;
    const oldEpoch = (collapsing.phase as { epoch: number }).epoch;

    const reversed = apply(collapsing, { type: "pointerEnter" });
    expect(reversed.state.phase).toMatchObject({ kind: "expanding", recipe: "animated" });
    const newEpoch = (reversed.state.phase as { epoch: number }).epoch;
    expect(newEpoch).not.toBe(oldEpoch);

    const staleCompactCompletion = apply(reversed.state, {
      type: "visualTransitionCompleted",
      target: "compact",
      epoch: oldEpoch,
    });
    expect(staleCompactCompletion.state.phase.kind).toBe("expanding");
    expect(staleCompactCompletion.effects).toEqual([]);
  });

  it("programmatic full intent from compact uses the given recipe and requests focus", () => {
    const result = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "requestFull", reason: "task", recipe: "instant" },
    );

    expect(result.state.phase).toMatchObject({ kind: "expanding", recipe: "instant" });
    expect(result.state.pointerInside).toBe(false);
    expect(result.effects).toEqual([
      { type: "collapseTimer.cancel" },
      { type: "native.setInteraction", mode: "interactive", epoch: 0 },
      { type: "native.cancelCompactReachability", epoch: 0 },
      { type: "focus.request" },
    ]);
  });

  it("full intent during expansion settles the machine to full without re-requesting expansion", () => {
    const expanding = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;

    const result = apply(expanding, { type: "requestFull", reason: "runtimeGate", recipe: "animated" });

    expect(result.state.phase.kind).toBe("full");
    expect(result.state.pointerInside).toBe(true);
    expect(result.effects).toEqual([
      { type: "collapseTimer.cancel" },
      { type: "native.setInteraction", mode: "interactive", epoch: 0 },
    ]);
  });

  it("full intent while already full only cancels the collapse timer", () => {
    const result = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "requestFull", reason: "shortcut", recipe: "instant" },
    );

    expect(result.state.phase.kind).toBe("full");
    expect(result.effects).toEqual([{ type: "collapseTimer.cancel" }]);
  });

  it("full intent from collapse pending cancels the timer and expands", () => {
    const pending = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
    ).state;

    const result = apply(pending, { type: "requestFull", reason: "task", recipe: "instant" });
    expect(result.state.phase).toMatchObject({ kind: "expanding", recipe: "instant" });
    expect(result.effects).toContainEqual({ type: "collapseTimer.cancel" });
    expect(result.effects).toContainEqual({ type: "focus.request" });
  });

  it("blocks collapse while locked and collapses after final lock release outside", () => {
    const lockedOutside = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "setLock", lock: "task", active: true },
      { type: "pointerLeave" },
    );

    expect(lockedOutside.state.phase.kind).toBe("full");
    expect(lockedOutside.effects).toEqual([]);

    const released = apply(lockedOutside.state, { type: "setLock", lock: "task", active: false });
    expect(released.state.phase.kind).toBe("collapsePending");
    expect(released.effects).toEqual([
      expect.objectContaining({ type: "collapseTimer.start", delayMs: 80 }),
    ]);
  });

  it("keeps full when the final lock releases while the pointer is inside", () => {
    const lockedInside = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerEnter" },
      { type: "setLock", lock: "centerOutcome", active: true },
    );

    const released = apply(lockedInside.state, { type: "setLock", lock: "centerOutcome", active: false });
    expect(released.state.phase.kind).toBe("full");
    expect(released.state.pointerInside).toBe(true);
    expect(released.effects).toEqual([]);

    const left = apply(released.state, { type: "pointerLeave" });
    expect(left.state.phase.kind).toBe("collapsePending");
  });

  it.each([
    ["success", 1500],
    ["cancelled", 1500],
    ["failure", 5000],
  ] as const)(
    "releases a bounded %s center outcome through the normal outside lifecycle path",
    (status, durationMs) => {
      const loading = reduceCenterOverlayState(createCenterOverlayState(), {
        type: "beginTaskOutcomeLoading",
        status,
        origin: "terminal",
        durationMs,
      });
      const visible = reduceCenterOverlayState(loading, {
        type: "showTaskOutcome",
        requestId: loading.requestId,
      });
      expect(isCenterOverlayLockActive(visible)).toBe(true);
      expect(visible).toMatchObject({
        kind: "task-outcome-visible",
        status,
        durationMs,
      });

      const lockedOutside = apply(
        createMainWindowPresentationState({ startsCompact: false }),
        { type: "setLock", lock: "centerOutcome", active: true },
        { type: "pointerLeave" },
      ).state;
      const finished = reduceCenterOverlayState(visible, {
        type: "finishTaskOutcome",
        requestId: visible.requestId,
      });
      expect(isCenterOverlayLockActive(finished)).toBe(false);

      const released = apply(lockedOutside, {
        type: "setLock",
        lock: "centerOutcome",
        active: isCenterOverlayLockActive(finished),
      });
      expect(released.state.phase.kind).toBe("collapsePending");
      expect(released.effects).toEqual([
        expect.objectContaining({ type: "collapseTimer.start", delayMs: 80 }),
      ]);
    },
  );

  it("cancels pending collapse when a lock activates", () => {
    const pending = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
    ).state;
    const timerEpoch = (pending.phase as { timerEpoch: number }).timerEpoch;

    const locked = apply(pending, { type: "setLock", lock: "task", active: true });
    expect(locked.state.phase.kind).toBe("full");
    expect(locked.effects).toEqual([{ type: "collapseTimer.cancel" }]);
    expect(apply(locked.state, { type: "collapseTimerFired", timerEpoch }).state.phase.kind)
      .toBe("full");
  });

  it("keeps drop hover full until the drop lock clears", () => {
    const dropped = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "dropEnter" },
    );
    expect(dropped.state.phase.kind).toBe("expanding");
    expect(dropped.state.locks.drop).toBe(true);

    const epoch = (dropped.state.phase as { epoch: number }).epoch;
    const full = apply(dropped.state, { type: "visualTransitionCompleted", target: "full", epoch });
    const left = apply(full.state, { type: "pointerLeave" });
    expect(left.state.phase.kind).toBe("full");

    const cleared = apply(left.state, { type: "dropLeave" });
    expect(cleared.state.phase.kind).toBe("collapsePending");
  });

  it("compact completion enters compact and emits exactly one passthrough effect", () => {
    const collapsing = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch: 0 },
    ).state;
    const epoch = (collapsing.phase as { epoch: number }).epoch;

    const completed = apply(collapsing, {
      type: "visualTransitionCompleted",
      target: "compact",
      epoch,
    });

    expect(completed.state.phase).toMatchObject({ kind: "compact" });
    // epoch 0 = expanding, 1 = collapsing; settleEpoch is a fresh epoch
    expect((completed.state.phase as { kind: "compact"; settleEpoch: number }).settleEpoch).toBe(2);
    expect(completed.effects).toEqual([
      { type: "native.setInteraction", mode: "compact-passthrough", epoch },
    ]);

    // A duplicate completion after settle is ignored.
    const settled = apply(completed.state, {
      type: "visualTransitionCompleted",
      target: "compact",
      epoch,
    });
    expect(settled.state.phase.kind).toBe("compact");
    expect(settled.effects).toEqual([]);
  });

  it("ignores stale compact completion after reversal", () => {
    const collapsing = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch: 0 },
    ).state;
    const oldEpoch = (collapsing.phase as { epoch: number }).epoch;
    const expanding = apply(collapsing, { type: "pointerEnter" }).state;

    const stale = apply(expanding, {
      type: "visualTransitionCompleted",
      target: "compact",
      epoch: oldEpoch,
    });
    expect(stale.state.phase.kind).toBe("expanding");
    expect(stale.effects).toEqual([]);
  });

  it("full completion with pointer inside settles to full and requests focus", () => {
    const expanding = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;
    const epoch = (expanding.phase as { epoch: number }).epoch;

    const completed = apply(expanding, { type: "visualTransitionCompleted", target: "full", epoch });
    expect(completed.state.phase.kind).toBe("full");
    expect(completed.effects).toEqual([{ type: "focus.request" }]);
  });

  it("ignores full completion with a mismatched epoch", () => {
    const expanding = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;
    const epoch = (expanding.phase as { epoch: number }).epoch;

    const stale = apply(expanding, { type: "visualTransitionCompleted", target: "full", epoch: epoch + 5 });
    expect(stale.state.phase.kind).toBe("expanding");
    expect(stale.effects).toEqual([]);
  });

  it("startup settle from full starts the normal collapse pending path", () => {
    const result = apply(
      createMainWindowPresentationState({ startsCompact: false }),
      { type: "startupSettle" },
    );
    expect(result.state.phase.kind).toBe("collapsePending");
    expect(result.effects).toEqual([
      expect.objectContaining({ type: "collapseTimer.start", delayMs: 80 }),
    ]);
  });

  it("startup settle from compact is a no-op", () => {
    const result = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "startupSettle" },
    );
    expect(result.state.phase.kind).toBe("compact");
    expect(result.effects).toEqual([]);
  });

  it("does not fabricate pointer-inside truth for programmatic full intent", () => {
    const result = apply(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "requestFull", reason: "runtimeGate", recipe: "instant" },
      { type: "visualTransitionCompleted", target: "full", epoch: 0 },
    );
    expect(result.state.pointerInside).toBe(false);
  });
});
