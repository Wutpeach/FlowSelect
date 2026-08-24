import { useEffect, useMemo } from "react";
import { useSpring, useTransform, type MotionValue } from "motion/react";
import {
  resolvePointerFieldCenterPoint,
  type MainWindowPointerField,
} from "./pointerField";

// Magnetic: renderer-only visual consumer of the Pointer Field for the full
// main window shell. The consumer receives only the smallest authoritative
// eligibility fact (enabled); it never interprets lifecycle phases itself.
// This module has no lifecycle events, no desktop/native API, and no
// completion callback — the shell node keeps the sole morph completion
// acknowledgement.
export const MAGNETIC_MAX_DISPLACEMENT = 8;
export const MAGNETIC_RESPONSE_RADIUS = 80;
export const MAGNETIC_SPRING = { stiffness: 300, damping: 30 } as const;

export type MagneticTarget = {
  x: number;
  y: number;
};

/** Pure bounded radial target: zero at center, symmetric, clamped, zero when disabled. */
export const resolveMagneticTarget = (
  point: { x: number; y: number },
  viewportSize: number,
  enabled: boolean,
): MagneticTarget => {
  const center = resolvePointerFieldCenterPoint(viewportSize);
  if (
    !enabled
    || center === null
    || !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
  ) {
    return { x: 0, y: 0 };
  }
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { x: 0, y: 0 };
  }
  const strength = Math.min(1, distance / MAGNETIC_RESPONSE_RADIUS)
    * MAGNETIC_MAX_DISPLACEMENT;
  return {
    x: (dx / distance) * strength,
    y: (dy / distance) * strength,
  };
};

/**
 * Derives the outer wrapper's x/y MotionValues from the Pointer Field.
 * The spring smooths pointer-tracked movement; non-eligible states
 * (compact, reduced motion, drag, expanding) jump the rendered displacement
 * to zero immediately without waiting for a spring settle.
 */
export const useMainWindowMagnetic = (
  field: MainWindowPointerField,
  viewportSize: number,
  enabled: boolean,
): { x: MotionValue<number>; y: MotionValue<number> } => {
  const target = useTransform(
    [field.x, field.y],
    ([px, py]: number[]) => resolveMagneticTarget({ x: px, y: py }, viewportSize, enabled),
  );
  const x = useSpring(useTransform(target, (t) => t.x), MAGNETIC_SPRING);
  const y = useSpring(useTransform(target, (t) => t.y), MAGNETIC_SPRING);

  useEffect(() => {
    if (!enabled) {
      x.jump(0);
      y.jump(0);
    }
  }, [enabled, x, y]);

  // MotionValues are stable; memoize the pair so consumers never see a
  // changing identity (same pattern as the Pointer Field).
  return useMemo(() => ({ x, y }), [x, y]);
};
