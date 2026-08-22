import { describe, expect, it } from "vitest";
import {
  LAB_DISPLAY_SCALES,
  LAB_DISPLAY_SCALE_DEFAULT,
  LAB_PREVIEW_TARGETS,
  LAB_PREVIEW_TARGET_IDS,
  resolveLabPreviewScaledSize,
} from "./previewTargets";
import {
  MAIN_WINDOW_COMPACT_SHELL_SIZE,
  MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
  MAIN_WINDOW_PANEL_SIZE,
} from "../constants/windowMetrics";
import { CHARACTER_VISUAL_SIZE } from "../presentation/main-window/characterRecipe";
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
    expect(meta.characterSize).toBe(CHARACTER_VISUAL_SIZE);
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
    expect(LAB_DISPLAY_SCALES).toEqual([1, 2, 3]);
    expect(LAB_DISPLAY_SCALE_DEFAULT).toBe(1);
    expect(resolveLabPreviewScaledSize("full", 2)).toBe(400);
    expect(resolveLabPreviewScaledSize("compact", 3)).toBe(240);
    expect(resolveLabPreviewScaledSize("compact", 1)).toBe(80);
  });
});
