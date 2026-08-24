import { useMemo } from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import type { LocalIntakeOrigin } from "../../application/download-api";

// Main Window Pointer Field: the one renderer-local authority for continuous
// pointer coordinates. Coordinates are viewport-local pixels measured from the
// stable presentation root (which Magnetic never transforms), so the field
// can never feed back into its own measurement. This is runtime data only:
// no lifecycle events, React application state, native coordinates, or
// consumer policy live here.
export type MainWindowPointerField = {
  x: MotionValue<number>;
  y: MotionValue<number>;
};

/** Stable presentation root rect in client (viewport) coordinates. */
export type MainWindowPointerFieldRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Pure center of the stable root; null when the size is invalid. */
export const resolvePointerFieldCenterPoint = (
  viewportSize: number,
): { x: number; y: number } | null => {
  if (!Number.isFinite(viewportSize) || viewportSize <= 0) {
    return null;
  }
  const center = viewportSize / 2;
  return { x: center, y: center };
};

// The field starts at the stable root center so a Magnetic consumer enabled
// before the first pointer enter resolves to zero displacement, never an
// unintended corner pull from the (0, 0) origin.
export const useMainWindowPointerField = (
  viewportSize: number,
): MainWindowPointerField => {
  const point = resolvePointerFieldCenterPoint(viewportSize) ?? { x: 0, y: 0 };
  const x = useMotionValue(point.x);
  const y = useMotionValue(point.y);
  // MotionValues are stable; memoize the pair so consumers keep a stable
  // field identity across renders.
  const field = useMemo(() => ({ x, y }), [x, y]);
  return field;
};

/** Pure client → root-relative conversion with finite validation and clamping. */
export const resolvePointerFieldPoint = (
  clientX: number,
  clientY: number,
  rect: MainWindowPointerFieldRect,
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
    x: Math.min(Math.max(clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(clientY - rect.top, 0), rect.height),
  };
};

/** Writes a client point into the field as root-relative coordinates. */
export const updatePointerFieldFromClientPoint = (
  field: MainWindowPointerField,
  clientX: number,
  clientY: number,
  rect: MainWindowPointerFieldRect,
): void => {
  const point = resolvePointerFieldPoint(clientX, clientY, rect);
  if (point === null) {
    return;
  }
  field.x.set(point.x);
  field.y.set(point.y);
};

/** Semantic pointer leave resets the field to the stable root center. */
export const resetPointerFieldToCenter = (
  field: MainWindowPointerField,
  viewportSize: number,
): void => {
  const point = resolvePointerFieldCenterPoint(viewportSize);
  if (point === null) {
    return;
  }
  field.x.set(point.x);
  field.y.set(point.y);
};

/**
 * Captures one causal point while the Surface still knows the pointer is
 * inside. Consumers must not call this during later command acceptance.
 */
export const snapshotPointerFieldOrigin = (
  field: MainWindowPointerField,
  viewportSize: number,
): LocalIntakeOrigin | undefined => {
  if (!Number.isFinite(viewportSize) || viewportSize <= 0) {
    return undefined;
  }
  const x = field.x.get() / viewportSize;
  const y = field.y.get() / viewportSize;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return undefined;
  }
  return { x, y };
};

export const snapshotClientPointOrigin = (
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): LocalIntakeOrigin | undefined => {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }
  return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
};
