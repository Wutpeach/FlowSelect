import { useCallback, useEffect, useRef, useState } from "react";
import {
  createMainWindowEffectExecutor,
  type MainWindowEffectExecutor,
  type MainWindowEffectExecutorDeps,
} from "./effectExecutor";
import {
  createMainWindowPresentationState,
  reduceMainWindowPresentation,
  type MainWindowPresentationEvent,
  type MainWindowPresentationState,
} from "./lifecycle";

export type MainWindowPresentationDependencies = Omit<
  MainWindowEffectExecutorDeps,
  "onCollapseTimerFired"
>;

export type MainWindowPresentationBinding = {
  state: MainWindowPresentationState;
  stateRef: { current: MainWindowPresentationState };
  dispatch: (event: MainWindowPresentationEvent) => void;
  executor: MainWindowEffectExecutor;
};

// Thin reducer binding: one latest-state ref for synchronous callbacks,
// dispatch, synchronous effect forwarding, and teardown. No transition rules,
// no geometry, no native IPC details, no Motion recipes.
export const useMainWindowPresentation = ({
  startsCompact,
  dependencies,
}: {
  startsCompact: boolean;
  dependencies: MainWindowPresentationDependencies;
}): MainWindowPresentationBinding => {
  const [state, setState] = useState<MainWindowPresentationState>(() =>
    createMainWindowPresentationState({ startsCompact })
  );
  const stateRef = useRef(state);

  const dispatchRef = useRef<(event: MainWindowPresentationEvent) => void>(() => undefined);

  // Stable dispatcher for the collapse timer: reads the latest dispatch from
  // the ref only when the timer actually fires (an event handler), so the
  // lazy-singleton executor below never captures a stale dispatcher.
  const handleCollapseTimerFired = useCallback((timerEpoch: number) => {
    dispatchRef.current({ type: "collapseTimerFired", timerEpoch });
  }, []);

  // The executor is created once (useState lazy initialization keeps the
  // instance stable), but it must not freeze the first render's dependency
  // closures: the sync effect below pushes the latest dependency object in
  // after every render, so effect execution always observes current values
  // (for example a reduced-motion flag flip).
  // The initializer closes over handleCollapseTimerFired, which reads
  // dispatchRef only when the collapse timer fires (an event handler), never
  // during render; the rule cannot see that and would otherwise reject the
  // lazy-singleton executor.
  /* eslint-disable react-hooks/refs */
  const [executor] = useState<MainWindowEffectExecutor>(() =>
    createMainWindowEffectExecutor({
      ...dependencies,
      onCollapseTimerFired: handleCollapseTimerFired,
    })
  );
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    executor.updateDeps({ ...dependencies, onCollapseTimerFired: handleCollapseTimerFired });
  });

  const dispatch = useCallback((event: MainWindowPresentationEvent) => {
    const result = reduceMainWindowPresentation(stateRef.current, event);
    stateRef.current = result.state;
    setState(result.state);
    executor.run(result.effects);
  }, [executor]);

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => () => {
    executor.cancelAll();
  }, [executor]);

  return {
    state,
    stateRef,
    dispatch,
    executor,
  };
};
