export type DownloaderDeckDirection = -1 | 1;

export const DOWNLOADER_DECK_WHEEL_THRESHOLD = 48;
export const DOWNLOADER_DECK_ANIMATION_MS = 500;
export const DOWNLOADER_DECK_REDUCED_MOTION_ANIMATION_MS = 180;

const normalizeDeckIndex = (index: number, length: number): number => {
  if (length <= 0) {
    return 0;
  }

  return ((index % length) + length) % length;
};

export const moveDownloaderDeckIndex = (
  currentIndex: number,
  direction: DownloaderDeckDirection,
  length: number,
): number => normalizeDeckIndex(currentIndex + direction, length);

export const getDownloaderDeckDirection = (deltaY: number): DownloaderDeckDirection | 0 => {
  if (deltaY > 0) {
    return 1;
  }

  if (deltaY < 0) {
    return -1;
  }

  return 0;
};

export const consumeDownloaderDeckWheelDelta = (
  accumulatedDelta: number,
  deltaY: number,
  threshold = DOWNLOADER_DECK_WHEEL_THRESHOLD,
): { accumulatedDelta: number; direction: DownloaderDeckDirection | 0 } => {
  const nextAccumulatedDelta = accumulatedDelta + deltaY;

  if (Math.abs(nextAccumulatedDelta) < threshold) {
    return {
      accumulatedDelta: nextAccumulatedDelta,
      direction: 0,
    };
  }

  return {
    accumulatedDelta: 0,
    direction: getDownloaderDeckDirection(nextAccumulatedDelta),
  };
};

export const getDownloaderDeckAnimationMs = (shouldReduceMotion: boolean): number => (
  shouldReduceMotion
    ? DOWNLOADER_DECK_REDUCED_MOTION_ANIMATION_MS
    : DOWNLOADER_DECK_ANIMATION_MS
);
