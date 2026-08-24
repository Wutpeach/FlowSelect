import { describe, expect, it, vi } from "vitest";
import {
  LAB_COMPACT_ATTENTION_CENTER,
  resetLabCompactPointerToCenter,
  resolveLabCompactPointerPoint,
  updateLabCompactPointerFromClientPoint,
  type LabCompactPointerField,
} from "./compactPointerField";

const STAGE_RECT = { left: 10, top: 10, width: 80, height: 80 };

const createFakeField = () => ({
  x: { set: vi.fn() },
  y: { set: vi.fn() },
}) as unknown as LabCompactPointerField;

describe("Lab Compact pointer field", () => {
  it("converts client coordinates into 80x80 logical-frame points", () => {
    expect(resolveLabCompactPointerPoint(50, 50, STAGE_RECT)).toEqual({ x: 40, y: 40 });
    expect(resolveLabCompactPointerPoint(90, 90, {
      left: 10,
      top: 10,
      width: 160,
      height: 160,
    })).toEqual({ x: 40, y: 40 });
  });

  it("clamps points into the logical frame", () => {
    expect(resolveLabCompactPointerPoint(-50, 400, STAGE_RECT)).toEqual({ x: 0, y: 80 });
    expect(resolveLabCompactPointerPoint(1000, 10, STAGE_RECT)).toEqual({ x: 80, y: 0 });
  });

  it("maps cardinal and diagonal pre-hotspot approach samples without entering the shell", () => {
    expect(resolveLabCompactPointerPoint(16, 50, STAGE_RECT)).toEqual({ x: 6, y: 40 });
    expect(resolveLabCompactPointerPoint(84, 50, STAGE_RECT)).toEqual({ x: 74, y: 40 });
    expect(resolveLabCompactPointerPoint(22, 22, STAGE_RECT)).toEqual({ x: 12, y: 12 });
    expect(resolveLabCompactPointerPoint(78, 78, STAGE_RECT)).toEqual({ x: 68, y: 68 });
  });

  it("rejects non-finite input or empty geometry", () => {
    expect(resolveLabCompactPointerPoint(Number.NaN, 50, STAGE_RECT)).toBeNull();
    expect(resolveLabCompactPointerPoint(100, Number.POSITIVE_INFINITY, STAGE_RECT)).toBeNull();
    expect(resolveLabCompactPointerPoint(100, 50, { ...STAGE_RECT, width: 0 })).toBeNull();
  });

  it("writes logical-frame coordinates through MotionValue setters only", () => {
    const field = createFakeField();
    updateLabCompactPointerFromClientPoint(field, 50, 50, STAGE_RECT);
    expect(field.x.set).toHaveBeenCalledWith(40);
    expect(field.y.set).toHaveBeenCalledWith(40);
    expect(field.x.set).toHaveBeenCalledTimes(1);
    expect(field.y.set).toHaveBeenCalledTimes(1);
  });

  it("skips writes for invalid geometry", () => {
    const field = createFakeField();
    updateLabCompactPointerFromClientPoint(field, 50, 50, { ...STAGE_RECT, width: 0 });
    expect(field.x.set).not.toHaveBeenCalled();
    expect(field.y.set).not.toHaveBeenCalled();
  });

  it("resets the field to the Compact attention center", () => {
    const field = createFakeField();
    resetLabCompactPointerToCenter(field);
    expect(field.x.set).toHaveBeenCalledWith(LAB_COMPACT_ATTENTION_CENTER.x);
    expect(field.y.set).toHaveBeenCalledWith(LAB_COMPACT_ATTENTION_CENTER.y);
  });

  it("keeps the attention center at the production outer-frame center", () => {
    expect(LAB_COMPACT_ATTENTION_CENTER).toEqual({ x: 40, y: 40 });
  });
});
