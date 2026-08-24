import { describe, expect, it } from "vitest";

import { createMainWindowEffectExecutor, type MainWindowEffectExecutorDeps } from "./effectExecutor";
import {
  createMainWindowPresentationState,
  reduceMainWindowPresentation,
  type MainWindowPresentationEvent,
} from "./lifecycle";
import { resolveMainWindowPresentationProjections } from "./projections";

// Compact completion has exactly one acknowledgement: the matching Renderer
// Motion collapse completion. Native compact reachability is independent,
// cancellable OS work; it neither completes nor gates the lifecycle or
// passthrough. This suite pins that contract end to end.

const runSequence = (events: MainWindowPresentationEvent[]) => {
  let state = createMainWindowPresentationState({ startsCompact: false });
  const effects: MainWindowEffectExecutorDeps[] = [];
  for (const event of events) {
    const result = reduceMainWindowPresentation(state, event);
    state = result.state;
    // Each effect run is executed against fresh fake deps to prove the
    // executor fires exactly what the reducer declared.
    const deps = {
      scheduleTimer: () => 0,
      cancelTimer: () => undefined,
      setInteractionMode: () => undefined,
      beginCompactReachability: () => undefined,
      cancelCompactReachability: () => undefined,
      focusContainer: () => undefined,
      onCollapseTimerFired: () => undefined,
      supportsCompactPassthrough: true,
    } as MainWindowEffectExecutorDeps;
    createMainWindowEffectExecutor(deps).run(result.effects);
    effects.push(deps);
  }
  return { state, effects };
};

describe("compact completion contract", () => {
  it("collapse starts reachability and stays interactive; completion enters compact and emits one passthrough", () => {
    const left = runSequence([{ type: "pointerLeave" }]);
    const timerEpoch = (left.state.phase as { timerEpoch: number }).timerEpoch;
    const collapsing = runSequence([
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch },
    ]);

    // Collapsing starts native compact reachability and keeps interactive.
    expect(collapsing.state.phase.kind).toBe("collapsing");
    expect(collapsing.effects[collapsing.effects.length - 1]?.beginCompactReachability).toBeDefined();
    const interactionDuringCollapse = resolveMainWindowPresentationProjections(
      collapsing.state,
      { supportsCompactPassthrough: true },
    ).interaction;
    expect(interactionDuringCollapse.mode).toBe("interactive");
    expect(interactionDuringCollapse.hotspotActive).toBe(false);

    // Native placement finishing must not change the lifecycle.
    const afterNativePlacement = reduceMainWindowPresentation(collapsing.state, {
      type: "setLock",
      lock: "drag",
      active: false,
    });
    expect(afterNativePlacement.state.phase.kind).toBe("collapsing");

    // Matching Renderer Motion completion is the sole acknowledgement.
    const epoch = (collapsing.state.phase as { epoch: number }).epoch;
    const completed = runSequence([
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch },
      { type: "visualTransitionCompleted", target: "compact", epoch },
    ]);

    expect(completed.state.phase.kind).toBe("compact");
    const lastEffects = completed.effects[completed.effects.length - 1];
    expect(lastEffects?.setInteractionMode).toBeDefined();
    const projection = resolveMainWindowPresentationProjections(
      completed.state,
      { supportsCompactPassthrough: true },
    );
    expect(projection.interaction.mode).toBe("compact-passthrough");
    expect(projection.interaction.hotspotActive).toBe(true);
  });

  it("stale compact completion after reversal cannot enable passthrough", () => {
    const left = runSequence([{ type: "pointerLeave" }]);
    const timerEpoch = (left.state.phase as { timerEpoch: number }).timerEpoch;
    const collapsing = runSequence([
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch },
    ]);
    const oldEpoch = (collapsing.state.phase as { epoch: number }).epoch;

    const reversed = runSequence([
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch },
      { type: "pointerEnter" },
      { type: "visualTransitionCompleted", target: "compact", epoch: oldEpoch },
    ]);

    expect(reversed.state.phase.kind).toBe("expanding");
    const projection = resolveMainWindowPresentationProjections(
      reversed.state,
      { supportsCompactPassthrough: true },
    );
    expect(projection.interaction.mode).toBe("interactive");
    expect(projection.interaction.hotspotActive).toBe(false);
  });

  it("full intent cancels compact correction and restores interactive policy", () => {
    const left = runSequence([{ type: "pointerLeave" }]);
    const timerEpoch = (left.state.phase as { timerEpoch: number }).timerEpoch;

    const result = runSequence([
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch },
      { type: "requestFull", reason: "task", recipe: "instant" },
    ]);

    expect(result.state.phase.kind).toBe("expanding");
    const lastEffects = result.effects[result.effects.length - 1];
    expect(lastEffects?.cancelCompactReachability).toBeDefined();
    expect(lastEffects?.setInteractionMode).toBeDefined();
  });

  it("no nativeSettled state or event exists", () => {
    const left = runSequence([{ type: "pointerLeave" }]);
    const timerEpoch = (left.state.phase as { timerEpoch: number }).timerEpoch;
    const collapsing = runSequence([
      { type: "pointerLeave" },
      { type: "collapseTimerFired", timerEpoch },
    ]);
    const epoch = (collapsing.state.phase as { epoch: number }).epoch;
    const completed = reduceMainWindowPresentation(collapsing.state, {
      type: "visualTransitionCompleted",
      target: "compact",
      epoch,
    });

    const serialized = JSON.stringify(completed.state);
    expect(serialized).not.toContain("nativeSettled");
  });
});
