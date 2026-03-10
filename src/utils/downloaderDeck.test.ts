import { describe, expect, it } from "vitest";

import {
  DOWNLOADER_DECK_WHEEL_THRESHOLD,
  consumeDownloaderDeckWheelDelta,
  getDownloaderDeckDirection,
  moveDownloaderDeckIndex,
} from "./downloaderDeck";

describe("moveDownloaderDeckIndex", () => {
  it("wraps forward from the last card back to the first", () => {
    expect(moveDownloaderDeckIndex(1, 1, 2)).toBe(0);
  });

  it("wraps backward from the first card to the last", () => {
    expect(moveDownloaderDeckIndex(0, -1, 2)).toBe(1);
  });
});

describe("getDownloaderDeckDirection", () => {
  it("maps positive wheel deltas to next-card navigation", () => {
    expect(getDownloaderDeckDirection(24)).toBe(1);
  });

  it("maps negative wheel deltas to previous-card navigation", () => {
    expect(getDownloaderDeckDirection(-24)).toBe(-1);
  });

  it("returns zero for neutral wheel deltas", () => {
    expect(getDownloaderDeckDirection(0)).toBe(0);
  });
});

describe("consumeDownloaderDeckWheelDelta", () => {
  it("keeps accumulating trackpad deltas until the threshold is reached", () => {
    expect(consumeDownloaderDeckWheelDelta(0, 18)).toEqual({
      accumulatedDelta: 18,
      direction: 0,
    });

    expect(consumeDownloaderDeckWheelDelta(18, 20)).toEqual({
      accumulatedDelta: 38,
      direction: 0,
    });
  });

  it("fires once and resets accumulation after crossing the forward threshold", () => {
    expect(
      consumeDownloaderDeckWheelDelta(40, 12, DOWNLOADER_DECK_WHEEL_THRESHOLD),
    ).toEqual({
      accumulatedDelta: 0,
      direction: 1,
    });
  });

  it("fires once and resets accumulation after crossing the backward threshold", () => {
    expect(
      consumeDownloaderDeckWheelDelta(-32, -18, DOWNLOADER_DECK_WHEEL_THRESHOLD),
    ).toEqual({
      accumulatedDelta: 0,
      direction: -1,
    });
  });
});
