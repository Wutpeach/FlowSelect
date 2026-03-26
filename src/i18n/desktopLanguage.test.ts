import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, i18nState, changeLanguageMock } = vi.hoisted(() => {
  const state = {
    resolvedLanguage: "en" as "en" | "zh-CN",
  };

  return {
    invokeMock: vi.fn(),
    i18nState: state,
    changeLanguageMock: vi.fn(async (language: "en" | "zh-CN") => {
      state.resolvedLanguage = language;
    }),
  };
});

vi.mock("../desktop/runtime", () => ({
  desktopCommands: {
    invoke: invokeMock,
  },
}));

vi.mock("./index", () => ({
  default: {
    get resolvedLanguage() {
      return i18nState.resolvedLanguage;
    },
    changeLanguage: changeLanguageMock,
  },
}));

import { LANGUAGE_CONFIG_KEY } from "./contract";
import { changeDesktopLanguage } from "./desktopLanguage";

describe("changeDesktopLanguage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    changeLanguageMock.mockClear();
    i18nState.resolvedLanguage = "en";
  });

  it("safely falls back to an empty config object when stored config JSON is invalid", async () => {
    invokeMock.mockResolvedValueOnce("{").mockResolvedValueOnce(undefined);

    await changeDesktopLanguage("zh-CN");

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_config");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_config", {
      json: JSON.stringify({ [LANGUAGE_CONFIG_KEY]: "zh-CN" }),
    });
    expect(changeLanguageMock).toHaveBeenCalledWith("zh-CN");
  });

  it("does not call changeLanguage when the requested language is already active", async () => {
    i18nState.resolvedLanguage = "zh-CN";
    invokeMock.mockResolvedValueOnce("{}").mockResolvedValueOnce(undefined);

    await changeDesktopLanguage("zh-CN");

    expect(changeLanguageMock).not.toHaveBeenCalled();
  });
});
