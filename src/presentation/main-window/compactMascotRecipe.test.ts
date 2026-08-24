import { describe, expect, it } from "vitest";
import {
  COMPACT_MASCOT_ATTENTION_DEAD_ZONE,
  COMPACT_MASCOT_ATTENTION_PEAK_DISTANCE,
  COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS,
  COMPACT_MASCOT_EYE_MAX_X,
  COMPACT_MASCOT_EYE_MAX_X_REDUCED,
  COMPACT_MASCOT_EYE_MAX_Y,
  COMPACT_MASCOT_EYE_MAX_Y_REDUCED,
  COMPACT_MASCOT_RENDER_SCALE,
  COMPACT_MASCOT_VIEWBOX,
  COMPACT_MASCOT_VISUAL_SIZE,
  NEUTRAL_COMPACT_MASCOT_ATTENTION,
  resolveCompactMascotAttention,
} from "./compactMascotRecipe";

const CENTER = { x: 40, y: 40 };

describe("Compact Kirby cat geometry and attention", () => {
  it("keeps the official 300 viewBox inside the production 56px visual leaf", () => {
    expect(COMPACT_MASCOT_VIEWBOX).toBe(300);
    expect(COMPACT_MASCOT_VISUAL_SIZE).toBe(56);
    expect(COMPACT_MASCOT_VISUAL_SIZE).toBeLessThanOrEqual(60);
    expect(COMPACT_MASCOT_RENDER_SCALE).toBe(0.95);
  });

  it("returns neutral for invalid, center, dead-zone, and outer points", () => {
    expect(resolveCompactMascotAttention({ x: Number.NaN, y: 40 }, CENTER, false))
      .toEqual(NEUTRAL_COMPACT_MASCOT_ATTENTION);
    expect(resolveCompactMascotAttention(CENTER, CENTER, false))
      .toEqual(NEUTRAL_COMPACT_MASCOT_ATTENTION);
    expect(resolveCompactMascotAttention(
      { x: CENTER.x + COMPACT_MASCOT_ATTENTION_DEAD_ZONE / 2, y: CENTER.y },
      CENTER,
      false,
    )).toEqual(NEUTRAL_COMPACT_MASCOT_ATTENTION);
    expect(resolveCompactMascotAttention(
      { x: CENTER.x + COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS, y: CENTER.y },
      CENTER,
      false,
    )).toEqual(NEUTRAL_COMPACT_MASCOT_ATTENTION);
  });

  it("peaks in the existing compact hotspot approach band", () => {
    expect(COMPACT_MASCOT_ATTENTION_PEAK_DISTANCE).toBeGreaterThanOrEqual(19);
    expect(COMPACT_MASCOT_ATTENTION_PEAK_DISTANCE).toBeLessThanOrEqual(26);
    expect(resolveCompactMascotAttention(
      { x: CENTER.x + COMPACT_MASCOT_ATTENTION_PEAK_DISTANCE, y: CENTER.y },
      CENTER,
      false,
    )).toEqual({ x: COMPACT_MASCOT_EYE_MAX_X, y: 0 });
  });

  it("bounds diagonal response and uses smaller direct Reduced Motion offsets", () => {
    const point = { x: CENTER.x + 20, y: CENTER.y - 20 };
    const normal = resolveCompactMascotAttention(point, CENTER, false);
    const reduced = resolveCompactMascotAttention(point, CENTER, true);
    expect(normal.x).toBeGreaterThan(0);
    expect(normal.y).toBeLessThan(0);
    expect(Math.abs(normal.x)).toBeLessThanOrEqual(COMPACT_MASCOT_EYE_MAX_X);
    expect(Math.abs(normal.y)).toBeLessThanOrEqual(COMPACT_MASCOT_EYE_MAX_Y);
    expect(Math.abs(reduced.x)).toBeLessThan(Math.abs(normal.x));
    expect(Math.abs(reduced.y)).toBeLessThan(Math.abs(normal.y));
    expect(Math.abs(reduced.x)).toBeLessThanOrEqual(COMPACT_MASCOT_EYE_MAX_X_REDUCED);
    expect(Math.abs(reduced.y)).toBeLessThanOrEqual(COMPACT_MASCOT_EYE_MAX_Y_REDUCED);
  });

  it("responds before Windows hotspot entry from cardinal and diagonal approach points", () => {
    const cardinal = resolveCompactMascotAttention({ x: 6, y: 40 }, CENTER, false);
    const diagonal = resolveCompactMascotAttention({ x: 12, y: 12 }, CENTER, false);
    expect(cardinal.x).toBeLessThan(0);
    expect(cardinal.y).toBe(0);
    expect(diagonal.x).toBeLessThan(0);
    expect(diagonal.y).toBeLessThan(0);
  });
});
