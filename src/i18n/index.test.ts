import { beforeEach, describe, expect, it, vi } from "vitest";

import { FALLBACK_LANGUAGE } from "./contract";
import {
  initializeI18nInstance,
  type I18nInstanceAdapter,
} from "./index";

type MockState = {
  isInitialized: boolean;
  resolvedLanguage?: string;
};

function createMockI18nInstance() {
  const state: MockState = {
    isInitialized: false,
    resolvedLanguage: undefined,
  };

  const init = vi.fn(async (options: { lng: "en" | "zh-CN" }) => {
    state.isInitialized = true;
    state.resolvedLanguage = options.lng;
  });
  const chain = { init };

  const instance = {
    get isInitialized() {
      return state.isInitialized;
    },
    get resolvedLanguage() {
      return state.resolvedLanguage;
    },
    use: vi.fn(() => chain),
    init,
    changeLanguage: vi.fn(async (language) => {
      state.resolvedLanguage = language;
    }),
  } as unknown as I18nInstanceAdapter;

  return {
    instance,
    init,
    state,
  };
}

describe("initializeI18nInstance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes the requested language on first boot", async () => {
    const { instance, init, state } = createMockI18nInstance();

    await initializeI18nInstance(instance, "zh-CN");

    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        lng: "zh-CN",
        fallbackLng: FALLBACK_LANGUAGE,
      }),
    );
    expect(state.resolvedLanguage).toBe("zh-CN");
  });

  it("retries with English when the requested language fails to initialize", async () => {
    const { instance, init, state } = createMockI18nInstance();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    init
      .mockRejectedValueOnce(new Error("zh locale failed"))
      .mockImplementationOnce(async (options: { lng: "en" | "zh-CN" }) => {
        state.isInitialized = true;
        state.resolvedLanguage = options.lng;
      });

    await initializeI18nInstance(instance, "zh-CN");

    expect(init).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lng: "zh-CN" }),
    );
    expect(init).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lng: FALLBACK_LANGUAGE }),
    );
    expect(state.resolvedLanguage).toBe(FALLBACK_LANGUAGE);
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
