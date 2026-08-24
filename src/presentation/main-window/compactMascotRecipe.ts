// Compact-only Strobi geometry and pointer projection. This pure leaf reads no
// DOM/native state and never writes lifecycle, Product, IPC, or Pointer Field
// authority.

export const COMPACT_MASCOT_VIEWBOX = 300;
export const COMPACT_MASCOT_VISUAL_SIZE = 56;
// Keeps the 56px holder intact while the separated-ear action envelope clears
// the unchanged 60px shell.
export const COMPACT_MASCOT_RENDER_SCALE = 0.95;

export const COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS = 46;
export const COMPACT_MASCOT_ATTENTION_DEAD_ZONE = 3;
export const COMPACT_MASCOT_ATTENTION_PEAK_DISTANCE =
  (COMPACT_MASCOT_ATTENTION_DEAD_ZONE + COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS) / 2;

// The official scene uses a 300-unit viewBox. These values preserve the old
// Compact attention displacement in rendered CSS pixels while moving only the
// upstream eye geometry.
export const COMPACT_MASCOT_EYE_MAX_X = 11;
export const COMPACT_MASCOT_EYE_MAX_Y = 7.5;
export const COMPACT_MASCOT_EYE_MAX_X_REDUCED = 6;
export const COMPACT_MASCOT_EYE_MAX_Y_REDUCED = 4;

export type CompactMascotPoint = { x: number; y: number };
export type CompactMascotAttentionOffset = { x: number; y: number };

export const NEUTRAL_COMPACT_MASCOT_ATTENTION: CompactMascotAttentionOffset = {
  x: 0,
  y: 0,
};

const resolveAttentionIntensity = (distance: number): number => {
  if (
    distance <= COMPACT_MASCOT_ATTENTION_DEAD_ZONE
    || distance >= COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS
  ) {
    return 0;
  }
  const progress = (distance - COMPACT_MASCOT_ATTENTION_DEAD_ZONE)
    / (COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS - COMPACT_MASCOT_ATTENTION_DEAD_ZONE);
  return 0.5 * (1 - Math.cos(2 * Math.PI * progress));
};

export const resolveCompactMascotAttention = (
  point: CompactMascotPoint,
  center: CompactMascotPoint,
  reducedMotion: boolean,
): CompactMascotAttentionOffset => {
  if (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || !Number.isFinite(center.x)
    || !Number.isFinite(center.y)
  ) {
    return NEUTRAL_COMPACT_MASCOT_ATTENTION;
  }

  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance === 0) {
    return NEUTRAL_COMPACT_MASCOT_ATTENTION;
  }

  const intensity = resolveAttentionIntensity(distance);
  if (intensity === 0) {
    return NEUTRAL_COMPACT_MASCOT_ATTENTION;
  }

  const maxX = reducedMotion
    ? COMPACT_MASCOT_EYE_MAX_X_REDUCED
    : COMPACT_MASCOT_EYE_MAX_X;
  const maxY = reducedMotion
    ? COMPACT_MASCOT_EYE_MAX_Y_REDUCED
    : COMPACT_MASCOT_EYE_MAX_Y;
  return {
    x: dx / distance * maxX * intensity,
    y: dy / distance * maxY * intensity,
  };
};
