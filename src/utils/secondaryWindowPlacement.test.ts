import { describe, expect, it } from "vitest";

import { resolveSecondaryWindowPosition } from "./secondaryWindowPlacement";

describe("resolveSecondaryWindowPosition", () => {
  it("places the target window to the right of the anchor when space is available", () => {
    expect(resolveSecondaryWindowPosition({
      anchorPosition: { x: 120, y: 160 },
      anchorSize: { width: 320, height: 400 },
      targetSize: { width: 420, height: 560 },
      gap: 16,
      edgePadding: 8,
      scaleFactor: 1,
      monitor: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
        scaleFactor: 1,
      },
    })).toEqual({ x: 456, y: 160 });
  });

  it("falls back to the left when the preferred right-side placement would overflow", () => {
    expect(resolveSecondaryWindowPosition({
      anchorPosition: { x: 1300, y: 160 },
      anchorSize: { width: 320, height: 400 },
      targetSize: { width: 420, height: 560 },
      gap: 16,
      edgePadding: 8,
      scaleFactor: 1,
      monitor: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
        scaleFactor: 1,
      },
    })).toEqual({ x: 864, y: 160 });
  });

  it("clamps the target position within the current monitor bounds", () => {
    expect(resolveSecondaryWindowPosition({
      anchorPosition: { x: 120, y: 900 },
      anchorSize: { width: 320, height: 400 },
      targetSize: { width: 420, height: 560 },
      gap: 16,
      edgePadding: 8,
      scaleFactor: 1,
      monitor: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
        scaleFactor: 1,
      },
    })).toEqual({ x: 456, y: 512 });
  });

  it("keeps placement inside the monitor work area when the usable origin is offset", () => {
    expect(resolveSecondaryWindowPosition({
      anchorPosition: { x: 24, y: 32 },
      anchorSize: { width: 320, height: 400 },
      targetSize: { width: 420, height: 560 },
      gap: 16,
      edgePadding: 8,
      scaleFactor: 1,
      monitor: {
        position: { x: 0, y: 38 },
        size: { width: 1512, height: 945 },
        scaleFactor: 1,
      },
    })).toEqual({ x: 360, y: 46 });
  });

  it("returns logical coordinates after applying scale-aware placement math", () => {
    expect(resolveSecondaryWindowPosition({
      anchorPosition: { x: 400, y: 300 },
      anchorSize: { width: 320, height: 400 },
      targetSize: { width: 420, height: 560 },
      gap: 16,
      edgePadding: 8,
      scaleFactor: 2,
      monitor: {
        position: { x: 0, y: 0 },
        size: { width: 3840, height: 2160 },
        scaleFactor: 2,
      },
    })).toEqual({ x: 376, y: 150 });
  });
});
