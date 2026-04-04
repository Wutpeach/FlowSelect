import { describe, expect, it, vi } from "vitest";

import {
  applyMacTrayAppMode,
  shouldUseMacTrayAppMode,
} from "./macAppVisibility.mjs";

describe("shouldUseMacTrayAppMode", () => {
  it("enables tray app mode only on macOS", () => {
    expect(shouldUseMacTrayAppMode({ platform: "darwin" })).toBe(true);
    expect(shouldUseMacTrayAppMode({ platform: "win32" })).toBe(false);
    expect(shouldUseMacTrayAppMode({ platform: "linux" })).toBe(false);
  });
});

describe("applyMacTrayAppMode", () => {
  it("switches macOS apps to accessory mode and hides the Dock icon", () => {
    const electronApp = {
      setActivationPolicy: vi.fn(),
      dock: {
        hide: vi.fn(),
      },
    };

    expect(applyMacTrayAppMode(electronApp, { platform: "darwin" })).toBe(true);
    expect(electronApp.setActivationPolicy).toHaveBeenCalledWith("accessory");
    expect(electronApp.dock.hide).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside macOS", () => {
    const electronApp = {
      setActivationPolicy: vi.fn(),
      dock: {
        hide: vi.fn(),
      },
    };

    expect(applyMacTrayAppMode(electronApp, { platform: "win32" })).toBe(false);
    expect(electronApp.setActivationPolicy).not.toHaveBeenCalled();
    expect(electronApp.dock.hide).not.toHaveBeenCalled();
  });

  it("tolerates missing optional mac-only Electron APIs", () => {
    expect(applyMacTrayAppMode({}, { platform: "darwin" })).toBe(true);
  });
});
