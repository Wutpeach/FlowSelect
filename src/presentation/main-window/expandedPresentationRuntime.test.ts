import { describe, expect, it, vi } from "vitest";
import {
  ACTIVATION_DURATION_MS,
  createExpandedPresentationRuntime,
  type ExpandedPresentationFrame,
  type ExpandedPresentationInputs,
} from "./expandedPresentationRuntime";

const progress = (traceId: string, target: number): ExpandedPresentationInputs => ({
  target: { kind: "progress", progress: { kind: "determinate", traceId, target } },
  reducedMotion: false,
});

const idle = (reducedMotion = false): ExpandedPresentationInputs => ({
  target: { kind: "idle" },
  reducedMotion,
});

const indeterminate = (traceId: string, reducedMotion = false): ExpandedPresentationInputs => ({
  target: { kind: "progress", progress: { kind: "indeterminate", traceId } },
  reducedMotion,
});

const activation = (startedAt: number, reducedMotion = false): ExpandedPresentationInputs => ({
  target: {
    kind: "activation",
    source: "intake",
    opportunityId: 1,
    origin: { x: 0.25, y: 0.75 },
    startedAt,
    progress: { kind: "determinate", traceId: "a", target: 0.2 },
  },
  reducedMotion,
});

const heatmap = (reducedMotion = false): ExpandedPresentationInputs => ({
  // Settled determinate progress underlay: alone it would schedule zero
  // frames; the lab-only heatmap flag is what keeps the field animating.
  target: { kind: "progress", progress: { kind: "determinate", traceId: "a", target: 0.5 } },
  reducedMotion,
  heatmap: true,
});

const createHarness = () => {
  let now = 0;
  let nextHandle = 1;
  const callbacks = new Map<number, (time: number) => void>();
  const render = vi.fn<(frame: ExpandedPresentationFrame) => void>();
  const runtime = createExpandedPresentationRuntime({
    now: () => now,
    scheduleFrame: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => callbacks.delete(handle),
    render,
  });
  return {
    runtime,
    render,
    pending: () => callbacks.size,
    step: (delta = 16) => {
      now += delta;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(now));
    },
    capturePending: () => [...callbacks.values()],
  };
};

