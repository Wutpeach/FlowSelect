import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { playAvatarAnimation, advanceAvatarPlayback, renderAvatarDefinition, renderAvatarFrame } from "@bible-strong/avatar-core";
import { COMPACT_MASCOT_ACTIONS, COMPACT_MASCOT_DEFINITION } from "../../../../src/presentation/main-window/compactMascotDefinition.ts";
import { COMPACT_MASCOT_RENDER_SCALE } from "../../../../src/presentation/main-window/compactMascotRecipe.ts";
import { pathStats } from "./compact-mascot-evidence-core.mjs";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
const viewBox = 150;
const shell = 150 * 60 / 56;
const frame = 150 * 80 / 56;
const bounds = (paths) => {
  const values = paths.map(pathStats).map(({ bounds: value }) => value);
  return { minX: Math.min(...values.map((value) => value.minX)), maxX: Math.max(...values.map((value) => value.maxX)), minY: Math.min(...values.map((value) => value.minY)), maxY: Math.max(...values.map((value) => value.maxY)) };
};
const tip = (path) => {
  const values = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
  const minY = Math.min(...points.map(([, y]) => y));
  const xs = points.filter(([, y]) => y <= minY + 0.05).map(([x]) => x);
  return xs.reduce((total, x) => total + x, 0) / xs.length;
};
const limits = (value) => ({ viewBox: Math.max(...Object.values(value).map(Math.abs)) <= viewBox, shell: Math.max(...Object.values(value).map(Math.abs)) * COMPACT_MASCOT_RENDER_SCALE <= shell, frame: Math.max(...Object.values(value).map(Math.abs)) * COMPACT_MASCOT_RENDER_SCALE <= frame });
const actionScene = (key, timestampMs) => {
  const started = playAvatarAnimation(COMPACT_MASCOT_DEFINITION, key, 0);
  if (!started.ok) throw new Error(started.error.message);
  const playback = advanceAvatarPlayback(COMPACT_MASCOT_DEFINITION, started.value, timestampMs, { random: () => 0.45 });
  return renderAvatarFrame(COMPACT_MASCOT_DEFINITION, playback, timestampMs, { random: () => 0.45 });
};
const samples = [{ state: "neutral", timestampMs: 0, scene: renderAvatarDefinition(COMPACT_MASCOT_DEFINITION) }];
for (const [state, timestampMs] of [["idle expression-00 hold", 800], ["idle 00→08 midpoint", 5950], ["idle expression-08 hold", 6500]]) samples.push({ state, timestampMs, scene: actionScene("idle", timestampMs) });
for (const key of COMPACT_MASCOT_ACTIONS) for (const [phase, timestampMs] of [["first hold", 800], ["midpoint", 3050], ["second hold", 3700]]) samples.push({ state: `${key} ${phase}`, timestampMs, scene: actionScene(key, timestampMs) });
const matrix = samples.map(({ state, timestampMs, scene }) => {
  const earBounds = bounds([...scene.geometry.backPaths, ...scene.geometry.frontPaths]);
  return { state, timestampMs, earBounds, limits: limits(earBounds), layers: { back: scene.geometry.backPaths.length, front: scene.geometry.frontPaths.length } };
});
const neutralTips = samples[0].scene.geometry.backPaths.map(tip).sort((left, right) => left - right);
const neutralTipSpacing = neutralTips[1] - neutralTips[0];
writeFileSync(`${evidence}/compact-ear-clipping-matrix.json`, JSON.stringify({ pipeline: "direct avatar-core current-pose projection; no pointer input", thresholds: { viewBox: [-viewBox, viewBox], shell: [-shell, shell], frame: [-frame, frame], mascotSize: 56, renderScale: COMPACT_MASCOT_RENDER_SCALE }, bodyNodes: COMPACT_MASCOT_DEFINITION.body.nodes, neutralMetrics: { configuredCenterSpacingRatio: (COMPACT_MASCOT_DEFINITION.body.nodes[1].position[0] - COMPACT_MASCOT_DEFINITION.body.nodes[0].position[0]) / COMPACT_MASCOT_DEFINITION.body.primary.width, directTipSpacing: neutralTipSpacing, directTipSpacingRatio: neutralTipSpacing / COMPACT_MASCOT_DEFINITION.body.primary.width }, matrix }, null, 2));
