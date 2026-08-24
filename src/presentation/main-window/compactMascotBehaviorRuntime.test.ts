import {
  advanceAvatarPlayback,
  playAvatarAnimation,
  renderAvatarDefinition,
  renderAvatarFrame,
  sampleAvatarFrame,
  type AvatarPlaybackState,
} from "@bible-strong/avatar-core";
import { describe, expect, it } from "vitest";
import {
  createCompactMascotBehaviorRuntime,
  renderCompactMascotScene,
  type CompactMascotFrameScheduler,
} from "./compactMascotBehaviorRuntime";
import {
  COMPACT_MASCOT_ACTIONS,
  COMPACT_MASCOT_DEFINITION,
} from "./compactMascotDefinition";
import { COMPACT_MASCOT_RENDER_SCALE } from "./compactMascotRecipe";

const pathBounds = (path: string) => {
  const values = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
  return { minX: Math.min(...points.map(([x]) => x)), maxX: Math.max(...points.map(([x]) => x)), minY: Math.min(...points.map(([, y]) => y)), maxY: Math.max(...points.map(([, y]) => y)) };
};

const createHarness = (cancelWorks = true) => {
  const frames = new Map<number, (now: number) => void>(); let id = 1; let now = 0; const scenes: unknown[] = [];
  let attention = { x: 4, y: -2 };
  const scheduler: CompactMascotFrameScheduler = { schedule: (callback) => { const handle = id++; frames.set(handle, callback); return handle; }, cancel: (handle) => { if (cancelWorks) frames.delete(handle); } };
  const runtime = createCompactMascotBehaviorRuntime({ scheduler, now: () => now, random: () => 0, colors: { body: "#ffc2e9", eyes: "#3e4e65" }, getAttentionOffset: (reduced) => reduced ? { x: 2, y: -1 } : attention, onScene: (scene) => scenes.push(scene) });
  return { runtime, scenes, setAttention: (next: { x: number; y: number }) => { attention = next; }, setNow: (value: number) => { now = value; }, pending: () => frames.size, fire: (at: number) => { const handle = [...frames.keys()][0]; const callback = frames.get(handle); if (!callback) throw new Error("no pending frame"); frames.delete(handle); callback(at); } };
};

