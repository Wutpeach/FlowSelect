const MIN_STARTUP_WIDTH = 200;
const MIN_STARTUP_HEIGHT = 200;
const MIN_VISIBLE_EDGE_PX = 40;
const DEFAULT_WINDOW_EDGE_PADDING = 8;
const DEFAULT_SHORTCUT_CURSOR_DIAGONAL_OFFSET = 50;

export const STARTUP_DIAGNOSTICS_ARGUMENT = "--flowselect-startup-diagnostics";
export const STARTUP_DIAGNOSTICS_ENV = "FLOWSELECT_STARTUP_DIAGNOSTICS";
export const FORCE_OPAQUE_WINDOW_ARGUMENT = "--flowselect-force-opaque-window";
export const FORCE_OPAQUE_WINDOW_ENV = "FLOWSELECT_FORCE_OPAQUE_WINDOW";
export const WINDOWS_PACKAGED_OPAQUE_WINDOW_BACKGROUND = "#1f1d24";
export const WINDOWS_PACKAGED_LIGHT_OPAQUE_WINDOW_BACKGROUND = "#E3E3E3";
export const WINDOWS_PACKAGED_ZERO_ALPHA_WINDOW_BACKGROUND = "#00000000";
export const WINDOWS_PACKAGED_TRANSPARENT_WINDOW_BACKGROUND = "#01201E25";
export const WINDOWS_PACKAGED_LIGHT_TRANSPARENT_WINDOW_BACKGROUND = "#01E3E3E3";
export const PACKAGED_WINDOWS_TRANSPARENT_REVEAL_DELAY_MS = 120;

const TRUTHY_FLAGS = new Set(["1", "true", "yes", "on"]);

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), Math.max(min, max))
);

const intersectionSize = (
  startA: number,
  sizeA: number,
  startB: number,
  sizeB: number,
): number => {
  const start = Math.max(startA, startB);
  const end = Math.min(startA + sizeA, startB + sizeB);
  return Math.max(0, end - start);
};

export type VisibilityBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisibilityPoint = {
  x: number;
  y: number;
};

type WindowVisibilityOptions = {
  platform: NodeJS.Platform;
  isPackaged: boolean;
};

type StartupDiagnosticsOptions = WindowVisibilityOptions & {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
};

type PackagedWindowRevealDelayOptions = WindowVisibilityOptions & {
  transparentWindow: boolean;
};

type ResolveMainWindowRevealBoundsOptions = {
  bounds: VisibilityBounds;
  displays: VisibilityBounds[];
  fallbackDisplay: VisibilityBounds;
  forceCenter?: boolean;
  minimumWidth?: number;
  minimumHeight?: number;
};

type ResolveWindowBoundsNearCursorOptions = {
  cursor: VisibilityPoint;
  display: VisibilityBounds;
  width: number;
  height: number;
  edgePadding?: number;
  diagonalOffset?: number;
};

const normalizeFlag = (value: string | undefined): boolean => (
  typeof value === "string" && TRUTHY_FLAGS.has(value.trim().toLowerCase())
);

const isPackagedWindowsWindowEnvironment = ({
  platform,
  isPackaged,
}: WindowVisibilityOptions): boolean => platform === "win32" && isPackaged;

export const shouldUsePackagedWindowsOpaqueWindow = ({
  platform,
  isPackaged,
  argv = [],
  env = {},
}: StartupDiagnosticsOptions): boolean => {
  if (!isPackagedWindowsWindowEnvironment({ platform, isPackaged })) {
    return false;
  }

  return argv.includes(FORCE_OPAQUE_WINDOW_ARGUMENT)
    || normalizeFlag(env[FORCE_OPAQUE_WINDOW_ENV]);
};

export const resolvePackagedWindowsOpaqueWindowBackground = (
  theme: string,
): string => (
  theme === "white"
    ? WINDOWS_PACKAGED_LIGHT_OPAQUE_WINDOW_BACKGROUND
    : WINDOWS_PACKAGED_OPAQUE_WINDOW_BACKGROUND
);

export const resolvePackagedWindowsTransparentWindowBackground = (
  theme: string,
  preferZeroAlpha = false,
): string => (
  preferZeroAlpha
    ? WINDOWS_PACKAGED_ZERO_ALPHA_WINDOW_BACKGROUND
    : theme === "white"
      ? WINDOWS_PACKAGED_LIGHT_TRANSPARENT_WINDOW_BACKGROUND
      : WINDOWS_PACKAGED_TRANSPARENT_WINDOW_BACKGROUND
);

