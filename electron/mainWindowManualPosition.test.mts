import { describe, expect, it } from "vitest";

import { resolveMainWindowManualPosition } from "./mainWindowManualPosition.mjs";

describe("resolveMainWindowManualPosition", () => {
  it.each([NaN, Infinity, -Infinity])(
    "rejects %s in either native coordinate",
    (nonFiniteCoordinate) => {
      expect(resolveMainWindowManualPosition({ x: nonFiniteCoordinate, y: 12 })).toBeNull();
      expect(resolveMainWindowManualPosition({ x: 12, y: nonFiniteCoordinate })).toBeNull();
    },
  );

  it("preserves finite negative and positive coordinate rounding", () => {
    expect(resolveMainWindowManualPosition({ x: -16.7, y: 23.2 })).toEqual({ x: -17, y: 23 });
  });
});