describe("Expanded Presentation runtime", () => {
  it("draws idle once on wake and leaves no frame work", () => {
    const harness = createHarness();
    harness.runtime.wake(idle());
    expect(harness.render).toHaveBeenCalledTimes(1);
    expect(harness.pending()).toBe(0);
  });

  it("keeps honest indeterminate progress static without a fake quantitative loop", () => {
    const harness = createHarness();
    harness.runtime.wake(indeterminate("a"));
    expect(harness.pending()).toBe(0);
    expect(harness.runtime.getProgressTarget()).toEqual({ kind: "indeterminate", traceId: "a" });
  });

  it("snaps downward and resets quantitative state for replacement traces", () => {
    const harness = createHarness();
    harness.runtime.wake(progress("old", 0.8));
    harness.runtime.setInputs(progress("old", 0.35));
    expect(harness.runtime.getProgressLevel()).toBe(0.35);
    harness.runtime.setInputs(progress("new", 0.12));
    expect(harness.runtime.getProgressLevel()).toBe(0.12);
  });

  it("runs at most one bounded Activation frame chain then settles with no further work", () => {
    const harness = createHarness();
    harness.runtime.wake(activation(0));
    expect(harness.pending()).toBe(1);
    harness.step(ACTIVATION_DURATION_MS + 1);
    expect(harness.pending()).toBe(0);
    expect(harness.runtime.getTarget()).toMatchObject({ kind: "activation", source: "intake" });
  });

  it("renders static Reduced Motion activation and never schedules a frame", () => {
    const harness = createHarness();
    harness.runtime.wake(activation(0, true));
    expect(harness.pending()).toBe(0);
    expect(harness.render).toHaveBeenCalledTimes(1);
  });

  it("sleeps, disposes, and render-fails closed without retained frame work", () => {
    const harness = createHarness();
    harness.runtime.wake(activation(0));
    harness.runtime.sleep();
    expect(harness.pending()).toBe(0);
    harness.runtime.wake(progress("after-sleep", 0.5));
    expect(harness.runtime.getTarget()).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: "after-sleep", target: 0.5 },
    });
    harness.runtime.dispose();
    harness.runtime.wake(progress("a", 0.5));
    expect(harness.runtime.getState()).toBe("disposed");
  });

  it("replaces a live activation without retaining the cancelled frame", () => {
    const harness = createHarness();
    harness.runtime.wake(activation(0));
    const replacement: ExpandedPresentationInputs = {
      target: {
        kind: "activation",
        opportunityId: 2,
        source: "folder",
        origin: { x: 0.7, y: 0.3 },
        startedAt: 40,
        progress: { kind: "determinate", traceId: "a", target: 0.2 },
      },
      reducedMotion: false,
    };
    harness.runtime.setInputs(replacement);
    expect(harness.pending()).toBe(1);
    harness.step();
    expect(harness.runtime.getTarget()).toMatchObject({
      kind: "activation",
      opportunityId: 2,
      source: "folder",
      origin: { x: 0.7, y: 0.3 },
    });
  });

  it("returns from Activation to the latest progress fact", () => {
    const harness = createHarness();
    harness.runtime.wake(activation(0));
    harness.runtime.setInputs({
      target: {
        kind: "activation",
        source: "intake",
        opportunityId: 1,
        origin: { x: 0.25, y: 0.75 },
        startedAt: 0,
        progress: { kind: "determinate", traceId: "a", target: 0.65 },
      },
      reducedMotion: false,
    });
    harness.runtime.setInputs(progress("a", 0.65));
    expect(harness.runtime.getTarget()).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: "a", target: 0.65 },
    });
    expect(harness.runtime.getProgressTarget()).toEqual({
      kind: "determinate",
      traceId: "a",
      target: 0.65,
    });
  });

  it("ignores a stale scheduled callback after sleep and reconstruction", () => {
    const harness = createHarness();
    harness.runtime.wake(activation(0));
    const [staleFrame] = harness.capturePending();
    harness.runtime.sleep();
    harness.runtime.wake(progress("new", 0.42));
    const renderCount = harness.render.mock.calls.length;
    staleFrame?.(100);
    expect(harness.render).toHaveBeenCalledTimes(renderCount);
    expect(harness.runtime.getProgressLevel()).toBe(0.42);
    expect(harness.pending()).toBe(0);
  });

  it("does not replay an expired activation when waking after its bounded phase", () => {
    const harness = createHarness();
    harness.step(ACTIVATION_DURATION_MS + 1);
    harness.runtime.wake(activation(0));
    expect(harness.pending()).toBe(0);
    expect(harness.render).toHaveBeenCalledTimes(1);
  });

  it("converges same-trace upward revisions with one pending frame at a time", () => {
    const harness = createHarness();
    harness.runtime.wake(progress("a", 0.1));
    harness.runtime.setInputs(progress("a", 0.5));
    expect(harness.pending()).toBe(1);
    for (let step = 0; step < 10 && harness.pending() > 0; step += 1) {
      harness.step(100);
      expect(harness.pending()).toBeLessThanOrEqual(1);
    }
    expect(harness.runtime.getProgressLevel()).toBe(0.5);
    expect(harness.pending()).toBe(0);
  });

  it("keeps the Heatmap spike animating with one pending frame and stops when the flag is removed", () => {
    const harness = createHarness();
    harness.runtime.wake(heatmap());
    expect(harness.pending()).toBe(1);
    for (let step = 0; step < 20 && harness.pending() > 0; step += 1) {
      harness.step(16);
      expect(harness.pending()).toBeLessThanOrEqual(1);
    }
    expect(harness.pending()).toBe(1); // still animating after many frames
    // Removing the lab-only flag returns to the settled progress baseline with
    // no heatmap-driven scheduling left behind.
    harness.runtime.setInputs(progress("a", 0.5));
    expect(harness.pending()).toBe(0);
  });

  it("starts animating when the Heatmap flag turns on for an otherwise settled target", () => {
    const harness = createHarness();
    harness.runtime.wake(progress("a", 0.5));
    expect(harness.pending()).toBe(0);
    harness.runtime.setInputs(heatmap());
    expect(harness.pending()).toBe(1);
    expect(harness.render).toHaveBeenCalledTimes(2);
  });

  it("renders a static Heatmap snapshot under Reduced Motion with zero scheduled frames", () => {
    const harness = createHarness();
    harness.runtime.wake(heatmap(true));
    expect(harness.pending()).toBe(0);
    expect(harness.render).toHaveBeenCalledTimes(1);
  });

  it("fails closed when rendering throws", () => {
    let now = 0;
    const callbacks = new Map<number, (time: number) => void>();
    const runtime = createExpandedPresentationRuntime({
      now: () => now,
      scheduleFrame: (callback) => {
        const handle = callbacks.size + 1;
        callbacks.set(handle, callback);
        return handle;
      },
      cancelFrame: (handle) => callbacks.delete(handle),
      render: () => {
        throw new Error("GPU failed");
      },
    });
    runtime.wake(activation(0));
    now += 16;
    callbacks.forEach((callback) => callback(now));
    expect(runtime.getState()).toBe("sleeping");
    expect(runtime.getPendingFrameCount()).toBe(0);
  });
});
