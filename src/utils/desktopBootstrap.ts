import type { Theme } from "../contexts/theme";
import { resolveThemeFromConfigString } from "../contexts/theme";
import type { AppLanguage } from "../i18n/contract";
import { resolveAppLanguage, resolveAppLanguageFromConfigString } from "../i18n/language";

export const MAIN_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS = 180;
export const SECONDARY_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS = 24;

const SECONDARY_WINDOW_ROUTES = new Set([
  "/settings",
  "/context-menu",
  "/ui-lab",
]);

export const normalizeDesktopRoutePath = (rawPath: string | null | undefined): string => {
  if (typeof rawPath !== "string") {
    return "/";
  }

  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === "#") {
    return "/";
  }

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!withoutHash) {
    return "/";
  }

  return withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
};

export const resolveDesktopRoutePath = ({
  hash,
  pathname,
}: {
  hash?: string | null;
  pathname?: string | null;
}): string => {
  const normalizedHash = normalizeDesktopRoutePath(hash);
  if (normalizedHash !== "/") {
    return normalizedHash;
  }

  return normalizeDesktopRoutePath(pathname);
};

export const isSecondaryDesktopRoute = (routePath: string): boolean => (
  SECONDARY_WINDOW_ROUTES.has(normalizeDesktopRoutePath(routePath))
);

export const getRendererReadyFallbackDelayMs = (routePath: string): number => (
  isSecondaryDesktopRoute(routePath)
    ? SECONDARY_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS
    : MAIN_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS
);

export const getRendererReadyAnimationFrameCount = (routePath: string): 1 | 2 => (
  isSecondaryDesktopRoute(routePath) ? 1 : 2
);

export const resolveDesktopBootstrapTheme = (
  configStr: string | null | undefined,
): Theme | undefined => (
  typeof configStr === "string"
    ? resolveThemeFromConfigString(configStr)
    : undefined
);

export const resolveDesktopBootstrapLanguage = (
  configStr: string | null | undefined,
  navigatorLanguage?: string | null,
): AppLanguage => (
  typeof configStr === "string"
    ? resolveAppLanguageFromConfigString(configStr, navigatorLanguage)
    : resolveAppLanguage(undefined, navigatorLanguage)
);
