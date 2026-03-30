import { describe, expect, it } from "vitest";

import {
  MAIN_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS,
  SECONDARY_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS,
  getRendererReadyAnimationFrameCount,
  getRendererReadyFallbackDelayMs,
  isSecondaryDesktopRoute,
  normalizeDesktopRoutePath,
  resolveDesktopBootstrapLanguage,
  resolveDesktopBootstrapTheme,
  resolveDesktopRoutePath,
} from "./desktopBootstrap";

describe("normalizeDesktopRoutePath", () => {
  it("normalizes empty and hash-only inputs to the main route", () => {
    expect(normalizeDesktopRoutePath(undefined)).toBe("/");
    expect(normalizeDesktopRoutePath("")).toBe("/");
    expect(normalizeDesktopRoutePath("#")).toBe("/");
  });

  it("strips hash prefixes and guarantees a leading slash", () => {
    expect(normalizeDesktopRoutePath("#/settings")).toBe("/settings");
    expect(normalizeDesktopRoutePath("settings")).toBe("/settings");
  });
});

describe("resolveDesktopRoutePath", () => {
  it("prefers the hash route when present", () => {
    expect(resolveDesktopRoutePath({
      hash: "#/settings",
      pathname: "/",
    })).toBe("/settings");
  });

  it("falls back to pathname when no hash route is set", () => {
    expect(resolveDesktopRoutePath({
      hash: "",
      pathname: "/context-menu",
    })).toBe("/context-menu");
  });
});

describe("secondary desktop routes", () => {
  it("recognizes secondary desktop windows", () => {
    expect(isSecondaryDesktopRoute("/settings")).toBe(true);
    expect(isSecondaryDesktopRoute("/context-menu")).toBe(true);
    expect(isSecondaryDesktopRoute("/ui-lab")).toBe(true);
  });

  it("keeps the main route on the slower readiness path", () => {
    expect(isSecondaryDesktopRoute("/")).toBe(false);
    expect(getRendererReadyFallbackDelayMs("/")).toBe(
      MAIN_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS,
    );
    expect(getRendererReadyAnimationFrameCount("/")).toBe(2);
  });

  it("uses the shorter readiness path for secondary windows", () => {
    expect(getRendererReadyFallbackDelayMs("/settings")).toBe(
      SECONDARY_WINDOW_RENDERER_READY_FALLBACK_DELAY_MS,
    );
    expect(getRendererReadyAnimationFrameCount("/settings")).toBe(1);
  });
});

describe("resolveDesktopBootstrapTheme", () => {
  it("reads the theme from a single config snapshot", () => {
    expect(resolveDesktopBootstrapTheme(JSON.stringify({ theme: "white" }))).toBe("white");
  });

  it("returns undefined when no config snapshot exists", () => {
    expect(resolveDesktopBootstrapTheme(undefined)).toBeUndefined();
  });
});

describe("resolveDesktopBootstrapLanguage", () => {
  it("reads the language from the same config snapshot", () => {
    expect(resolveDesktopBootstrapLanguage(JSON.stringify({ language: "zh-CN" }), "en-US")).toBe("zh-CN");
  });

  it("falls back to navigator language when config is unavailable", () => {
    expect(resolveDesktopBootstrapLanguage(undefined, "en-US")).toBe("en");
  });
});
