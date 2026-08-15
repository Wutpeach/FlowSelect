import type {
  ExpandedPresentationProgressTarget,
  ExpandedPresentationTarget,
} from "./expandedPresentationTargets";

const PROGRESS_CONVERGENCE_PER_SECOND = 2.4;
const PROGRESS_SNAP = 0.001;
const MAX_FRAME_DELTA_SECONDS = 0.05;
// Visual tuning only. Product, lifecycle, retention, and acceptance never
// depend on this renderer-local duration.
export const ACTIVATION_DURATION_MS = 720;

export type ExpandedPresentationInputs = Readonly<{
  target: ExpandedPresentationTarget;
  reducedMotion: boolean;
}>;

export type ExpandedPresentationFrame = Readonly<{
  target: ExpandedPresentationTarget;
  progressLevel: number;
  reducedMotion: boolean;
  timeSeconds: number;
}>;

export type ExpandedPresentationRuntimeState = "sleeping" | "awake" | "disposed";

export type ExpandedPresentationRuntime = {
  wake: (inputs: ExpandedPresentationInputs) => void;
  setInputs: (inputs: ExpandedPresentationInputs) => void;
  sleep: () => void;
  dispose: () => void;
  getState: () => ExpandedPresentationRuntimeState;
  getPendingFrameCount: () => number;
  getTarget: () => ExpandedPresentationTarget;
  getProgressTarget: () => ExpandedPresentationProgressTarget;
  getProgressLevel: () => number;
};

const IDLE_TARGET: ExpandedPresentationTarget = { kind: "idle" };
const IDLE_PROGRESS: ExpandedPresentationProgressTarget = { kind: "idle" };

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const progressEquals = (
  left: ExpandedPresentationProgressTarget,
  right: ExpandedPresentationProgressTarget,
): boolean => {
  if (left.kind === "idle" || right.kind === "idle") {
    return left.kind === right.kind;
  }
  if (left.kind !== right.kind || left.traceId !== right.traceId) {
    return false;
  }
  return left.kind === "indeterminate"
    || (right.kind === "determinate" && left.target === right.target);
};

const targetProgress = (
  target: ExpandedPresentationTarget,
): ExpandedPresentationProgressTarget => {
  if (target.kind === "progress" || target.kind === "activation") {
    return target.progress;
  }
  return IDLE_PROGRESS;
};

const targetEquals = (
  left: ExpandedPresentationTarget,
  right: ExpandedPresentationTarget,
): boolean => {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "idle":
      return true;
    case "progress":
      return right.kind === "progress" && progressEquals(left.progress, right.progress);
    case "activation":
      return right.kind === "activation"
        && left.source === right.source
        && left.opportunityId === right.opportunityId
        && left.origin.x === right.origin.x
        && left.origin.y === right.origin.y
        && left.startedAt === right.startedAt
        && progressEquals(left.progress, right.progress);
  }
};

const inputsEqual = (
  left: ExpandedPresentationInputs,
  right: ExpandedPresentationInputs,
): boolean => (
  left.reducedMotion === right.reducedMotion
  && targetEquals(left.target, right.target)
);

/**
 * Consumer-local frame execution for the one Expanded graphics host. It owns
 * only reconstructible interpolation and bounded rAF scheduling. Semantic
 * priority and Intake lifetime are already resolved by Presentation policy.
 */
