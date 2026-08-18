import type { MainWindowPresentationEffect } from "./effectContracts";

export type MainWindowPresentationLock =
  | "drag"
  | "contextMenu"
  | "task"
  | "drop"
  | "centerOutcome"
  | "appUpdate";

export type MainWindowPresentationRecipe = "animated" | "instant";

export type MainWindowFullIntentReason =
  | "task"
  | "runtimeGate"
  | "shortcut"
  | "foreground";

export type MainWindowPhase =
  | { kind: "compact"; settleEpoch: number }
  | { kind: "expanding"; epoch: number; recipe: MainWindowPresentationRecipe }
  | { kind: "full" }
  | { kind: "collapsePending"; timerEpoch: number }
  | { kind: "collapsing"; epoch: number };

export type MainWindowPresentationState = {
  phase: MainWindowPhase;
  pointerInside: boolean;
  locks: Record<MainWindowPresentationLock, boolean>;
  nextEpoch: number;
};

export type MainWindowPresentationEvent =
  | { type: "pointerEnter" }
  | { type: "pointerLeave" }
  | { type: "dropEnter" }
  | { type: "dropLeave" }
  | { type: "setLock"; lock: MainWindowPresentationLock; active: boolean }
  | { type: "startupSettle" }
  | {
    type: "requestFull";
    reason: MainWindowFullIntentReason;
    recipe: MainWindowPresentationRecipe;
  }
  | { type: "collapseTimerFired"; timerEpoch: number }
  | { type: "visualTransitionCompleted"; target: "full" | "compact"; epoch: number };

export type MainWindowPresentationTransition = {
  state: MainWindowPresentationState;
  effects: MainWindowPresentationEffect[];
};

const EMPTY_LOCKS: Record<MainWindowPresentationLock, boolean> = {
  drag: false,
  contextMenu: false,
  task: false,
  drop: false,
  centerOutcome: false,
  appUpdate: false,
};

export const createMainWindowPresentationState = ({
  startsCompact,
}: {
  startsCompact: boolean;
}): MainWindowPresentationState => ({
  phase: startsCompact
    ? { kind: "compact", settleEpoch: 0 }
    : { kind: "full" },
  pointerInside: false,
  locks: { ...EMPTY_LOCKS },
  nextEpoch: 0,
});

export const isMainWindowPresentationCollapseBlocked = (
  state: MainWindowPresentationState,
): boolean => Object.values(state.locks).some(Boolean);

export const isMainWindowPresentationCompact = (
  state: MainWindowPresentationState,
): boolean => state.phase.kind === "compact";

const takeEpoch = (state: MainWindowPresentationState): number => state.nextEpoch;

const withEpoch = (state: MainWindowPresentationState): MainWindowPresentationState => ({
  ...state,
  nextEpoch: state.nextEpoch + 1,
});

const withLock = (
  state: MainWindowPresentationState,
  lock: MainWindowPresentationLock,
  active: boolean,
): MainWindowPresentationState => {
  if (state.locks[lock] === active) {
    return state;
  }
  return {
    ...state,
    locks: {
      ...state.locks,
      [lock]: active,
    },
  };
};

const beginExpand = (
  state: MainWindowPresentationState,
  recipe: MainWindowPresentationRecipe,
  focus: boolean,
): MainWindowPresentationTransition => {
  const epoch = takeEpoch(state);
  const effects: MainWindowPresentationEffect[] = [
    { type: "collapseTimer.cancel" },
    { type: "native.setInteraction", mode: "interactive", epoch },
    { type: "native.cancelCompactReachability", epoch },
  ];
  if (focus) {
    effects.push({ type: "focus.request" });
  }
  return {
    state: withEpoch({
      ...state,
      phase: { kind: "expanding", epoch, recipe },
    }),
    effects,
  };
};

const beginCollapse = (
  state: MainWindowPresentationState,
): MainWindowPresentationTransition => {
  if (isMainWindowPresentationCollapseBlocked(state)) {
    return {
      state: {
        ...state,
        phase: { kind: "full" },
      },
      effects: [{ type: "collapseTimer.cancel" }],
    };
  }

  const epoch = takeEpoch(state);
  return {
    state: withEpoch({
      ...state,
      phase: { kind: "collapsing", epoch },
    }),
    effects: [
      { type: "collapseTimer.cancel" },
      { type: "native.prepareCompactReachability", epoch },
    ],
  };
};

const beginCollapseDelay = (
  state: MainWindowPresentationState,
): MainWindowPresentationTransition => {
  if (state.pointerInside || isMainWindowPresentationCollapseBlocked(state)) {
    return {
      state,
      effects: [],
    };
  }

  const timerEpoch = takeEpoch(state);
  return {
    state: withEpoch({
      ...state,
      phase: { kind: "collapsePending", timerEpoch },
    }),
    effects: [{ type: "collapseTimer.start", timerEpoch, delayMs: 80 }],
  };
};

