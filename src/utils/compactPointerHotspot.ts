export type CompactPointerHotspotInput = {
  pointX: number;
  pointY: number;
  centerX: number;
  centerY: number;
  enterRadius: number;
  exitRadius: number;
  wasInside: boolean;
};

export const isPointInsideCompactPointerHotspot = ({
  pointX,
  pointY,
  centerX,
  centerY,
  enterRadius,
  exitRadius,
  wasInside,
}: CompactPointerHotspotInput): boolean => {
  const activeRadius = wasInside ? exitRadius : enterRadius;
  const dx = pointX - centerX;
  const dy = pointY - centerY;

  return Math.hypot(dx, dy) <= activeRadius;
};
