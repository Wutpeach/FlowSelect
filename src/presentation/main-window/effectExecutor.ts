import type {
  MainWindowInteractionMode,
  MainWindowPresentationEffect,
} from "./effectContracts";

export type MainWindowEffectExecutorDeps = {
  scheduleTimer(handler: () => void, delayMs: number): number;
  cancelTimer(handle: number): void;
  setInteractionMode(mode: MainWindowInteractionMode): void;
  beginCompactReachability(requestEpoch: number): void;
  cancelCompactReachability(): void;
  focusContainer(): void;
  onCollapseTimerFired(timerEpoch: number): void;
  /** Compact passthrough applies only on platforms with click-through support. */
  supportsCompactPassthrough: boolean;
};

export type MainWindowEffectExecutor = {
  run(effects: MainWindowPresentationEffect[]): void;
  cancelAll(): void;
  /** Swap in the latest dependency implementations; runs never freeze first-render closures. */
  updateDeps(next: MainWindowEffectExecutorDeps): void;
};

export const createMainWindowEffectExecutor = (
  deps: MainWindowEffectExecutorDeps,
): MainWindowEffectExecutor => {
  let currentDeps = deps;
  let collapseTimerHandle: number | null = null;

  const cancelCollapseTimer = () => {
    if (collapseTimerHandle === null) {
      return;
    }
    currentDeps.cancelTimer(collapseTimerHandle);
    collapseTimerHandle = null;
  };

  const run = (effects: MainWindowPresentationEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "collapseTimer.start":
          cancelCollapseTimer();
          collapseTimerHandle = currentDeps.scheduleTimer(() => {
            collapseTimerHandle = null;
            currentDeps.onCollapseTimerFired(effect.timerEpoch);
          }, effect.delayMs);
          break;

        case "collapseTimer.cancel":
          cancelCollapseTimer();
          break;

        case "native.prepareCompactReachability":
          currentDeps.beginCompactReachability(effect.epoch);
          break;

        case "native.cancelCompactReachability":
          currentDeps.cancelCompactReachability();
          break;

        case "native.setInteraction":
          if (effect.mode === "compact-passthrough" && !currentDeps.supportsCompactPassthrough) {
            break;
          }
          currentDeps.setInteractionMode(effect.mode);
          break;

        case "focus.request":
          currentDeps.focusContainer();
          break;
      }
    }
  };

  return {
    run,
    cancelAll: cancelCollapseTimer,
    updateDeps: (next) => {
      currentDeps = next;
    },
  };
};
