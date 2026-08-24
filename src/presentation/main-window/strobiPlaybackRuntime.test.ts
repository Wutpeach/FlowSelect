import { describe, expect, it } from "vitest";
import {
  createStrobiPlaybackRuntime,
  type StrobiFrameScheduler,
} from "./strobiPlaybackRuntime";

const createFakeScheduler = (cancelWorks = true) => {
  const frames = new Map<number, (now: number) => void>();
  let nextHandle = 1;
  const scheduler: StrobiFrameScheduler = {
    schedule: (callback) => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      if (cancelWorks) {
        frames.delete(handle);
      }
    },
  };
  return {
    scheduler,
    pendingCount: () => frames.size,
    fire: (now: number) => {
      const handle = [...frames.keys()].sort((left, right) => left - right)[0];
      const callback = frames.get(handle);
      if (callback === undefined) {
        throw new Error("no pending frame");
      }
      frames.delete(handle);
      callback(now);
    },
  };
};

const createHarness = (cancelWorks = true) => {
  const scheduler = createFakeScheduler(cancelWorks);
  const scenes: unknown[] = [];
  let now = 0;
  const runtime = createStrobiPlaybackRuntime({
    scheduler: scheduler.scheduler,
    now: () => now,
    random: () => 0.5,
    colors: { body: "#5b7fe5", eyes: "#111316" },
    getAttentionOffset: (reduced) => reduced ? { x: 2, y: -1 } : { x: 4, y: -2 },
    onScene: (scene) => scenes.push(scene),
  });
  return {
    runtime,
    scheduler,
    scenes,
    setNow: (value: number) => {
      now = value;
    },
  };
};

describe("Strobi playback runtime", () => {
  it("owns exactly one disposable animation frame while running", () => {
    const harness = createHarness();
    harness.runtime.start();
    expect(harness.runtime.isRunning()).toBe(true);
    expect(harness.runtime.getPendingFrameCount()).toBe(1);
    expect(harness.scheduler.pendingCount()).toBe(1);
    expect(harness.scenes).toHaveLength(1);
    harness.scheduler.fire(16);
    expect(harness.runtime.getPendingFrameCount()).toBe(1);
    expect(harness.scheduler.pendingCount()).toBe(1);
    expect(harness.scenes).toHaveLength(2);
  });

  it("pauses without frame work and resumes the same runtime", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setNow(100);
    harness.runtime.pause();
    expect(harness.runtime.isRunning()).toBe(false);
    expect(harness.runtime.getPendingFrameCount()).toBe(0);
    expect(harness.scheduler.pendingCount()).toBe(0);
    harness.setNow(1_000);
    harness.runtime.start();
    expect(harness.runtime.isRunning()).toBe(true);
    expect(harness.scheduler.pendingCount()).toBe(1);
  });

  it("can mount paused while the document is already hidden", () => {
    const harness = createHarness();
    harness.runtime.pause();
    expect(harness.runtime.isRunning()).toBe(false);
    expect(harness.scheduler.pendingCount()).toBe(0);
    expect(harness.scenes).toHaveLength(0);
    harness.setNow(1_000);
    harness.runtime.start();
    expect(harness.runtime.isRunning()).toBe(true);
    expect(harness.scheduler.pendingCount()).toBe(1);
    expect(harness.scenes).toHaveLength(1);
  });

  it("renders Reduced Motion directly with no timer or animation frame", () => {
    const harness = createHarness();
    harness.runtime.renderStatic();
    expect(harness.scenes).toHaveLength(1);
    expect(harness.runtime.isRunning()).toBe(false);
    expect(harness.runtime.getPendingFrameCount()).toBe(0);
    expect(harness.scheduler.pendingCount()).toBe(0);
  });

  it("rejects stale queued callbacks after dispose", () => {
    const harness = createHarness(false);
    harness.runtime.start();
    harness.runtime.dispose();
    expect(harness.runtime.isRunning()).toBe(false);
    expect(harness.runtime.getPendingFrameCount()).toBe(0);
    harness.scheduler.fire(16);
    expect(harness.scenes).toHaveLength(1);
    expect(harness.scheduler.pendingCount()).toBe(0);
  });
});