export const shouldEnablePackagedStartupDiagnostics = ({
  platform,
  isPackaged,
  argv = [],
  env = {},
}: StartupDiagnosticsOptions): boolean => {
  if (!isPackagedWindowsWindowEnvironment({ platform, isPackaged })) {
    return false;
  }

  return argv.includes(STARTUP_DIAGNOSTICS_ARGUMENT)
    || normalizeFlag(env[STARTUP_DIAGNOSTICS_ENV]);
};

export const getPackagedWindowRevealDelayMs = ({
  platform,
  isPackaged,
  transparentWindow,
}: PackagedWindowRevealDelayOptions): number => (
  isPackagedWindowsWindowEnvironment({ platform, isPackaged }) && transparentWindow
    ? PACKAGED_WINDOWS_TRANSPARENT_REVEAL_DELAY_MS
    : 0
);

export const isWindowSufficientlyVisible = (
  bounds: VisibilityBounds,
  displays: VisibilityBounds[],
): boolean => {
  const minimumVisibleWidth = Math.min(MIN_VISIBLE_EDGE_PX, Math.max(1, bounds.width));
  const minimumVisibleHeight = Math.min(MIN_VISIBLE_EDGE_PX, Math.max(1, bounds.height));

  return displays.some((display) => {
    const visibleWidth = intersectionSize(bounds.x, bounds.width, display.x, display.width);
    const visibleHeight = intersectionSize(bounds.y, bounds.height, display.y, display.height);
    return visibleWidth >= minimumVisibleWidth && visibleHeight >= minimumVisibleHeight;
  });
};

export const isPointInsideBounds = (
  point: VisibilityPoint,
  bounds: VisibilityBounds,
): boolean => (
  point.x >= bounds.x
  && point.x <= bounds.x + bounds.width
  && point.y >= bounds.y
  && point.y <= bounds.y + bounds.height
);

export const resolveCenteredWindowBounds = (
  bounds: VisibilityBounds,
  display: VisibilityBounds,
  minimumWidth = MIN_STARTUP_WIDTH,
  minimumHeight = MIN_STARTUP_HEIGHT,
): VisibilityBounds => {
  const width = Math.max(Math.max(1, Math.round(minimumWidth)), Math.round(bounds.width));
  const height = Math.max(Math.max(1, Math.round(minimumHeight)), Math.round(bounds.height));
  const maxX = display.x + display.width - width;
  const maxY = display.y + display.height - height;

  return {
    x: clamp(Math.round(display.x + (display.width - width) / 2), display.x, maxX),
    y: clamp(Math.round(display.y + (display.height - height) / 2), display.y, maxY),
    width,
    height,
  };
};

export const resolveMainWindowRevealBounds = ({
  bounds,
  displays,
  fallbackDisplay,
  forceCenter = false,
  minimumWidth = MIN_STARTUP_WIDTH,
  minimumHeight = MIN_STARTUP_HEIGHT,
}: ResolveMainWindowRevealBoundsOptions): VisibilityBounds => {
  const normalizedMinimumWidth = Math.max(1, Math.round(minimumWidth));
  const normalizedMinimumHeight = Math.max(1, Math.round(minimumHeight));
  const normalized = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(normalizedMinimumWidth, Math.round(bounds.width)),
    height: Math.max(normalizedMinimumHeight, Math.round(bounds.height)),
  };

  if (forceCenter || !isWindowSufficientlyVisible(normalized, displays)) {
    return resolveCenteredWindowBounds(
      normalized,
      fallbackDisplay,
      normalizedMinimumWidth,
      normalizedMinimumHeight,
    );
  }

  return normalized;
};

export const resolveWindowBoundsNearCursor = ({
  cursor,
  display,
  width,
  height,
  edgePadding = DEFAULT_WINDOW_EDGE_PADDING,
  diagonalOffset = DEFAULT_SHORTCUT_CURSOR_DIAGONAL_OFFSET,
}: ResolveWindowBoundsNearCursorOptions): VisibilityBounds => {
  const normalizedWidth = Math.max(1, Math.round(width));
  const normalizedHeight = Math.max(1, Math.round(height));
  const axisOffset = diagonalOffset / Math.SQRT2;
  const minX = display.x + edgePadding;
  const minY = display.y + edgePadding;
  const maxX = display.x + display.width - normalizedWidth - edgePadding;
  const maxY = display.y + display.height - normalizedHeight - edgePadding;

  return {
    x: clamp(Math.round(cursor.x - normalizedWidth - axisOffset), minX, maxX),
    y: clamp(Math.round(cursor.y - axisOffset), minY, maxY),
    width: normalizedWidth,
    height: normalizedHeight,
  };
};