const cancelPendingCollapse = (
  state: MainWindowPresentationState,
): MainWindowPresentationTransition => ({
  state: {
    ...state,
    phase: { kind: "full" },
  },
  effects: [{ type: "collapseTimer.cancel" }],
});

export const reduceMainWindowPresentation = (
  state: MainWindowPresentationState,
  event: MainWindowPresentationEvent,
): MainWindowPresentationTransition => {
  switch (event.type) {
    case "pointerEnter": {
      const nextState = {
        ...state,
        pointerInside: true,
      };
      if (nextState.phase.kind === "compact" || nextState.phase.kind === "collapsing") {
        return beginExpand(nextState, "animated", false);
      }
      if (nextState.phase.kind === "collapsePending") {
        return cancelPendingCollapse(nextState);
      }
      return {
        state: nextState,
        effects: [{ type: "collapseTimer.cancel" }],
      };
    }

    case "pointerLeave": {
      if (state.phase.kind === "expanding") {
        return {
          state: {
            ...state,
            pointerInside: false,
          },
          effects: [],
        };
      }
      if (state.phase.kind === "compact") {
        // Already settled compact; a leave cannot schedule a second collapse.
        return {
          state: {
            ...state,
            pointerInside: false,
          },
          effects: [],
        };
      }
      return beginCollapseDelay({
        ...state,
        pointerInside: false,
      });
    }

    case "dropEnter":
      return reduceMainWindowPresentation(withLock({
        ...state,
        pointerInside: true,
      }, "drop", true), { type: "pointerEnter" });

    case "dropLeave":
      return reduceMainWindowPresentation({
        ...state,
        pointerInside: false,
      }, { type: "setLock", lock: "drop", active: false });

    case "setLock": {
      const nextState = withLock(state, event.lock, event.active);
      if (!event.active && nextState.phase.kind === "full" && !nextState.pointerInside) {
        return beginCollapseDelay(nextState);
      }
      if (event.active && nextState.phase.kind === "collapsePending") {
        return cancelPendingCollapse(nextState);
      }
      return {
        state: nextState,
        effects: [],
      };
    }

    case "startupSettle": {
      if (state.phase.kind === "compact") {
        return {
          state,
          effects: [],
        };
      }
      return beginCollapseDelay(state);
    }

    case "requestFull": {
      if (state.phase.kind === "full") {
        return {
          state,
          effects: [{ type: "collapseTimer.cancel" }],
        };
      }
      if (state.phase.kind === "expanding") {
        // Matches the previous reducer's forceFull-during-expansion contract:
        // the machine settles to full immediately; the visual completion is
        // ignored because the expanding epoch is no longer current.
        return {
          state: {
            ...state,
            phase: { kind: "full" },
          },
          effects: [
            { type: "collapseTimer.cancel" },
            { type: "native.setInteraction", mode: "interactive", epoch: state.phase.epoch },
          ],
        };
      }
      if (state.phase.kind === "collapsePending") {
        const cancel = cancelPendingCollapse(state);
        const expanded = beginExpand(cancel.state, event.recipe, true);
        return {
          state: expanded.state,
          effects: [...cancel.effects, ...expanded.effects],
        };
      }
      return beginExpand(state, event.recipe, true);
    }

    case "collapseTimerFired":
      if (
        state.phase.kind !== "collapsePending"
        || state.phase.timerEpoch !== event.timerEpoch
      ) {
        return {
          state,
          effects: [],
        };
      }
      return beginCollapse(state);

    case "visualTransitionCompleted":
      if (event.target === "full") {
        if (
          state.phase.kind !== "expanding"
          || state.phase.epoch !== event.epoch
        ) {
          return {
            state,
            effects: [],
          };
        }
        if (!state.pointerInside && !isMainWindowPresentationCollapseBlocked(state)) {
          return beginCollapseDelay({
            ...state,
            phase: { kind: "full" },
          });
        }
        return {
          state: {
            ...state,
            phase: { kind: "full" },
          },
          effects: [{ type: "focus.request" }],
        };
      }

      if (
        state.phase.kind !== "collapsing"
        || state.phase.epoch !== event.epoch
      ) {
        return {
          state,
          effects: [],
        };
      }
      {
        const settleEpoch = takeEpoch(state);
        return {
          state: withEpoch({
            ...state,
            phase: { kind: "compact", settleEpoch },
          }),
          effects: [
            {
              type: "native.setInteraction",
              mode: "compact-passthrough",
              epoch: event.epoch,
            },
          ],
        };
      }
  }
};
