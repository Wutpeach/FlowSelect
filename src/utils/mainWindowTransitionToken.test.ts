import { describe, expect, it } from "vitest";

import {
  advanceMainWindowBoundsTransition,
  isMainWindowBoundsTransitionCurrent,
  type MainWindowBoundsTransitionState,
} from "./mainWindowTransitionToken";

describe("mainWindowTransitionToken", () => {
  it("increments the token whenever the target mode changes", () => {
    const initial: MainWindowBoundsTransitionState = {
      token: 0,
      target: "full",
    };

    expect(advanceMainWindowBoundsTransition(initial, "compact")).toEqual({
      token: 1,
      target: "compact",
    });

    expect(advanceMainWindowBoundsTransition({
      token: 1,
      target: "compact",
    }, "full")).toEqual({
      token: 2,
      target: "full",
    });
  });

  it("rejects stale compact callbacks after a newer full-mode request", () => {
    const compactRequest = advanceMainWindowBoundsTransition({
      token: 0,
      target: "full",
    }, "compact");
    const fullRequest = advanceMainWindowBoundsTransition(compactRequest, "full");

    expect(isMainWindowBoundsTransitionCurrent(
      fullRequest,
      compactRequest.token,
      "compact",
    )).toBe(false);

    expect(isMainWindowBoundsTransitionCurrent(
      fullRequest,
      fullRequest.token,
      "full",
    )).toBe(true);
  });

  it("requires both token and optional target to match", () => {
    const current: MainWindowBoundsTransitionState = {
      token: 4,
      target: "compact",
    };

    expect(isMainWindowBoundsTransitionCurrent(current, 4)).toBe(true);
    expect(isMainWindowBoundsTransitionCurrent(current, 4, "compact")).toBe(true);
    expect(isMainWindowBoundsTransitionCurrent(current, 4, "full")).toBe(false);
    expect(isMainWindowBoundsTransitionCurrent(current, 3, "compact")).toBe(false);
    expect(isMainWindowBoundsTransitionCurrent(current, null, "compact")).toBe(false);
  });
});
