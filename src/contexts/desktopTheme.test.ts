import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("../desktop/runtime", () => ({
  desktopCommands: {
    invoke: invokeMock,
  },
  desktopEvents: {
    on: vi.fn(async () => () => {}),
    emit: vi.fn(async () => undefined),
  },
}));

import { DEFAULT_THEME, resolveThemeFromConfigString } from "./theme";
import { resolveInitialDesktopTheme } from "./desktopTheme";

describe("resolveThemeFromConfigString", () => {
  it("uses the persisted desktop theme when the config string is valid", () => {
    expect(resolveThemeFromConfigString(JSON.stringify({ theme: "white" }))).toBe("white");
  });

  it("falls back to the default theme when config JSON is invalid", () => {
    expect(resolveThemeFromConfigString("{")).toBe(DEFAULT_THEME);
  });
});

describe("resolveInitialDesktopTheme", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads the persisted theme before desktop bootstrap render", async () => {
    invokeMock.mockResolvedValueOnce(JSON.stringify({ theme: "white" }));

    await expect(resolveInitialDesktopTheme()).resolves.toBe("white");

    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith("get_config");
  });

  it("falls back to the default theme when desktop config loading fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce(new Error("config unavailable"));

    await expect(resolveInitialDesktopTheme()).resolves.toBe(DEFAULT_THEME);

    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith("get_config");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
