import { describe, expect, it, vi } from "vitest";
import {
  ACTIVATION_DURATION_MS,
  createExpandedPresentationRuntime,
  type ExpandedPresentationFrame,
} from "../presentation/main-window/expandedPresentationRuntime";
import {
  LAB_REPLACEMENT_TRACE_ID_PREFIX,
  composeLabInput,
  createLabPresentationState,
  reduceLabPresentation,
} from "./scenarios";

/**
 * Proves the Lab's synthetic scenarios drive the EXISTING production
 * expandedPresentationRuntime (the exact module the production
 * ExpandedPresentationSurface creates) with the exact composed
 * ExpandedPresentationTarget inputs. Downward revision, replacement-trace
 * reset, indeterminate honesty, and bounded activation frames are production
 * runtime semantics, not Lab-side animation.
 */
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
  };
};

describe("Lab scenarios -> production runtime semantics", () => {
  it("wakes the production runtime with a Lab progress preset", () => {
    const harness = createHarness();
    const state = reduceLabPresentation(
      createLabPresentationState(),
      { type: "progressPreset", presetId: "progress-25" },
    );
    harness.runtime.wake(composeLabInput(state));
    expect(harness.runtime.getProgressLevel()).toBe(0.25);
    expect(harness.runtime.getProgressTarget()).toEqual({
      kind: "determinate",
      traceId: "lab-primary-trace",
      target: 0.25,
    });
    expect(harness.pending()).toBe(0);
  });

  it("converges upward through the production runtime and never overshoots", () => {
    const harness = createHarness();
    harness.runtime.wake(composeLabInput(createLabPresentationState()));
    const upward = reduceLabPresentation(
      createLabPresentationState(),
      { type: "progressTarget", target: 0.9 },
    );
    harness.runtime.setInputs(composeLabInput(upward));
    expect(harness.pending()).toBe(1);
    for (let i = 0; i < 20 && harness.pending() > 0; i += 1) {
      harness.step(100);
      expect(harness.runtime.getProgressLevel()).toBeLessThanOrEqual(0.9);
      expect(harness.pending()).toBeLessThanOrEqual(1);
    }
    expect(harness.runtime.getProgressLevel()).toBe(0.9);
    expect(harness.pending()).toBe(0);
  });

  it("same-trace downward revision snaps immediately via production semantics", () => {
    const harness = createHarness();
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-75" });
    harness.runtime.wake(composeLabInput(state));
    expect(harness.runtime.getProgressLevel()).toBe(0.75);
    state = reduceLabPresentation(state, { type: "downwardRevision" });
    harness.runtime.setInputs(composeLabInput(state));
    // No convergence: the production runtime applies the downward revision now.
    expect(harness.runtime.getProgressLevel()).toBe(0.25);
  });

  it("replacement trace resets quantitative state through production semantics", () => {
    const harness = createHarness();
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-75" });
    harness.runtime.wake(composeLabInput(state));
    expect(harness.runtime.getProgressLevel()).toBe(0.75);
    state = reduceLabPresentation(state, { type: "replaceTrace" });
    harness.runtime.setInputs(composeLabInput(state));
    expect(harness.runtime.getProgressTarget()).toEqual({
      kind: "determinate",
      traceId: `${LAB_REPLACEMENT_TRACE_ID_PREFIX}-1`,
      target: 0.5,
    });
    // New trace never inherits the old level (0.75): it starts at its own target.
    expect(harness.runtime.getProgressLevel()).toBe(0.5);
  });

  it("indeterminate keeps no numeric frontier through production semantics", () => {
    const harness = createHarness();
    const state = reduceLabPresentation(
      createLabPresentationState(),
      { type: "progressIndeterminate" },
    );
    harness.runtime.wake(composeLabInput(state));
    expect(harness.runtime.getProgressTarget()).toEqual({
      kind: "indeterminate",
      traceId: "lab-primary-trace",
    });
    expect(harness.runtime.getProgressLevel()).toBe(0);
    expect(harness.pending()).toBe(0);
  });

  it("runs one bounded activation frame chain then settles", () => {
    const harness = createHarness();
    const state = reduceLabPresentation(
      createLabPresentationState(),
      { type: "activate", presetId: "intake-center", now: 0 },
    );
    harness.runtime.wake(composeLabInput(state));
    expect(harness.pending()).toBe(1);
    harness.step(ACTIVATION_DURATION_MS + 1);
    expect(harness.pending()).toBe(0);
    expect(harness.runtime.getTarget()).toMatchObject({
      kind: "activation",
      source: "intake",
    });
  });

  it("renders one static reduced-motion activation snapshot with zero frames", () => {
    const harness = createHarness();
    const state = reduceLabPresentation(
      createLabPresentationState(),
      { type: "activate", presetId: "intake-reduced", now: 0 },
    );
    const input = composeLabInput(state);
    expect(input.reducedMotion).toBe(true);
    harness.runtime.wake(input);
    expect(harness.render).toHaveBeenCalledTimes(1);
    expect(harness.pending()).toBe(0);
  });

  it("converges the activation progress underlay during the bounded phase", () => {
    const harness = createHarness();
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-25" });
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-center",
      now: 0,
    });
    harness.runtime.wake(composeLabInput(state));
    expect(harness.pending()).toBe(1);
    for (let i = 0; i < 8 && harness.pending() > 0; i += 1) {
      harness.step(100);
    }
    expect(harness.runtime.getProgressLevel()).toBe(0.25);
    harness.step(ACTIVATION_DURATION_MS);
    expect(harness.pending()).toBe(0);
  });
});
