import { createHash } from "node:crypto";
import {
  advanceAvatarPlayback,
  playAvatarAnimation,
  renderAvatarFrame,
  sampleAvatarFrame,
} from "@bible-strong/avatar-core";
import {
  COMPACT_MASCOT_DEFINITION,
  KIRBY_SOURCE_BODY,
} from "../../../../src/presentation/main-window/compactMascotDefinition.ts";

export { COMPACT_MASCOT_DEFINITION, KIRBY_SOURCE_BODY };

export const actionFrame = (key, now) => {
  const started = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, key, 0);
  if (!started.ok) throw new Error(started.error.message);
  const playback = advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, started.value, now, { random: () => 0.45 });
  const frame = sampleAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random: () => 0.45 });
  return { playback, frame, scene: renderAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, now, { random: () => 0.45 }) };
};

export const headTuple = (frame) => [frame.expression.headX, frame.expression.headY, frame.expression.headZ];

export const pathStats = (path) => {
  const values = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
  return {
    hash: createHash("sha256").update(path).digest("hex").slice(0, 12),
    bounds: {
      minX: Number(Math.min(...points.map(([x]) => x)).toFixed(2)), maxX: Number(Math.max(...points.map(([x]) => x)).toFixed(2)),
      minY: Number(Math.min(...points.map(([, y]) => y)).toFixed(2)), maxY: Number(Math.max(...points.map(([, y]) => y)).toFixed(2)),
    },
    centroid: {
      x: Number((points.reduce((total, [x]) => total + x, 0) / points.length).toFixed(2)),
      y: Number((points.reduce((total, [, y]) => total + y, 0) / points.length).toFixed(2)),
    },
  };
};
