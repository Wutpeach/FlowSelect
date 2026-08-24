import {
  getMainWindowCompactOuterSize,
  getMainWindowFullOuterSize,
  getMainWindowFullShadowGutter,
  MAIN_WINDOW_COMPACT_SHELL_SIZE,
  MAIN_WINDOW_PANEL_SIZE,
} from "../../constants/windowMetrics";
import type { MainWindowVisualMode } from "./projections";

export type MainWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MainWindowVisualFrame = MainWindowFrame & {
  radius: number;
  clipPath: string;
};

export type MainWindowHotspotFrame = {
  frameSize: number;
  centerX: number;
  centerY: number;
  enterRadius: number;
  exitRadius: number;
};

export type MainWindowGeometry = {
  mode: MainWindowVisualMode;
  platform: NodeJS.Platform;
  viewportSize: number;
  visualShell: MainWindowVisualFrame;
  shadowShell: MainWindowVisualFrame;
  compactReachableFrame: MainWindowFrame;
  hotspot: MainWindowHotspotFrame;
};

export type ResolveMainWindowGeometryOptions = {
  mode: MainWindowVisualMode;
  platform: NodeJS.Platform;
};

export const MAIN_WINDOW_FULL_PANEL_RADIUS = 16;
export const MAIN_WINDOW_MINIMIZED_PANEL_RADIUS = 100;
export const MAIN_WINDOW_MINIMIZED_ICON_SIZE = 38;

const formatMainWindowClipPath = (radius: number): string => `inset(0 round ${radius}px)`;

const resolveVisualShell = (
  mode: MainWindowVisualMode,
  platform: NodeJS.Platform,
): MainWindowVisualFrame => {
  if (mode === "compact") {
    const compactOuterSize = getMainWindowCompactOuterSize(platform);
    const inset = Math.round((compactOuterSize - MAIN_WINDOW_COMPACT_SHELL_SIZE) / 2);
    return {
      x: inset,
      y: inset,
      width: MAIN_WINDOW_COMPACT_SHELL_SIZE,
      height: MAIN_WINDOW_COMPACT_SHELL_SIZE,
      radius: MAIN_WINDOW_MINIMIZED_PANEL_RADIUS,
      clipPath: formatMainWindowClipPath(MAIN_WINDOW_MINIMIZED_PANEL_RADIUS),
    };
  }

  const gutter = getMainWindowFullShadowGutter(platform);
  return {
    x: gutter,
    y: gutter,
    width: MAIN_WINDOW_PANEL_SIZE,
    height: MAIN_WINDOW_PANEL_SIZE,
    radius: MAIN_WINDOW_FULL_PANEL_RADIUS,
    clipPath: formatMainWindowClipPath(MAIN_WINDOW_FULL_PANEL_RADIUS),
  };
};

const resolveCompactHotspot = (platform: NodeJS.Platform): MainWindowHotspotFrame => {
  const compactOuterSize = getMainWindowCompactOuterSize(platform);
  const frameSize = platform === "darwin"
    ? MAIN_WINDOW_COMPACT_SHELL_SIZE
    : MAIN_WINDOW_MINIMIZED_ICON_SIZE;
  return {
    frameSize,
    centerX: compactOuterSize / 2,
    centerY: compactOuterSize / 2,
    enterRadius: frameSize / 2,
    exitRadius: frameSize / 2 + 4,
  };
};

export const resolveMainWindowGeometry = ({
  mode,
  platform,
}: ResolveMainWindowGeometryOptions): MainWindowGeometry => {
  const visualShell = resolveVisualShell(mode, platform);
  const compactOuterSize = getMainWindowCompactOuterSize(platform);
  return {
    mode,
    platform,
    viewportSize: getMainWindowFullOuterSize(platform),
    visualShell,
    shadowShell: visualShell,
    compactReachableFrame: {
      x: 0,
      y: 0,
      width: compactOuterSize,
      height: compactOuterSize,
    },
    hotspot: resolveCompactHotspot(platform),
  };
};
