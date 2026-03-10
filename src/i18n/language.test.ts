import { describe, expect, it } from "vitest";

import { LANGUAGE_CONFIG_KEY } from "./contract";
import {
  normalizeAppLanguage,
  resolveAppLanguage,
  resolveAppLanguageFromConfigString,
} from "./language";

describe("normalizeAppLanguage", () => {
  it("normalizes English variants to en", () => {
    expect(normalizeAppLanguage("en")).toBe("en");
    expect(normalizeAppLanguage("en-US")).toBe("en");
    expect(normalizeAppLanguage("EN_gb")).toBe("en");
  });

  it("normalizes Chinese variants to zh-CN", () => {
    expect(normalizeAppLanguage("zh")).toBe("zh-CN");
    expect(normalizeAppLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeAppLanguage("zh_Hans")).toBe("zh-CN");
    expect(normalizeAppLanguage("zh-TW")).toBe("zh-CN");
  });

  it("returns null for unsupported values", () => {
    expect(normalizeAppLanguage("fr-FR")).toBeNull();
    expect(normalizeAppLanguage("")).toBeNull();
    expect(normalizeAppLanguage(undefined)).toBeNull();
  });
});

describe("resolveAppLanguage", () => {
  it("prefers config.language over navigator.language", () => {
    expect(resolveAppLanguage("zh", "en-US")).toBe("zh-CN");
    expect(resolveAppLanguage("en", "zh-CN")).toBe("en");
  });

  it("falls back to navigator.language when config.language is invalid", () => {
    expect(resolveAppLanguage("fr-FR", "zh-CN")).toBe("zh-CN");
  });

  it("falls back to en when neither source is supported", () => {
    expect(resolveAppLanguage(undefined, "fr-FR")).toBe("en");
  });
});

describe("resolveAppLanguageFromConfigString", () => {
  it("reads the configured language key from config JSON", () => {
    expect(
      resolveAppLanguageFromConfigString(
        JSON.stringify({ [LANGUAGE_CONFIG_KEY]: "zh_hans" }),
        "en-US",
      ),
    ).toBe("zh-CN");
  });

  it("falls back safely when config JSON is invalid", () => {
    expect(resolveAppLanguageFromConfigString("{", "fr-FR")).toBe("en");
  });
});
