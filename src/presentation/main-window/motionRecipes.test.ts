import { describe, expect, it } from "vitest";

import {
  resolveMainWindowShellMotionRecipe,
  MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION,
  MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION,
  MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION,
  MAIN_WINDOW_PANEL_INSTANT_TRANSITION,
} from "./motionRecipes";
import type { MainWindowVisualProjection } from "./projections";

const fullShell = { x: 14, y: 14, width: 200, height: 200, radius: 16, clipPath: "inset(0 round 16px)" };
const compactShell = { x: 10, y: 10, width: 60, height: 60, radius: 100, clipPath: "inset(0 round 100px)" };

const fullProjection: MainWindowVisualProjection = {
  mode: "full",
  completionTarget: "full",
  transitionEpoch: null,
  recipe: "animated",
  settleEpoch: null,
};

describe("mainWindow motion recipes (renderer choreography only)", () => {
  it("initial mount uses the initial tween and reduced scale", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: fullProjection,
      visualShell: fullShell,
      reducedMotion: false,
      isInitialMount: true,
      isMacOS: false,
    });
    expect(recipe.shellAnimate.scale).toBe(0.88);
    expect(recipe.shellTransition.scale).toEqual(MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION);
  });

  it("compact mode uses the compact tween", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: { ...fullProjection, mode: "compact", completionTarget: "compact" },
      visualShell: compactShell,
      reducedMotion: false,
      isInitialMount: false,
      isMacOS: false,
    });
    expect(recipe.shellTransition.scale).toEqual(MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION);
    expect(recipe.shellAnimate).toMatchObject({
      x: 10,
      y: 10,
      width: 60,
      height: 60,
      borderRadius: 100,
    });
  });

  it("animated expand uses the spring with elastic keyframes", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: { ...fullProjection, transitionEpoch: 5, recipe: "animated" },
      visualShell: fullShell,
      reducedMotion: false,
      isInitialMount: false,
      isMacOS: false,
    });
    expect(recipe.shellAnimate.scale).toEqual([1, 1.01, 1]);
    expect(recipe.shellTransition.scale).toMatchObject({
      ...MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION,
      times: [0, 0.66, 1],
    });
  });

  it("instant expand uses the instant transition without elastic keyframes", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: { ...fullProjection, transitionEpoch: 5, recipe: "instant" },
      visualShell: fullShell,
      reducedMotion: false,
      isInitialMount: false,
      isMacOS: false,
    });
    expect(recipe.shellAnimate.scale).toBe(1);
    expect(recipe.shellTransition.scale).toEqual(MAIN_WINDOW_PANEL_INSTANT_TRANSITION);
  });

  it("settled full uses the spring without elastic keyframes", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: fullProjection,
      visualShell: fullShell,
      reducedMotion: false,
      isInitialMount: false,
      isMacOS: false,
    });
    expect(recipe.shellAnimate.scale).toBe(1);
    expect(recipe.shellTransition.scale).toEqual(MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION);
  });

  it("reduced motion suppresses elastic keyframes and uses reduced icon recipes", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: { ...fullProjection, transitionEpoch: 5, recipe: "animated" },
      visualShell: fullShell,
      reducedMotion: true,
      isInitialMount: false,
      isMacOS: false,
    });
    expect(recipe.shellAnimate.scale).toBe(1);
    expect(recipe.icon.animate).toEqual({ scale: 1, opacity: 0 });
    expect(recipe.icon.settleAnimate).toEqual({ scale: 1 });
  });

  it("compact icon pulse runs only in settled compact without reduced motion", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: { ...fullProjection, mode: "compact", completionTarget: "compact", settleEpoch: 3 },
      visualShell: compactShell,
      reducedMotion: false,
      isInitialMount: false,
      isMacOS: false,
    });
    expect(recipe.icon.settleAnimate).toEqual({ scale: [1, 1.025, 1] });
    expect(recipe.icon.animate).toEqual({ scale: 1, opacity: 1 });
  });

  it("macOS uses the smaller icon inside the shell frame", () => {
    const recipe = resolveMainWindowShellMotionRecipe({
      projection: { ...fullProjection, mode: "compact", completionTarget: "compact" },
      visualShell: compactShell,
      reducedMotion: false,
      isInitialMount: false,
      isMacOS: true,
    });
    expect(recipe.icon.size).toBe(36);
    expect(recipe.icon.frameSize).toBe(60);
  });
});
