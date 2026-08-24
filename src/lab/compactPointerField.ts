/**
 * Lab-local continuous pointer pair for the Compact preview target.
 *
 * Deliberately NOT the production Main Window Pointer Field module: the
 * production field is a single renderer-local authority whose writer helpers
 * are pinned by `src/architecture/import-guard.test.ts` to the presentation
 * surface only. The Lab creates its own MotionValue pair (a Lab preview
 * input, never a production authority) and updates it directly with `.set()`.
 * The field starts and resets to the Compact attention center (40, 40) in the
 * 80×80 logical frame, so a neutral/pinned field projects a neutral character.
 */
import { useMemo } from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import { MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE } from "../constants/windowMetrics";

export type LabCompactPointerField = Readonly<{
  x: MotionValue<number>;
  y: MotionValue<number>;
}>;

export type LabCompactPointerRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/** Compact attention center in the 80×80 logical frame (production center). */
export const LAB_COMPACT_ATTENTION_CENTER = { x: 40, y: 40 };

/** Pure client → logical-frame point with finite validation and clamping. */
export const resolveLabCompactPointerPoint = (
  clientX: number,
  clientY: number,
  rect: LabCompactPointerRect,
): { x: number; y: number } | null => {
  if (
    !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }
  return {
    x: Math.min(
      Math.max((clientX - rect.left) / rect.width, 0),
      1,
    ) * MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
    y: Math.min(
      Math.max((clientY - rect.top) / rect.height, 0),
      1,
    ) * MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
  };
};

/** Writes a client point into the Lab-local field as logical-frame coordinates. */
export const updateLabCompactPointerFromClientPoint = (
  field: LabCompactPointerField,
  clientX: number,
  clientY: number,
  rect: LabCompactPointerRect,
): void => {
  const point = resolveLabCompactPointerPoint(clientX, clientY, rect);
  if (point === null) {
    return;
  }
  field.x.set(point.x);
  field.y.set(point.y);
};

/** Resets the Lab-local field to the Compact attention center (neutral). */
export const resetLabCompactPointerToCenter = (
  field: LabCompactPointerField,
  center: { x: number; y: number } = LAB_COMPACT_ATTENTION_CENTER,
): void => {
  field.x.set(center.x);
  field.y.set(center.y);
};

/** One Lab-local pointer pair starting at the Compact attention center. */
export const useLabCompactPointerField = (): LabCompactPointerField => {
  const x = useMotionValue(LAB_COMPACT_ATTENTION_CENTER.x);
  const y = useMotionValue(LAB_COMPACT_ATTENTION_CENTER.y);
  return useMemo(() => ({ x, y }), [x, y]);
};
