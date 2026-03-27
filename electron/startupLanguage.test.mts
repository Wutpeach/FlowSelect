import { describe, expect, it } from "vitest";

import {
  normalizeAppLanguage,
  resolveStartupLanguageFromConfig,
} from "./startupLanguage.mjs";

describe("normalizeAppLanguage", () => {
  it("normalizes english and chinese variants", () => {
    expect(normalizeAppLanguage("en-US")).toBe("en");
    expect(normalizeAppLanguage("zh_Hant")).toBe("zh-CN");
  });

  it("returns null for unsupported values", () => {
    expect(normalizeAppLanguage("fr-FR")).toBeNull();
    expect(normalizeAppLanguage(undefined)).toBeNull();
  });
});

describe("resolveStartupLanguageFromConfig", () => {
  it("prefers config.language over the system locale", () => {
    expect(
      resolveStartupLanguageFromConfig(
        JSON.stringify({ language: "en" }),
        "zh-CN",
        { persistResolvedLanguage: true },
      ),
    ).toEqual({
      language: "en",
      nextConfigRaw: null,
    });
  });

  it("persists the normalized system locale when config.language is missing", () => {
    expect(
      resolveStartupLanguageFromConfig(
        JSON.stringify({ theme: "black" }),
        "zh-Hant",
        { persistResolvedLanguage: true },
      ),
    ).toEqual({
      language: "zh-CN",
      nextConfigRaw: JSON.stringify({
        theme: "black",
        language: "zh-CN",
      }),
    });
  });

  it("falls back safely without rewriting invalid config", () => {
    expect(
      resolveStartupLanguageFromConfig(
        "{",
        "zh-CN",
        { persistResolvedLanguage: true },
      ),
    ).toEqual({
      language: "zh-CN",
      nextConfigRaw: null,
    });
  });

  it("uses english without forcing a write when no config file exists yet", () => {
    expect(
      resolveStartupLanguageFromConfig(
        "{}",
        "fr-FR",
        { persistResolvedLanguage: false },
      ),
    ).toEqual({
      language: "en",
      nextConfigRaw: null,
    });
  });
});
