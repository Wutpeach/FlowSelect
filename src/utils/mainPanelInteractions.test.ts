import { describe, expect, it } from "vitest";

import { shouldOpenOutputFolderFromPanelMouseDownDoubleClick } from "./mainPanelInteractions";

describe("shouldOpenOutputFolderFromPanelMouseDownDoubleClick", () => {
  it("uses the second mousedown as the macOS double-click shortcut trigger", () => {
    expect(shouldOpenOutputFolderFromPanelMouseDownDoubleClick({
      isMacOS: true,
      button: 0,
      detail: 2,
      canDoubleClickOpenOutputFolder: true,
      targetIgnored: false,
    })).toBe(true);
  });

  it("does not apply the mousedown shortcut on non-macOS platforms", () => {
    expect(shouldOpenOutputFolderFromPanelMouseDownDoubleClick({
      isMacOS: false,
      button: 0,
      detail: 2,
      canDoubleClickOpenOutputFolder: true,
      targetIgnored: false,
    })).toBe(false);
  });

  it("does not trigger for the first click or guarded UI targets", () => {
    expect(shouldOpenOutputFolderFromPanelMouseDownDoubleClick({
      isMacOS: true,
      button: 0,
      detail: 1,
      canDoubleClickOpenOutputFolder: true,
      targetIgnored: false,
    })).toBe(false);

    expect(shouldOpenOutputFolderFromPanelMouseDownDoubleClick({
      isMacOS: true,
      button: 0,
      detail: 2,
      canDoubleClickOpenOutputFolder: true,
      targetIgnored: true,
    })).toBe(false);
  });

  it("respects the existing panel availability guards", () => {
    expect(shouldOpenOutputFolderFromPanelMouseDownDoubleClick({
      isMacOS: true,
      button: 0,
      detail: 2,
      canDoubleClickOpenOutputFolder: false,
      targetIgnored: false,
    })).toBe(false);
  });
});
