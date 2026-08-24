import { describe, expect, it, vi } from "vitest";

import {
  cancelMainWindowCompactReachability,
  ensureMainWindowCompactReachable,
  resolveCompactReachablePosition,
} from "./mainWindowSurfacePolicy.mjs";

const monitor = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
};

const screenApi = {
  getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
};

describe("resolveCompactReachablePosition", () => {
  it("keeps the current position when the compact frame is already visible", () => {
    expect(resolveCompactReachablePosition({
      bounds: { x: 120, y: 160, width: 200, height: 200 },
      frameSize: 80,
      edgePadding: 8,
      monitor,
    })).toEqual({ x: 120, y: 160 });
  });

  it("moves the compact frame inside the left and top monitor edges", () => {
    expect(resolveCompactReachablePosition({
      bounds: { x: -72, y: -24, width: 200, height: 200 },
      frameSize: 80,
      edgePadding: 8,
      monitor,
    })).toEqual({ x: 8, y: 8 });
  });

  it("moves the compact frame inside the right and bottom monitor edges", () => {
    expect(resolveCompactReachablePosition({
      bounds: { x: 1900, y: 1040, width: 200, height: 200 },
      frameSize: 80,
      edgePadding: 8,
      monitor,
    })).toEqual({ x: 1832, y: 992 });
  });

  it("respects work areas whose origin is offset", () => {
    expect(resolveCompactReachablePosition({
      bounds: { x: -1300, y: 12, width: 200, height: 200 },
      frameSize: 80,
      edgePadding: 8,
      monitor: {
        position: { x: -1280, y: 38 },
        size: { width: 1280, height: 984 },
      },
    })).toEqual({ x: -1272, y: 46 });
  });

  it("falls back to normalized current position when monitor lookup is unavailable", () => {
    expect(resolveCompactReachablePosition({
      bounds: { x: -72.4, y: 20.6, width: 199.4, height: 200.5 },
      frameSize: 80,
      edgePadding: 8,
      monitor: null,
    })).toEqual({ x: -72, y: 21 });
  });
});

describe("ensureMainWindowCompactReachable", () => {
  it("snaps instantly under reduced motion", async () => {
    const win = {
      id: 1,
      isDestroyed: () => false,
      getBounds: () => ({ x: -100, y: 0, width: 228, height: 228 }),
      setPosition: vi.fn(),
    } as unknown as Parameters<typeof ensureMainWindowCompactReachable>[0];

    const result = await ensureMainWindowCompactReachable(win, {
      reachableFrameSize: 80,
      edgePadding: 8,
      reducedMotion: true,
      requestEpoch: 9,
    }, screenApi);

    expect(result).toEqual({ requestEpoch: 9, position: { x: 8, y: 8 } });
    expect(win.setPosition).toHaveBeenCalledWith(8, 8);
  });

  it("returns unchanged position without moving when already reachable", async () => {
    const win = {
      id: 2,
      isDestroyed: () => false,
      getBounds: () => ({ x: 120, y: 160, width: 228, height: 228 }),
      setPosition: vi.fn(),
    } as unknown as Parameters<typeof ensureMainWindowCompactReachable>[0];

    const result = await ensureMainWindowCompactReachable(win, {
      reachableFrameSize: 80,
      edgePadding: 8,
      reducedMotion: false,
      requestEpoch: 10,
    }, screenApi);

    expect(result).toEqual({ requestEpoch: 10, position: { x: 120, y: 160 } });
    expect(win.setPosition).not.toHaveBeenCalled();
  });

  it("cancels an active correction so a newer surface cannot be moved", async () => {
    vi.useFakeTimers();
    try {
      const win = {
        id: 3,
        isDestroyed: () => false,
        getBounds: () => ({ x: -100, y: 0, width: 228, height: 228 }),
        setPosition: vi.fn(),
      } as unknown as Parameters<typeof ensureMainWindowCompactReachable>[0];

      const first = ensureMainWindowCompactReachable(win, {
        reachableFrameSize: 80,
        edgePadding: 8,
        reducedMotion: false,
        requestEpoch: 1,
      }, screenApi);
      // The initial synchronous frame writes the unchanged start position.
      const callCountAfterStart = win.setPosition.mock.calls.length;

      cancelMainWindowCompactReachability(win);
      vi.advanceTimersByTime(1000);
      await first;

      // No further frames ran after cancellation: the stale correction cannot
      // move the surface toward the clamped target.
      expect(win.setPosition.mock.calls.length).toBe(callCountAfterStart);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves quietly for a destroyed window without touching getBounds", async () => {
    const win = {
      id: 5,
      isDestroyed: () => true,
      // getBounds() throws on a real destroyed BrowserWindow; any call would
      // fail the test, proving the policy never reads bounds there.
      getBounds: () => {
        throw new Error("BrowserWindow.getBounds() on destroyed window");
      },
      setPosition: vi.fn(),
    } as unknown as Parameters<typeof ensureMainWindowCompactReachable>[0];

    const result = await ensureMainWindowCompactReachable(win, {
      reachableFrameSize: 80,
      edgePadding: 8,
      reducedMotion: false,
      requestEpoch: 21,
    }, screenApi);

    expect(result).toEqual({ requestEpoch: 21, position: { x: 0, y: 0 } });
    expect(win.setPosition).not.toHaveBeenCalled();
  });

  it("cancelMainWindowCompactReachability is safe with no active correction", () => {
    const win = {
      id: 4,
      isDestroyed: () => false,
    } as unknown as Parameters<typeof cancelMainWindowCompactReachability>[0];
    expect(() => cancelMainWindowCompactReachability(win)).not.toThrow();
  });
});
