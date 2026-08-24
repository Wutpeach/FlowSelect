import { describe, expect, it } from "vitest";
import {
  LAB_AUTO_BREATHING_RATIO,
  LAB_AUTO_SCALE_OPTIONS,
  LAB_DISPLAY_SCALES,
  LAB_DISPLAY_SCALE_DEFAULT,
  LAB_PREVIEW_TARGETS,
  LAB_PREVIEW_TARGET_IDS,
  resolveLabAutoDisplayScale,
  resolveLabPreviewScaledSize,
} from "./previewTargets";
import {
  MAIN_WINDOW_COMPACT_SHELL_SIZE,
  MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
  MAIN_WINDOW_PANEL_SIZE,
} from "../constants/windowMetrics";
import { COMPACT_MASCOT_VISUAL_SIZE } from "../presentation/main-window/compactMascotRecipe";
import {
  MAIN_WINDOW_FULL_PANEL_RADIUS,
  MAIN_WINDOW_MINIMIZED_PANEL_RADIUS,
} from "../presentation/main-window/geometry";

describe("Lab Preview Target model", () => {
  it("exposes exactly the two production preview targets", () => {
    expect(LAB_PREVIEW_TARGET_IDS).toEqual(["full", "compact"]);
  });

  it("derives the Full target from the production 200 panel geometry", () => {
    const meta = LAB_PREVIEW_TARGETS.full;
    expect(meta.logicalSize).toBe(MAIN_WINDOW_PANEL_SIZE);
    expect(meta.shellSize).toBe(MAIN_WINDOW_PANEL_SIZE);
    expect(meta.characterSize).toBeNull();
    expect(meta.radius).toBe(MAIN_WINDOW_FULL_PANEL_RADIUS);
    expect(meta.radius).toBe(16);
  });

  it("derives the Compact target from the production 80/60/56 geometry", () => {
    const meta = LAB_PREVIEW_TARGETS.compact;
    expect(meta.logicalSize).toBe(MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE);
    expect(meta.shellSize).toBe(MAIN_WINDOW_COMPACT_SHELL_SIZE);
    expect(meta.characterSize).toBe(COMPACT_MASCOT_VISUAL_SIZE);
    expect(meta.radius).toBe(MAIN_WINDOW_MINIMIZED_PANEL_RADIUS);
    // Explicit production geometry (60px shell radius reads as a circle).
    expect(meta.logicalSize).toBe(80);
    expect(meta.shellSize).toBe(60);
    expect(meta.characterSize).toBe(56);
    expect(meta.radius).toBe(100);
  });

  it("keeps Compact attention at the production outer-frame center", () => {
    const meta = LAB_PREVIEW_TARGETS.compact;
    expect(meta.attentionCenterX).toBe(40);
    expect(meta.attentionCenterY).toBe(40);
  });

  it("separates workspace display scale from production geometry", () => {
    // Auto is the default adaptive mode; the manual 1x/2x/3x options remain
    // explicit overrides and Auto resolves only to a member of {1, 2, 3}.
    expect(LAB_DISPLAY_SCALES).toEqual(["auto", 1, 2, 3]);
    expect(LAB_DISPLAY_SCALE_DEFAULT).toBe("auto");
    expect(LAB_AUTO_SCALE_OPTIONS).toEqual([1, 2, 3]);
    expect(resolveLabPreviewScaledSize("full", 2)).toBe(400);
    expect(resolveLabPreviewScaledSize("compact", 3)).toBe(240);
    expect(resolveLabPreviewScaledSize("compact", 1)).toBe(80);
  });

  it("resolves Auto to the largest comfortable member of {1,2,3} that fits the usable stage", () => {
    // A 1200x800 stage on the 80px Compact target: usable 672 -> 3x (240).
    expect(resolveLabAutoDisplayScale(1200, 800, 80)).toBe(3);
    // A 900x700 stage on the 200px Full target: usable 584 -> 3x (600) does
    // not fit, so Auto picks 2x (400).
    expect(resolveLabAutoDisplayScale(900, 700, 200)).toBe(2);
    // A 200x200 stage on the 200px Full target: usable 144 -> only 1x fits.
    expect(resolveLabAutoDisplayScale(200, 200, 200)).toBe(1);
  });

  it("keeps Auto comfortable and integer at a desktop workspace stage", () => {
    // 1600x900 viewport -> measured workspace stage ~1122x521 (Lead's
    // browser validation): usable ~427 -> Full 2x (400) fits, 3x (600) does
    // not; Compact 3x (240) still fits comfortably.
    expect(resolveLabAutoDisplayScale(1122, 521, 200)).toBe(2);
    expect(resolveLabAutoDisplayScale(1122, 521, 80)).toBe(3);
    expect(LAB_AUTO_BREATHING_RATIO).toBeGreaterThan(0);
    expect(LAB_AUTO_BREATHING_RATIO).toBeLessThan(0.25);
  });

  it("never lets Auto exceed the manual 3x ceiling", () => {
    // Compact on a large stage would fit a continuous scale far above 3x, but
    // Auto is bounded to the discrete {1,2,3} members.
    expect(resolveLabAutoDisplayScale(1600, 1000, 80)).toBe(3);
    expect(resolveLabAutoDisplayScale(2000, 1400, 200)).toBe(3);
  });

  it("never lets Auto shrink below 1x when the workspace is small", () => {
    expect(resolveLabAutoDisplayScale(160, 140, 200)).toBe(1);
    expect(resolveLabAutoDisplayScale(100, 200, 200)).toBe(1);
  });

  it("guards Auto against non-finite or empty geometry", () => {
    expect(resolveLabAutoDisplayScale(Number.NaN, 800, 200)).toBe(1);
    expect(resolveLabAutoDisplayScale(1200, Number.POSITIVE_INFINITY, 200)).toBe(1);
    expect(resolveLabAutoDisplayScale(1200, 800, Number.NaN)).toBe(1);
    expect(resolveLabAutoDisplayScale(1200, 800, 0)).toBe(1);
    expect(resolveLabAutoDisplayScale(1200, 800, -50)).toBe(1);
  });
});
