/**
 * Lab Preview Target model — the ONE Lab-local UI discriminant (`full |
 * compact`) plus workspace display-magnification metadata.
 *
 * Preview Target choice is Lab UI state only and stays fully separate from
 * scenario state: switching a target only changes which preview host the
 * workspace renders; it never writes scenario, reducer, Product, lifecycle,
 * native-window, or renderer state.
 *
 * All geometry derives from the existing production window / character
 * constants so the previews are faithful to the real surfaces. Three scale
 * concepts stay separate:
 *   - logicalSize: production geometry (200 Full, 80 Compact outer);
 *   - display scale: workspace-only magnification (never written to
 *     production geometry);
 *   - backing/export scale: Full canvas raster density (export contract).
 */
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

export type LabPreviewTarget = "full" | "compact";

export type LabPreviewTargetMeta = Readonly<{
  id: LabPreviewTarget;
  /** i18n key in the `lab` namespace. */
  labelKey: string;
  /** Production logical outer frame size (CSS px). */
  logicalSize: number;
  /** Production visible shell size (CSS px). */
  shellSize: number;
  /** Production character visual size; null when the target has no character. */
  characterSize: number | null;
  /** Production shell radius (px); a 100px radius on a 60px shell is a circle. */
  radius: number;
  /** Attention center in the logical frame (Compact only; unused for Full). */
  attentionCenterX: number;
  attentionCenterY: number;
}>;

export const LAB_PREVIEW_TARGETS: Readonly<Record<LabPreviewTarget, LabPreviewTargetMeta>> = {
  full: {
    id: "full",
    labelKey: "previewTarget.full",
    logicalSize: MAIN_WINDOW_PANEL_SIZE,
    shellSize: MAIN_WINDOW_PANEL_SIZE,
    characterSize: null,
    radius: MAIN_WINDOW_FULL_PANEL_RADIUS,
    attentionCenterX: 0,
    attentionCenterY: 0,
  },
  compact: {
    id: "compact",
    labelKey: "previewTarget.compact",
    logicalSize: MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
    shellSize: MAIN_WINDOW_COMPACT_SHELL_SIZE,
    characterSize: CHARACTER_VISUAL_SIZE,
    radius: MAIN_WINDOW_MINIMIZED_PANEL_RADIUS,
    attentionCenterX: MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE / 2,
    attentionCenterY: MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE / 2,
  },
};

export const LAB_PREVIEW_TARGET_IDS = Object.keys(
  LAB_PREVIEW_TARGETS,
) as readonly LabPreviewTarget[];

/** Workspace-only magnification. Auto is the default adaptive mode and
    resolves to a member of {1, 2, 3} — never below 1, never above 3. The
    manual 1x/2x/3x options remain explicit overrides. */
export const LAB_DISPLAY_SCALES = ["auto", 1, 2, 3] as const;

export type LabDisplayScale = (typeof LAB_DISPLAY_SCALES)[number];

export const LAB_DISPLAY_SCALE_DEFAULT: LabDisplayScale = "auto";

/** The discrete manual magnification members Auto may resolve to. */
export const LAB_AUTO_SCALE_OPTIONS = [1, 2, 3] as const;

const LAB_AUTO_SAFETY_PADDING = 32;

/** Fraction of the shorter stage edge reserved on each side of the Auto preview. */
export const LAB_AUTO_BREATHING_RATIO = 0.06;

/**
 * Pure Auto resolution: from the measured usable stage (shorter edge after
 * the proportional breathing margin and the absolute safety floor), pick the
 * LARGEST comfortable member of {1, 2, 3} that the usable stage can still
 * accommodate without overflow. Never resolves below 1 or above 3; non-finite
 * or empty geometry resolves to 1. Logical geometry and the export backing
 * scale are untouched.
 */
export const resolveLabAutoDisplayScale = (
  viewportWidth: number,
  viewportHeight: number,
  logicalSize: number,
): 1 | 2 | 3 => {
  if (
    !Number.isFinite(viewportWidth)
    || !Number.isFinite(viewportHeight)
    || !Number.isFinite(logicalSize)
    || logicalSize <= 0
  ) {
    return 1;
  }
  const raw = Math.min(viewportWidth, viewportHeight);
  const usable = Math.max(
    0,
    raw * (1 - 2 * LAB_AUTO_BREATHING_RATIO) - LAB_AUTO_SAFETY_PADDING,
  );
  for (let index = LAB_AUTO_SCALE_OPTIONS.length - 1; index >= 0; index -= 1) {
    const scale = LAB_AUTO_SCALE_OPTIONS[index];
    if (logicalSize * scale <= usable) {
      return scale;
    }
  }
  return 1;
};

/** Reserve workspace layout size for a concrete resolved display scale. */
export const resolveLabPreviewScaledSize = (
  target: LabPreviewTarget,
  displayScale: number,
): number => LAB_PREVIEW_TARGETS[target].logicalSize * displayScale;
