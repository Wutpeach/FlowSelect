export const resolveMainWindowManualPosition = (
  payload: { x?: unknown; y?: unknown } | null | undefined,
): { x: number; y: number } | null => {
  const x = Number(payload?.x);
  const y = Number(payload?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x: Math.round(x), y: Math.round(y) };
};