export const createExpandedPresentationRuntime = (dependencies: {
  now: () => number;
  scheduleFrame: (callback: (now: number) => void) => number;
  cancelFrame: (handle: number) => void;
  render: (frame: ExpandedPresentationFrame) => void;
}): ExpandedPresentationRuntime => {
  const { now, scheduleFrame, cancelFrame, render } = dependencies;
  let state: ExpandedPresentationRuntimeState = "sleeping";
  let generation = 0;
  let frameHandle: number | null = null;
  let inputs: ExpandedPresentationInputs = {
    target: IDLE_TARGET,
    reducedMotion: false,
  };
  let target: ExpandedPresentationTarget = IDLE_TARGET;
  let progressTarget: ExpandedPresentationProgressTarget = IDLE_PROGRESS;
  let progressLevel = 0;
  let lastFrameAt = 0;

  const cancelPendingFrame = (): void => {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
  };

  const failClosed = (): void => {
    generation += 1;
    cancelPendingFrame();
    state = "sleeping";
  };

  const renderCurrent = (timeMs: number): boolean => {
    try {
      render({
        target,
        progressLevel,
        reducedMotion: inputs.reducedMotion,
        timeSeconds: timeMs / 1000,
      });
      return true;
    } catch {
      failClosed();
      return false;
    }
  };

  const needsFrames = (): boolean => (
    !inputs.reducedMotion
    && (
      (target.kind === "activation" && now() < target.startedAt + ACTIVATION_DURATION_MS)
      || (
        progressTarget.kind === "determinate"
        && Math.abs(progressTarget.target - progressLevel) > PROGRESS_SNAP
      )
    )
  );

  const scheduleNextFrame = (): void => {
    if (state !== "awake" || frameHandle !== null || !needsFrames()) {
      return;
    }
    const scheduledGeneration = generation;
    frameHandle = scheduleFrame((frameNow) => {
      if (state !== "awake" || scheduledGeneration !== generation) {
        return;
      }
      frameHandle = null;
      const deltaSeconds = Math.min(
        Math.max((frameNow - lastFrameAt) / 1000, 0),
        MAX_FRAME_DELTA_SECONDS,
      );
      lastFrameAt = frameNow;
      if (progressTarget.kind === "determinate" && !inputs.reducedMotion) {
        progressLevel = Math.min(
          progressTarget.target,
          progressLevel + PROGRESS_CONVERGENCE_PER_SECOND * deltaSeconds,
        );
        if (Math.abs(progressTarget.target - progressLevel) <= PROGRESS_SNAP) {
          progressLevel = progressTarget.target;
        }
      }
      if (renderCurrent(frameNow)) {
        scheduleNextFrame();
      }
    });
  };

  const applyInputs = (next: ExpandedPresentationInputs): void => {
    const previousProgress = progressTarget;
    const previousTrace = previousProgress.kind === "idle"
      ? null
      : previousProgress.traceId;
    const nextProgress = targetProgress(next.target);
    const nextTrace = nextProgress.kind === "idle" ? null : nextProgress.traceId;
    const traceChanged = previousTrace !== null
      && nextTrace !== null
      && previousTrace !== nextTrace;

    inputs = next;
    target = next.target;
    progressTarget = nextProgress;

    if (nextProgress.kind === "idle") {
      progressLevel = 0;
      return;
    }
    if (nextProgress.kind === "indeterminate") {
      if (traceChanged) {
        progressLevel = 0;
      }
      return;
    }

    const normalizedProgress = {
      ...nextProgress,
      target: clamp01(nextProgress.target),
    };
    progressTarget = normalizedProgress;
    if (target.kind === "progress") {
      target = { ...target, progress: normalizedProgress };
    } else if (target.kind === "activation") {
      target = { ...target, progress: normalizedProgress };
    }
    if (
      previousProgress.kind === "idle"
      || traceChanged
      || next.reducedMotion
    ) {
      progressLevel = normalizedProgress.target;
    } else if (previousProgress.kind === "indeterminate") {
      progressLevel = Math.min(progressLevel, normalizedProgress.target);
    } else if (normalizedProgress.target < progressLevel) {
      // An authoritative downward revision must never be visually overstated.
      progressLevel = normalizedProgress.target;
    }
  };

  const setInputs = (next: ExpandedPresentationInputs): void => {
    if (state === "disposed") {
      return;
    }
    const changed = !inputsEqual(inputs, next);
    applyInputs(next);
    if (state !== "awake" || !changed) {
      return;
    }
    cancelPendingFrame();
    lastFrameAt = now();
    if (renderCurrent(lastFrameAt)) {
      scheduleNextFrame();
    }
  };

  const wake = (next: ExpandedPresentationInputs): void => {
    if (state === "disposed") {
      return;
    }
    if (state === "awake") {
      setInputs(next);
      return;
    }
    state = "awake";
    generation += 1;
    target = IDLE_TARGET;
    progressTarget = IDLE_PROGRESS;
    progressLevel = 0;
    applyInputs(next);
    lastFrameAt = now();
    if (renderCurrent(lastFrameAt)) {
      scheduleNextFrame();
    }
  };

  const sleep = (): void => {
    if (state !== "awake") {
      return;
    }
    generation += 1;
    cancelPendingFrame();
    state = "sleeping";
    target = IDLE_TARGET;
    progressTarget = IDLE_PROGRESS;
    progressLevel = 0;
  };

  const dispose = (): void => {
    if (state === "disposed") {
      return;
    }
    generation += 1;
    cancelPendingFrame();
    state = "disposed";
    target = IDLE_TARGET;
    progressTarget = IDLE_PROGRESS;
    progressLevel = 0;
  };

  return {
    wake,
    setInputs,
    sleep,
    dispose,
    getState: () => state,
    getPendingFrameCount: () => (frameHandle === null ? 0 : 1),
    getTarget: () => target,
    getProgressTarget: () => progressTarget,
    getProgressLevel: () => progressLevel,
  };
};
