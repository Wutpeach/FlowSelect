import { describe, expect, it } from "vitest";

import {
  resolvePanelPointerCaptureId,
  shouldPreventPanelNativeDragStart,
  shouldOpenOutputFolderFromPanelMouseDownDoubleClick,
} from "./mainPanelInteractions";

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

describe("resolvePanelPointerCaptureId", () => {
  it("prefers the pointer id from the current event", () => {
    expect(resolvePanelPointerCaptureId({
      eventPointerId: 7,
      activePointerId: 5,
      pendingPointerId: 3,
    })).toBe(7);
  });

  it("falls back to active or pending drag state when no event pointer id exists", () => {
    expect(resolvePanelPointerCaptureId({
      activePointerId: 5,
      pendingPointerId: 3,
    })).toBe(5);

    expect(resolvePanelPointerCaptureId({
      activePointerId: null,
      pendingPointerId: 3,
    })).toBe(3);
  });

  it("returns null when no pointer capture candidate exists", () => {
    expect(resolvePanelPointerCaptureId({})).toBeNull();
  });
});

describe("shouldPreventPanelNativeDragStart", () => {
  it("blocks native drags for ordinary panel content", () => {
    const target = {
      closest: () => null,
    } as unknown as EventTarget & { closest(selector: string): null };

    expect(shouldPreventPanelNativeDragStart(target)).toBe(true);
    expect(shouldPreventPanelNativeDragStart(null)).toBe(true);
  });

  it("allows explicit opt-in drag targets", () => {
    const target = {
      closest: (selector: string) => (
        selector === "[data-panel-native-drag='allow']" ? ({} as Element) : null
      ),
    } as unknown as EventTarget & { closest(selector: string): Element | null };

    expect(shouldPreventPanelNativeDragStart(target)).toBe(false);
  });

  it("allows descendants of an explicit opt-in drag target", () => {
    const child = {
      closest: (selector: string) => (
        selector === "[data-panel-native-drag='allow']" ? ({} as Element) : null
      ),
    } as unknown as EventTarget & { closest(selector: string): Element | null };

    expect(shouldPreventPanelNativeDragStart(child)).toBe(false);
  });
});
