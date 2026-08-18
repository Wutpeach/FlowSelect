import { join } from "node:path";
import { pathToFileURL } from "node:url";

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WindowLike = {
  isDestroyed(): boolean;
  getBounds(): Bounds;
};

type SecondaryWindowLabels = {
  main: string;
  settings: string;
  contextMenu: string;
};

export type SecondaryWindowOpenOptions = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  center?: boolean;
  [key: string]: unknown;
};

export const resolveBaseRendererUrl = (
  env: Record<string, string | undefined>,
): string => {
  const envUrl = env.AMEOW_FRONTEND_URL ?? env.AMEOW_ELECTRON_DEV_SERVER_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  return "http://127.0.0.1:1420";
};

export const buildRendererRoute = (
  routePath: string,
  options: {
    isPackaged: boolean;
    repoRoot: string;
    env?: Record<string, string | undefined>;
  },
): string => {
  const normalizedRoute = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (!options.isPackaged) {
    return `${resolveBaseRendererUrl(options.env ?? process.env)}#${normalizedRoute}`;
  }

  return `${pathToFileURL(join(options.repoRoot, "dist", "index.html")).toString()}#${normalizedRoute}`;
};

export const secondaryWindowRoute = (
  label: string,
  labels: Pick<SecondaryWindowLabels, "settings" | "contextMenu">,
): string => {
  if (label === labels.settings) {
    return "/settings";
  }
  if (label === labels.contextMenu) {
    return "/context-menu";
  }
  throw new Error(`Unsupported secondary window label: ${label}`);
};

export const resolveSecondaryWindowAnchorLabel = (
  label: string,
  options: {
    labels: SecondaryWindowLabels;
    getWindow(label: string): WindowLike | null;
  },
): string | null => {
  if (label === options.labels.settings) {
    return options.labels.main;
  }
  return null;
};


export const resolveSecondaryWindowOpenOptions = (
  label: string,
  openOptions: SecondaryWindowOpenOptions,
  options: {
    labels: SecondaryWindowLabels;
    getWindow(label: string): WindowLike | null;
    getDisplayWorkArea(anchorBounds: Bounds): Bounds;
    settingsGap: number;
    edgePadding: number;
  },
): SecondaryWindowOpenOptions => {
  if (
    typeof openOptions?.x === "number"
    || typeof openOptions?.y === "number"
    || openOptions?.center === true
  ) {
    return openOptions;
  }

  const anchorLabel = resolveSecondaryWindowAnchorLabel(label, options);
  if (!anchorLabel) {
    return openOptions;
  }

  const anchorWindow = options.getWindow(anchorLabel);
  if (!anchorWindow || anchorWindow.isDestroyed()) {
    return openOptions;
  }

  const anchorBounds = anchorWindow.getBounds();
  const workArea = options.getDisplayWorkArea(anchorBounds);
  const gap = options.settingsGap;
  const minX = workArea.x + options.edgePadding;
  const minY = workArea.y + options.edgePadding;
  const maxX = workArea.x + workArea.width - openOptions.width - options.edgePadding;
  const maxY = workArea.y + workArea.height - openOptions.height - options.edgePadding;

  let x = anchorBounds.x + anchorBounds.width + gap;
  const y = anchorBounds.y;

  if (x > maxX) {
    x = anchorBounds.x - openOptions.width - gap;
  }

  return {
    ...openOptions,
    center: false,
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
};
