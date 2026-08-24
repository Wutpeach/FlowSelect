import {
  advanceAvatarPlayback,
  applyAmbientMotion,
  bodyFromDefinition,
  createAvatarPlaybackState,
  pauseAvatarPlayback,
  playAvatarAnimation,
  poseFromExpression,
  renderAvatar,
  resumeAvatarPlayback,
  sampleAvatarFrame,
  type AvatarPlaybackState,
  type AvatarScene,
} from "@bible-strong/avatar-core";
import type { CompactMascotAttentionOffset } from "./compactMascotRecipe";
import {
  COMPACT_MASCOT_ACTIONS,
  COMPACT_MASCOT_BASELINE_ANIMATION,
  COMPACT_MASCOT_DEFINITION,
} from "./compactMascotDefinition";

export const COMPACT_MASCOT_QUIET_MIN_MS = 18_000;
export const COMPACT_MASCOT_QUIET_MAX_MS = 32_000;
export type CompactMascotSceneColors = { body: string; eyes: string };
export type CompactMascotFrameScheduler = { schedule: (callback: (now: number) => void) => number; cancel: (handle: number) => void };
export type CompactMascotBehaviorRuntime = {
  start: () => void; pause: () => void; renderStatic: () => void; dispose: () => void;
  isRunning: () => boolean; getPendingFrameCount: () => number; getCurrentAction: () => string | null; getNextActionAt: () => number | null;
};

const BODY = bodyFromDefinition(COMPACT_MASCOT_DEFINITION.body);

export const renderCompactMascotScene = (playback: Readonly<AvatarPlaybackState>, now: number, reducedMotion: boolean, eyeOffset: CompactMascotAttentionOffset, colors: CompactMascotSceneColors, random: () => number): AvatarScene => {
  const frame = sampleAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random, reduceMotion: reducedMotion });
  const pose = poseFromExpression(reducedMotion ? frame.expression : applyAmbientMotion(frame.expression, frame.sampledAt));
  const scene = renderAvatar(pose, BODY.primary, reducedMotion ? 1 : frame.blink, { bodyNodes: [], eyeOffset });
  const earGeometry = renderAvatar(
    pose,
    BODY.primary,
    reducedMotion ? 1 : frame.blink,
    { bodyNodes: BODY.nodes },
  );
  return {
    geometry: {
      ...scene,
      backPaths: earGeometry.backPaths,
      backNodeIds: earGeometry.backNodeIds,
      frontPaths: earGeometry.frontPaths,
      frontNodeIds: earGeometry.frontNodeIds,
    },
    colors,
  };
};

export const createCompactMascotBehaviorRuntime = (dependencies: {
  scheduler: CompactMascotFrameScheduler; now: () => number; random: () => number; colors: CompactMascotSceneColors;
  getAttentionOffset: (reducedMotion: boolean) => CompactMascotAttentionOffset; onScene: (scene: AvatarScene) => void;
}): CompactMascotBehaviorRuntime => {
  const beginBaseline = (now: number, from?: ReturnType<typeof sampleAvatarFrame>) => {
    const result = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, COMPACT_MASCOT_BASELINE_ANIMATION, now, from);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  let playback = beginBaseline(dependencies.now());
  let pendingFrame: number | null = null;
  let nextActionAt: number | null = null;
  let remainingDeadline: number | null = null;
  let currentAction: string | null = null;
  let lastAction: string | null = null;
  let running = false;
  let paused = false;
  let disposed = false;
  let generation = 0;

  const armDeadline = (now: number) => { nextActionAt = now + COMPACT_MASCOT_QUIET_MIN_MS + dependencies.random() * (COMPACT_MASCOT_QUIET_MAX_MS - COMPACT_MASCOT_QUIET_MIN_MS); };
  const render = (now: number, reducedMotion: boolean) => dependencies.onScene(renderCompactMascotScene(playback, now, reducedMotion, dependencies.getAttentionOffset(reducedMotion), dependencies.colors, dependencies.random));
  const chooseAction = () => {
    const choices = COMPACT_MASCOT_ACTIONS.filter((key) => key !== lastAction);
    return choices[Math.min(choices.length - 1, Math.floor(dependencies.random() * choices.length))];
  };
  const tick = (now: number) => {
    playback = advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, playback, now, { random: dependencies.random });
    if (currentAction !== null && playback.status === "stopped") {
      lastAction = currentAction;
      currentAction = null;
      playback = beginBaseline(now, sampleAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random: dependencies.random }));
      armDeadline(now);
    }
    if (currentAction === null && nextActionAt !== null && now >= nextActionAt) {
      currentAction = chooseAction();
      const result = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, currentAction, now, sampleAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random: dependencies.random }));
      if (!result.ok) throw new Error(result.error.message);
      playback = result.value;
      nextActionAt = null;
    }
    render(now, false);
  };
  const schedule = () => {
    if (disposed || !running || pendingFrame !== null) return;
    const localGeneration = generation;
    pendingFrame = dependencies.scheduler.schedule((now) => {
      pendingFrame = null;
      if (disposed || !running || generation !== localGeneration) return;
      tick(now); schedule();
    });
  };
  const stop = () => { running = false; generation += 1; if (pendingFrame !== null) dependencies.scheduler.cancel(pendingFrame); pendingFrame = null; };
  return {
    start: () => {
      if (disposed || running) return;
      const now = dependencies.now();
      if (paused) { playback = resumeAvatarPlayback(playback, now); if (remainingDeadline !== null) nextActionAt = now + remainingDeadline; paused = false; }
      if (nextActionAt === null && currentAction === null) armDeadline(now);
      running = true; tick(now); schedule();
    },
    pause: () => {
      if (disposed || paused) return;
      const now = dependencies.now(); playback = pauseAvatarPlayback(playback, now);
      remainingDeadline = nextActionAt === null ? null : Math.max(0, nextActionAt - now); nextActionAt = null; paused = true; stop();
    },
    renderStatic: () => { if (!disposed) { stop(); playback = beginBaseline(dependencies.now()); currentAction = null; lastAction = null; nextActionAt = null; remainingDeadline = null; dependencies.onScene(renderCompactMascotScene(createAvatarPlaybackState(), dependencies.now(), true, dependencies.getAttentionOffset(true), dependencies.colors, dependencies.random)); } },
    dispose: () => { if (!disposed) { stop(); disposed = true; nextActionAt = null; remainingDeadline = null; currentAction = null; } },
    isRunning: () => running,
    getPendingFrameCount: () => pendingFrame === null ? 0 : 1,
    getCurrentAction: () => currentAction,
    getNextActionAt: () => nextActionAt,
  };
};
