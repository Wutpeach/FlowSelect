import type { FlowSelectDisplay, FlowSelectPoint, FlowSelectSize } from "../types/electronBridge";

type PreferredSide = "right" | "left";

export type ResolveSecondaryWindowPositionOptions = {
  anchorPosition: FlowSelectPoint;
  anchorSize: FlowSelectSize;
  targetSize: FlowSelectSize;
  gap: number;
  edgePadding: number;
  scaleFactor: number;
  monitor: FlowSelectDisplay | null;
  preferredSide?: PreferredSide;
};

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), Math.max(min, max))
);

export const resolveSecondaryWindowPosition = ({
  anchorPosition,
  anchorSize,
  targetSize,
  gap,
  edgePadding,
  scaleFactor,
  monitor,
  preferredSide = "right",
}: ResolveSecondaryWindowPositionOptions): FlowSelectPoint => {
  const safeScaleFactor = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const gapPx = gap * safeScaleFactor;
  const edgePaddingPx = edgePadding * safeScaleFactor;
  const targetWidthPx = targetSize.width * safeScaleFactor;
  const targetHeightPx = targetSize.height * safeScaleFactor;
  const placeRight = preferredSide === "right";

  let x = placeRight
    ? anchorPosition.x + anchorSize.width + gapPx
    : anchorPosition.x - targetWidthPx - gapPx;
  const y = anchorPosition.y;

  if (!monitor) {
    return {
      x: x / safeScaleFactor,
      y: y / safeScaleFactor,
    };
  }

  const minX = monitor.position.x + edgePaddingPx;
  const minY = monitor.position.y + edgePaddingPx;
  const maxX = monitor.position.x + monitor.size.width - targetWidthPx - edgePaddingPx;
  const maxY = monitor.position.y + monitor.size.height - targetHeightPx - edgePaddingPx;

  if (placeRight && x > maxX) {
    x = anchorPosition.x - targetWidthPx - gapPx;
  }
  if (!placeRight && x < minX) {
    x = anchorPosition.x + anchorSize.width + gapPx;
  }

  return {
    x: clamp(x, minX, maxX) / safeScaleFactor,
    y: clamp(y, minY, maxY) / safeScaleFactor,
  };
};
