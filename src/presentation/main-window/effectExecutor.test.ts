import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMainWindowEffectExecutor, type MainWindowEffectExecutorDeps } from "./effectExecutor";

const createFakeDeps = (overrides: Partial<MainWindowEffectExecutorDeps> = {}) => {
  const scheduleTimer = vi.fn<(handler: () => void, delayMs: number) => number>(
    (handler: () => void) => setTimeout(handler, 0) as unknown as number,
  );
  const cancelTimer = vi.fn<(handle: number) => void>((handle: number) => {
    clearTimeout(handle);
  });
  const deps: MainWindowEffectExecutorDeps = {
    scheduleTimer,
    cancelTimer,
    setInteractionMode: vi.fn(),
    beginCompactReachability: vi.fn(),
    cancelCompactReachability: vi.fn(),
    focusContainer: vi.fn(),
    onCollapseTimerFired: vi.fn(),
    supportsCompactPassthrough: true,
    ...overrides,
  };
  return { deps, scheduleTimer, cancelTimer };
};

describe("mainWindowPresentation effect executor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a collapse timer and fires the timer epoch callback", () => {
    const { deps, scheduleTimer } = createFakeDeps();
    const executor = createMainWindowEffectExecutor(deps);
    executor.run([{ type: "collapseTimer.start", timerEpoch: 7, delayMs: 80 }]);
    expect(scheduleTimer).toHaveBeenCalledTimes(1);
    expect(scheduleTimer).toHaveBeenCalledWith(expect.any(Function), 80);

    vi.runAllTimers();
    expect(deps.onCollapseTimerFired).toHaveBeenCalledWith(7);
  });

  it("cancels a pending collapse timer before starting a new one", () => {
    const { deps, scheduleTimer, cancelTimer } = createFakeDeps();
    const executor = createMainWindowEffectExecutor(deps);
    executor.run([{ type: "collapseTimer.start", timerEpoch: 1, delayMs: 80 }]);
    const firstHandle = scheduleTimer.mock.results[0].value as number;
    executor.run([{ type: "collapseTimer.start", timerEpoch: 2, delayMs: 80 }]);
    expect(cancelTimer).toHaveBeenCalledWith(firstHandle);
    expect(scheduleTimer).toHaveBeenCalledTimes(2);
  });

  it("cancels the collapse timer on the cancel effect and on cancelAll", () => {
    const { deps, scheduleTimer, cancelTimer } = createFakeDeps();
    const executor = createMainWindowEffectExecutor(deps);
    executor.run([{ type: "collapseTimer.start", timerEpoch: 1, delayMs: 80 }]);
    const handle = scheduleTimer.mock.results[0].value as number;

    executor.run([{ type: "collapseTimer.cancel" }]);
    expect(cancelTimer).toHaveBeenCalledWith(handle);

    executor.run([{ type: "collapseTimer.start", timerEpoch: 2, delayMs: 80 }]);
    const secondHandle = scheduleTimer.mock.results[1].value as number;
    executor.cancelAll();
    expect(cancelTimer).toHaveBeenCalledWith(secondHandle);
  });

  it("executes interaction, reachability, and focus effects", () => {
    const { deps } = createFakeDeps();
    const executor = createMainWindowEffectExecutor(deps);

    executor.run([
      { type: "native.setInteraction", mode: "interactive", epoch: 3 },
      { type: "native.prepareCompactReachability", epoch: 4 },
      { type: "native.cancelCompactReachability", epoch: 5 },
      { type: "focus.request" },
    ]);

    expect(deps.setInteractionMode).toHaveBeenCalledWith("interactive");
    expect(deps.beginCompactReachability).toHaveBeenCalledWith(4);
    expect(deps.cancelCompactReachability).toHaveBeenCalledTimes(1);
    expect(deps.focusContainer).toHaveBeenCalledTimes(1);
  });

  it("ignores compact-passthrough when the platform does not support it", () => {
    const { deps } = createFakeDeps({ supportsCompactPassthrough: false });
    const executor = createMainWindowEffectExecutor(deps);

    executor.run([
      { type: "native.setInteraction", mode: "compact-passthrough", epoch: 1 },
      { type: "native.setInteraction", mode: "interactive", epoch: 2 },
    ]);

    expect(deps.setInteractionMode).toHaveBeenCalledTimes(1);
    expect(deps.setInteractionMode).toHaveBeenCalledWith("interactive");
  });

  it("observes dependency updates: reduced-motion reachability lands on the new implementation", () => {
    const first = createFakeDeps();
    const executor = createMainWindowEffectExecutor(first.deps);

    // First run uses the initial dependencies.
    executor.run([{ type: "native.prepareCompactReachability", epoch: 1 }]);
    expect(first.deps.beginCompactReachability).toHaveBeenCalledWith(1);

    // A dependency update (for example the reduced-motion flag flipping) must
    // be visible to later runs; the executor cannot freeze first-render deps.
    const second = createFakeDeps();
    executor.updateDeps(second.deps);
    executor.run([{ type: "native.prepareCompactReachability", epoch: 2 }]);
    expect(second.deps.beginCompactReachability).toHaveBeenCalledWith(2);
    expect(first.deps.beginCompactReachability).toHaveBeenCalledTimes(1);
  });

  it("observes a supportsCompactPassthrough flip through updateDeps", () => {
    const first = createFakeDeps({ supportsCompactPassthrough: false });
    const executor = createMainWindowEffectExecutor(first.deps);

    executor.run([{ type: "native.setInteraction", mode: "compact-passthrough", epoch: 1 }]);
    expect(first.deps.setInteractionMode).not.toHaveBeenCalled();

    const second = createFakeDeps({ supportsCompactPassthrough: true });
    executor.updateDeps(second.deps);
    executor.run([{ type: "native.setInteraction", mode: "compact-passthrough", epoch: 2 }]);
    expect(second.deps.setInteractionMode).toHaveBeenCalledWith("compact-passthrough");
  });

  it("uses the latest collapse-timer callback after updateDeps", () => {
    const first = createFakeDeps();
    const executor = createMainWindowEffectExecutor(first.deps);
    executor.run([{ type: "collapseTimer.start", timerEpoch: 5, delayMs: 80 }]);

    const second = createFakeDeps();
    executor.updateDeps(second.deps);
    vi.runAllTimers();
    expect(second.deps.onCollapseTimerFired).toHaveBeenCalledWith(5);
    expect(first.deps.onCollapseTimerFired).not.toHaveBeenCalled();
  });
});
