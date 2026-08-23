import {
  advanceAvatarPlayback,
  applyAmbientMotion,
  bodyFromDefinition,
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
  STROBI_DEFAULT_ANIMATION,
  STROBI_DEFINITION,
} from "./strobiDefinition";

export type StrobiSceneColors = { body: string; eyes: string };

export type StrobiFrameScheduler = {
  schedule: (callback: (now: number) => void) => number;
  cancel: (handle: number) => void;
};

export type StrobiPlaybackRuntime = {
  start: () => void;
  pause: () => void;
  renderStatic: () => void;
  dispose: () => void;
  isRunning: () => boolean;
  getPendingFrameCount: () => number;
};

const STROBI_BODY = bodyFromDefinition(STROBI_DEFINITION.body);
const POINTER_SMOOTHING_MS = 80;

export const createStrobiScene = (
  playback: Readonly<AvatarPlaybackState>,
  now: number,
  reducedMotion: boolean,
  eyeOffset: CompactMascotAttentionOffset,
  colors: StrobiSceneColors,
): AvatarScene => {
  const environment = { random: Math.random, reduceMotion: reducedMotion };
  const frame = sampleAvatarFrame(STROBI_DEFINITION, playback, now, environment);
  const expression = reducedMotion
    ? frame.expression
    : applyAmbientMotion(frame.expression, frame.sampledAt);
  return {
    geometry: renderAvatar(
      poseFromExpression(expression),
      STROBI_BODY.primary,
      reducedMotion ? 1 : frame.blink,
      {
        bodyNodes: STROBI_BODY.nodes,
        eyeOffset,
      },
    ),
    colors,
  };
};

export const createStrobiPlaybackRuntime = (dependencies: {
  scheduler: StrobiFrameScheduler;
  now: () => number;
  random: () => number;
  colors: StrobiSceneColors;
  getAttentionOffset: (reducedMotion: boolean) => CompactMascotAttentionOffset;
  onScene: (scene: AvatarScene) => void;
}): StrobiPlaybackRuntime => {
  const initialNow = dependencies.now();
  const initial = playAvatarAnimation(
    STROBI_DEFINITION,
    STROBI_DEFAULT_ANIMATION,
    initialNow,
  );
  if (!initial.ok) {
    throw new Error(initial.error.message);
  }

  let playback = initial.value;
  let pendingFrame: number | null = null;
  let running = false;
  let paused = false;
  let disposed = false;
  let generation = 0;
  let lastFrameAt = initialNow;
  let smoothedAttention = { x: 0, y: 0 };

  const render = (now: number, reducedMotion: boolean) => {
    if (!reducedMotion) {
      playback = advanceAvatarPlayback(STROBI_DEFINITION, playback, now, {
        random: dependencies.random,
        reduceMotion: false,
      });
    }

    const targetAttention = dependencies.getAttentionOffset(reducedMotion);
    if (reducedMotion) {
      smoothedAttention = targetAttention;
    } else {
      const elapsed = Math.max(0, now - lastFrameAt);
      const mix = 1 - Math.exp(-elapsed / POINTER_SMOOTHING_MS);
      smoothedAttention = {
        x: smoothedAttention.x + (targetAttention.x - smoothedAttention.x) * mix,
        y: smoothedAttention.y + (targetAttention.y - smoothedAttention.y) * mix,
      };
    }
    lastFrameAt = now;
    dependencies.onScene(createStrobiScene(
      playback,
      now,
      reducedMotion,
      smoothedAttention,
      dependencies.colors,
    ));
  };

  const scheduleNext = () => {
    if (disposed || !running || pendingFrame !== null) {
      return;
    }
    const localGeneration = generation;
    pendingFrame = dependencies.scheduler.schedule((frameNow) => {
      pendingFrame = null;
      if (disposed || !running || generation !== localGeneration) {
        return;
      }
      render(frameNow, false);
      scheduleNext();
    });
  };

  const stopFrames = () => {
    running = false;
    generation += 1;
    if (pendingFrame !== null) {
      dependencies.scheduler.cancel(pendingFrame);
      pendingFrame = null;
    }
  };

  return {
    start: () => {
      if (disposed || running) {
        return;
      }
      const now = dependencies.now();
      if (paused) {
        playback = resumeAvatarPlayback(playback, now);
        paused = false;
      }
      lastFrameAt = now;
      running = true;
      render(now, false);
      scheduleNext();
    },
    pause: () => {
      if (disposed || paused) {
        return;
      }
      playback = pauseAvatarPlayback(playback, dependencies.now());
      paused = true;
      stopFrames();
    },
    renderStatic: () => {
      if (disposed) {
        return;
      }
      stopFrames();
      render(dependencies.now(), true);
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      stopFrames();
      disposed = true;
    },
    isRunning: () => running,
    getPendingFrameCount: () => (pendingFrame === null ? 0 : 1),
  };
};