describe("Compact mascot behavior runtime", () => {
  it("uses the same full current-pose core paths as the head through retained actions", () => {
    const colors = { body: "#ffc2e9", eyes: "#3e4e65" };
    const render = (playback: Readonly<AvatarPlaybackState>, now: number) => renderCompactMascotScene(playback, now, false, { x: 0, y: 0 }, colors, () => 0);
    const neutral = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, "idle", 0);
    if (!neutral.ok) throw new Error(neutral.error.message);
    const neutralEarPaths = render(neutral.value, 0).geometry.backPaths;
    expect(neutralEarPaths).toHaveLength(2);
    const actionEarPaths: string[][] = [];

    for (const key of COMPACT_MASCOT_ACTIONS) {
      const started = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, key, 0);
      if (!started.ok) throw new Error(started.error.message);
      for (const now of [0, 250, 500, 2_299, 2_300, 2_550, 2_800, 5_099, 5_100, 5_350, 5_599]) {
        const playback = advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, started.value, now, { random: () => 0 });
        const geometry = render(playback, now).geometry;
        const ears = [...geometry.backPaths, ...geometry.frontPaths];
        expect(ears).toHaveLength(2);
        const coreGeometry = renderAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random: () => 0 }).geometry;
        expect(geometry.headPath).toBe(coreGeometry.headPath);
        expect(geometry.leftPath).toBe(coreGeometry.leftPath);
        expect(geometry.rightPath).toBe(coreGeometry.rightPath);
        expect(ears).toEqual([...coreGeometry.backPaths, ...coreGeometry.frontPaths]);
        actionEarPaths.push(ears);
      }
    }
    expect(actionEarPaths.some((ears) => ears.join("") !== neutralEarPaths.join(""))).toBe(true);
  });

  it("keeps every retained current-pose ear frame inside the unchanged 60px shell", () => {
    const shellLimit = 150 * 60 / 56;
    const assertShell = (paths: readonly string[]) => {
      const extent = Math.max(...paths.flatMap((path) => Object.values(pathBounds(path)).map(Math.abs)));
      expect(extent * COMPACT_MASCOT_RENDER_SCALE).toBeLessThanOrEqual(shellLimit);
    };
    const neutral = renderAvatarDefinition(COMPACT_MASCOT_DEFINITION).geometry;
    assertShell([...neutral.backPaths, ...neutral.frontPaths]);
    for (const key of ["idle", ...COMPACT_MASCOT_ACTIONS]) {
      const started = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, key, 0);
      if (!started.ok) throw new Error(started.error.message);
      for (const now of [800, 3050, 3700]) {
        const playback = advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, started.value, now, { random: () => 0.45 });
        const geometry = renderAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random: () => 0.45 }).geometry;
        assertShell([...geometry.backPaths, ...geometry.frontPaths]);
      }
    }
  });

  it("renders curious-short's distinct upstream poses through the same current-pose core path", () => {
    const started = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, "curious-short", 0);
    if (!started.ok) throw new Error(started.error.message);
    const render = (now: number) => {
      const playback = advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, started.value, now, { random: () => 0.45 });
      const direct = renderAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random: () => 0.45 }).geometry;
      const displayed = renderCompactMascotScene(playback, now, false, { x: 0, y: 0 }, { body: "#ffc2e9", eyes: "#3e4e65" }, () => 0.45).geometry;
      return { direct, displayed };
    };
    const firstHold = render(800);
    const secondHold = render(3_700);
    const firstFrame = sampleAvatarFrame(COMPACT_MASCOT_DEFINITION, advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, started.value, 800, { random: () => 0.45 }), 800, { random: () => 0.45 });
    const secondFrame = sampleAvatarFrame(COMPACT_MASCOT_DEFINITION, advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, started.value, 3_700, { random: () => 0.45 }), 3_700, { random: () => 0.45 });
    expect([firstFrame.expression.headX, firstFrame.expression.headY, firstFrame.expression.headZ]).toEqual([7.3, 27.8, -16.1]);
    expect([secondFrame.expression.headX, secondFrame.expression.headY, secondFrame.expression.headZ]).toEqual([0.319140625, 35.307421875, -10.904296875]);
    expect(firstFrame.expression.perspective).toBe(secondFrame.expression.perspective);
    expect([...firstHold.direct.backPaths, ...firstHold.direct.frontPaths]).not.toEqual([...secondHold.direct.backPaths, ...secondHold.direct.frontPaths]);
    for (const frame of [firstHold, secondHold]) {
      expect(frame.displayed.headPath).toBe(frame.direct.headPath);
      expect(frame.displayed.leftPath).toBe(frame.direct.leftPath);
      expect(frame.displayed.rightPath).toBe(frame.direct.rightPath);
      expect([...frame.displayed.backPaths, ...frame.displayed.frontPaths]).toEqual([...frame.direct.backPaths, ...frame.direct.frontPaths]);
    }
  });

  it("owns one frame and starts an action only after its rAF-clock deadline", () => {
    const h = createHarness(); h.runtime.start(); expect(h.runtime.getPendingFrameCount()).toBe(1); expect(h.runtime.getCurrentAction()).toBeNull();
    h.fire(17_999); expect(h.runtime.getCurrentAction()).toBeNull(); h.fire(18_000); expect(h.runtime.getCurrentAction()).toBe("surprised"); expect(h.runtime.getPendingFrameCount()).toBe(1);
  });
  it("returns naturally to baseline, arms a new deadline, and avoids immediate repeats", () => {
    const h = createHarness(); h.runtime.start(); h.fire(18_000); const first = h.runtime.getCurrentAction(); h.fire(24_000); expect(h.runtime.getCurrentAction()).toBeNull(); expect(h.runtime.getNextActionAt()).toBe(42_000); h.fire(42_000); expect(h.runtime.getCurrentAction()).not.toBe(first);
  });
  it("pauses the playback and deadline budget exactly, then resumes", () => {
    const h = createHarness(); h.runtime.start(); h.setNow(10_000); h.runtime.pause(); expect(h.runtime.getPendingFrameCount()).toBe(0); h.setNow(110_000); h.runtime.start(); h.fire(117_999); expect(h.runtime.getCurrentAction()).toBeNull(); h.fire(118_000); expect(h.runtime.getCurrentAction()).not.toBeNull();
  });
  it("keeps pointer attention active during an action and freezes an active action while hidden", () => {
    const h = createHarness(); h.runtime.start(); h.fire(18_000); const before = h.scenes[h.scenes.length - 1] as { geometry: { leftPath: string } };
    h.setAttention({ x: 11, y: -3 }); h.fire(18_016); const after = h.scenes[h.scenes.length - 1] as { geometry: { leftPath: string } };
    expect(h.runtime.getCurrentAction()).toBe("surprised"); expect(after.geometry.leftPath).not.toBe(before.geometry.leftPath);
    h.setNow(19_000); h.runtime.pause(); h.setNow(100_000); h.runtime.start(); h.fire(104_500); expect(h.runtime.getCurrentAction()).toBe("surprised");
  });
  it("uses static open eyes with no decorative frame and invalidates stale callbacks", () => {
    const h = createHarness(false); h.runtime.start(); h.runtime.renderStatic(); expect(h.runtime.getPendingFrameCount()).toBe(0); expect(h.runtime.isRunning()).toBe(false); const rendered = h.scenes.length; h.fire(16); expect(h.scenes).toHaveLength(rendered); h.runtime.start(); h.fire(17_999); expect(h.runtime.getCurrentAction()).toBeNull(); h.runtime.dispose(); h.runtime.start(); expect(h.runtime.isRunning()).toBe(false);
  });
});
