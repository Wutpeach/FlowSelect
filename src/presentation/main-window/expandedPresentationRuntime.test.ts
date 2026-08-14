import { describe, expect, it, vi } from "vitest";
import {
  createExpandedPresentationRuntime,
  type ExpandedPresentationFrame,
  type ExpandedPresentationInputs,
} from "./expandedPresentationRuntime";

const idle = (reducedMotion = false): ExpandedPresentationInputs => ({
  target: { kind: "idle" },
  reducedMotion,
});

const progress = (
  traceId: string,
  target: number,
  reducedMotion = false,
): ExpandedPresentationInputs => ({
  target: {
    kind: "progress",
    progress: { kind: "determinate", traceId, target },
  },
  reducedMotion,
});

const createHarness = () => {
  let now = 0;
  let nextHandle = 1;
  const callbacks = new Map<number, (time: number) => void>();
  const frames: ExpandedPresentationFrame[] = [];
  const render = vi.fn((frame: ExpandedPresentationFrame) => frames.push(frame));
  const runtime = createExpandedPresentationRuntime({
    now: () => now,
    scheduleFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => callbacks.delete(handle),
    render,
  });
  return {
    runtime,
    frames,
    render,
    pending: () => callbacks.size,
    step: (delta = 16) => {
      now += delta;
      const current = [...callbacks.values()];
      callbacks.clear();
      current.forEach((callback) => callback(now));
    },
    capturePending: () => [...callbacks.values()],
  };
};

describe("Expanded Presentation runtime", () => {
  it("draws idle once on wake and leaves no frame work", () => {
    const harness = createHarness();
    harness.runtime.wake(idle());
    expect(harness.frames).toHaveLength(1);
    expect(harness.pending()).toBe(0);
  });

  it("converges upward toward the latest same-trace target with one frame", () => {
    const harness = createHarness();
    harness.runtime.wake(progress("a", 0.2));
    harness.runtime.setInputs(progress("a", 0.6));
    harness.runtime.setInputs(progress("a", 0.8));
    expect(harness.runtime.getProgressLevel()).toBe(0.2);
    expect(harness.runtime.getProgressTarget()).toEqual({
      kind: "determinate",
      traceId: "a",
      target: 0.8,
    });
    expect(harness.pending()).toBe(1);
    harness.step(50);
    expect(harness.runtime.getProgressLevel()).toBeGreaterThan(0.2);
    expect(harness.pending()).toBe(1);
  });

  it("applies downward revisions and replacement traces immediately", () => {
    const harness = createHarness();
    harness.runtime.wake(progress("old", 0.8));
    harness.runtime.setInputs(progress("old", 0.35));
    expect(harness.runtime.getProgressLevel()).toBe(0.35);
    harness.runtime.setInputs(progress("new", 0.12));
    expect(harness.runtime.getProgressLevel()).toBe(0.12);
    expect(harness.pending()).toBe(0);
  });

  it("keeps indeterminate evolution bounded and stops it for Reduced Motion", () => {
    const harness = createHarness();
    harness.runtime.wake({
      target: {
        kind: "progress",
        progress: { kind: "indeterminate", traceId: "a" },
      },
      reducedMotion: false,
    });
    expect(harness.pending()).toBe(1);
    harness.step();
    expect(harness.pending()).toBe(1);
    harness.runtime.setInputs({
      target: {
        kind: "progress",
        progress: { kind: "indeterminate", traceId: "a" },
      },
      reducedMotion: true,
    });
    expect(harness.pending()).toBe(0);
    expect(harness.frames[harness.frames.length - 1]?.reducedMotion).toBe(true);
  });

  it.each(["success", "failure", "cancelled"] as const)(
    "renders resolved terminal %s without taking retention ownership",
    (status) => {
      const harness = createHarness();
      harness.runtime.wake({
        target: { kind: "terminal", status },
        reducedMotion: false,
      });
      expect(harness.runtime.getTarget()).toEqual({ kind: "terminal", status });
      expect(harness.pending()).toBe(0);
      harness.runtime.setInputs(idle());
      expect(harness.runtime.getTarget()).toEqual({ kind: "idle" });
    },
  );

  it("renders normal Intake with one continuous frame and Reduced Motion statically", () => {
    const harness = createHarness();
    harness.runtime.wake({
      target: {
        kind: "intake",
        opportunityId: 1,
        traceId: "accepted",
        progress: { kind: "indeterminate", traceId: "current" },
      },
      reducedMotion: false,
    });
    expect(harness.runtime.getTarget().kind).toBe("intake");
    expect(harness.pending()).toBe(1);
    harness.runtime.setInputs({
      target: {
        kind: "intake",
        opportunityId: 2,
        traceId: "latest",
        progress: { kind: "idle" },
      },
      reducedMotion: true,
    });
    expect(harness.runtime.getTarget()).toMatchObject({
      kind: "intake",
      opportunityId: 2,
      traceId: "latest",
    });
    expect(harness.pending()).toBe(0);
  });

  it("returns from Intake to the current Progress target rather than an old snapshot", () => {
    const harness = createHarness();
    harness.runtime.wake({
      target: {
        kind: "intake",
        opportunityId: 1,
        traceId: "accepted",
        progress: { kind: "determinate", traceId: "current", target: 0.2 },
      },
      reducedMotion: false,
    });
    harness.runtime.setInputs({
      target: {
        kind: "intake",
        opportunityId: 1,
        traceId: "accepted",
        progress: { kind: "determinate", traceId: "current", target: 0.65 },
      },
      reducedMotion: false,
    });
    harness.runtime.setInputs(progress("current", 0.65));

    expect(harness.runtime.getTarget()).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: "current", target: 0.65 },
    });
    expect(harness.runtime.getProgressTarget()).toEqual({
      kind: "determinate",
      traceId: "current",
      target: 0.65,
    });
  });

  it("reconstructs from current inputs after sleep and ignores stale generations", () => {
    const harness = createHarness();
    harness.runtime.wake({
      target: {
        kind: "progress",
        progress: { kind: "indeterminate", traceId: "old" },
      },
      reducedMotion: false,
    });
    const [staleFrame] = harness.capturePending();
    harness.runtime.sleep();
    harness.runtime.wake(progress("new", 0.42));
    const renderCount = harness.render.mock.calls.length;
    staleFrame?.(100);
    expect(harness.render).toHaveBeenCalledTimes(renderCount);
    expect(harness.runtime.getProgressLevel()).toBe(0.42);
    expect(harness.pending()).toBe(0);
  });

  it("dispose is permanent and decorative render failure fails closed", () => {
    const harness = createHarness();
    harness.runtime.wake({
      target: {
        kind: "progress",
        progress: { kind: "indeterminate", traceId: "a" },
      },
      reducedMotion: false,
    });
    harness.runtime.dispose();
    harness.runtime.wake(idle());
    expect(harness.runtime.getState()).toBe("disposed");
    expect(harness.pending()).toBe(0);

    const failing = createExpandedPresentationRuntime({
      now: () => 0,
      scheduleFrame: () => 1,
      cancelFrame: vi.fn(),
      render: () => {
        throw new Error("context unavailable");
      },
    });
    expect(() => failing.wake(idle())).not.toThrow();
    expect(failing.getState()).toBe("sleeping");
    expect(failing.getPendingFrameCount()).toBe(0);
  });
});
