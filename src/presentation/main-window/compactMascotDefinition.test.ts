import { describe, expect, it } from "vitest";
import { renderAvatarDefinition, validateAvatarDefinition } from "@bible-strong/avatar-core";
import { COMPACT_MASCOT_ACTIONS, COMPACT_MASCOT_DEFINITION, KIRBY_SOURCE_BODY, KIRBY_UPSTREAM_REVISION } from "./compactMascotDefinition";

describe("Pinned Kirby cat Compact definition", () => {
  it("preserves the pinned Kirby source facts and changes only its two nodes", () => {
    expect(KIRBY_UPSTREAM_REVISION).toBe("175691ab32cefe5faec7828af62f3d50210a8eb2");
    expect(KIRBY_SOURCE_BODY.primary).toEqual({ type: "sphere", width: 240, height: 240, depth: 240, roundness: 1 });
    expect(KIRBY_SOURCE_BODY.nodes).toHaveLength(2);
    expect(COMPACT_MASCOT_DEFINITION.body.nodes).toHaveLength(2);
    expect(COMPACT_MASCOT_DEFINITION.body.nodes.map((node) => node.surface.type)).toEqual(["diamond", "diamond"]);
    expect(COMPACT_MASCOT_DEFINITION.colors).toEqual({ body: "#ffc2e9", eyes: "#3e4e65" });
  });

  it("keeps the exact local once allowlist and source timings", () => {
    expect(COMPACT_MASCOT_ACTIONS).toEqual(["surprised", "curious-short", "playful-short"]);
    expect(COMPACT_MASCOT_DEFINITION.animations.idle.steps.map((step) => step.expression)).toEqual(["expression-00", "expression-08"]);
    for (const key of COMPACT_MASCOT_ACTIONS) {
      const animation = COMPACT_MASCOT_DEFINITION.animations[key];
      expect(animation.playbackMode).toBe("once");
      expect(animation.steps.every((step) => step.holdMs === 2300 && step.transitionMs === 500 && step.transition === "smooth")).toBe(true);
    }
  });

  it("preserves expression-15's pinned upstream head and eyes", () => {
    const expression15 = COMPACT_MASCOT_DEFINITION.expressions["expression-15"];
    expect(expression15.head).toEqual({ x: 0.319140625, y: 35.307421875, z: -10.904296875 });
    expect(expression15.eyes).toEqual({
      left: { width: 22.4609375, height: 39.820703125, x: 0, y: 0, angle: 0 },
      right: { width: 22.4609375, height: 39.820703125, x: 0, y: 0, angle: -0 },
      spacing: 53.9,
    });
  });

  it("validates and projects exactly two behind-head ear paths", () => {
    expect(validateAvatarDefinition(COMPACT_MASCOT_DEFINITION).ok).toBe(true);
    const scene = renderAvatarDefinition(COMPACT_MASCOT_DEFINITION);
    expect(scene.geometry.backPaths).toHaveLength(2);
    expect(scene.geometry.frontPaths).toHaveLength(0);
  });

  it("uses two separated maximum-valid-roundness diamond ears embedded in the head sphere", () => {
    const ears = COMPACT_MASCOT_DEFINITION.body.nodes.map((node) => node.surface);
    expect(ears).toEqual([
      { type: "diamond", width: 108, height: 190, depth: 102, roundness: 1 },
      { type: "diamond", width: 108, height: 190, depth: 102, roundness: 1 },
    ]);
    expect(COMPACT_MASCOT_DEFINITION.body.nodes.map((node) => node.position)).toEqual([
      [-72, -50, -80],
      [72, -50, -80],
    ]);
    expect((COMPACT_MASCOT_DEFINITION.body.nodes[1].position[0] - COMPACT_MASCOT_DEFINITION.body.nodes[0].position[0]) / COMPACT_MASCOT_DEFINITION.body.primary.width).toBeCloseTo(0.6, 6);
  });

  it("projects two nonempty core ear paths from the neutral pinned definition", () => {
    const scene = renderAvatarDefinition(COMPACT_MASCOT_DEFINITION);
    expect(scene.geometry.backPaths).toHaveLength(2);
    expect(scene.geometry.backPaths.every((path) => path.length > 10)).toBe(true);
  });
});
