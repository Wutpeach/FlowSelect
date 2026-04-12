import { describe, expect, it } from "vitest";

import { isPointInsideCompactPointerHotspot } from "./compactPointerHotspot";

describe("compactPointerHotspot", () => {
  const baseInput = {
    centerX: 40,
    centerY: 40,
    enterRadius: 18,
    exitRadius: 22,
  };

  it("enters the hotspot only after crossing the enter radius", () => {
    expect(isPointInsideCompactPointerHotspot({
      ...baseInput,
      pointX: 58,
      pointY: 40,
      wasInside: false,
    })).toBe(true);

    expect(isPointInsideCompactPointerHotspot({
      ...baseInput,
      pointX: 59,
      pointY: 40,
      wasInside: false,
    })).toBe(false);
  });

  it("keeps the hotspot active inside the larger exit radius", () => {
    expect(isPointInsideCompactPointerHotspot({
      ...baseInput,
      pointX: 61,
      pointY: 40,
      wasInside: true,
    })).toBe(true);
  });

  it("drops out of the hotspot after crossing the exit radius", () => {
    expect(isPointInsideCompactPointerHotspot({
      ...baseInput,
      pointX: 63,
      pointY: 40,
      wasInside: true,
    })).toBe(false);
  });
});
