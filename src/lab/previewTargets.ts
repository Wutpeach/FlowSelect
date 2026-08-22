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

/** Workspace display magnification options (Lab chrome only, never production). */
export const LAB_DISPLAY_SCALES = [1, 2, 3] as const;

export type LabDisplayScale = (typeof LAB_DISPLAY_SCALES)[number];

export const LAB_DISPLAY_SCALE_DEFAULT: LabDisplayScale = 1;

/**
 * Reserved workspace layout size for one preview target at a display scale:
 * `logicalSize × displayScale`. The stage keeps its logical CSS size; only the
 * Lab workspace wrapper is scaled, so preview content never overlaps the side
 * regions and pointer normalization keeps working through the displayed rect.
 */
export const resolveLabPreviewScaledSize = (
  target: LabPreviewTarget,
  displayScale: number,
): number => LAB_PREVIEW_TARGETS[target].logicalSize * displayScale;
