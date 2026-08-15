import { describe, expect, it, vi } from "vitest";
import {
  resetPointerFieldToCenter,
  resolvePointerFieldCenterPoint,
  resolvePointerFieldPoint,
  snapshotClientPointOrigin,
  snapshotPointerFieldOrigin,
  updatePointerFieldFromClientPoint,
  type MainWindowPointerField,
} from "./pointerField";

const ROOT_RECT = { left: 14, top: 14, width: 200, height: 200 };

const createFakeField = () => ({
  x: { get: vi.fn(() => 86), set: vi.fn() },
  y: { get: vi.fn(() => 36), set: vi.fn() },
}) as unknown as MainWindowPointerField;

describe("Main Window Pointer Field", () => {
  it("converts client coordinates into stable-root-relative points", () => {
    expect(resolvePointerFieldPoint(100, 50, ROOT_RECT)).toEqual({ x: 86, y: 36 });
  });

  it("clamps points into the stable root rect", () => {
    expect(resolvePointerFieldPoint(-50, 400, ROOT_RECT)).toEqual({ x: 0, y: 200 });
    expect(resolvePointerFieldPoint(1000, 10, ROOT_RECT)).toEqual({ x: 200, y: 0 });
  });

  it("rejects non-finite input or empty geometry", () => {
    expect(resolvePointerFieldPoint(Number.NaN, 50, ROOT_RECT)).toBeNull();
    expect(resolvePointerFieldPoint(100, Number.POSITIVE_INFINITY, ROOT_RECT)).toBeNull();
    expect(resolvePointerFieldPoint(100, 50, { ...ROOT_RECT, width: 0 })).toBeNull();
  });

  it("resolves and validates the stable root center", () => {
    expect(resolvePointerFieldCenterPoint(200)).toEqual({ x: 100, y: 100 });
    expect(resolvePointerFieldCenterPoint(0)).toBeNull();
    expect(resolvePointerFieldCenterPoint(Number.NaN)).toBeNull();
  });

  it("writes root-relative coordinates through MotionValue setters only", () => {
    const field = createFakeField();
    updatePointerFieldFromClientPoint(field, 100, 50, ROOT_RECT);
    expect(field.x.set).toHaveBeenCalledWith(86);
    expect(field.y.set).toHaveBeenCalledWith(36);
    expect(field.x.set).toHaveBeenCalledTimes(1);
    expect(field.y.set).toHaveBeenCalledTimes(1);
  });

  it("skips Pointer Field writes for invalid geometry", () => {
    const field = createFakeField();
    updatePointerFieldFromClientPoint(field, 100, 50, { ...ROOT_RECT, width: 0 });
    resetPointerFieldToCenter(field, 0);
    expect(field.x.set).not.toHaveBeenCalled();
    expect(field.y.set).not.toHaveBeenCalled();
  });

  it("resets the Pointer Field to center on semantic leave", () => {
    const field = createFakeField();
    resetPointerFieldToCenter(field, 200);
    expect(field.x.set).toHaveBeenCalledWith(100);
    expect(field.y.set).toHaveBeenCalledWith(100);
  });
});

describe("Presentation causal origins", () => {
  it("normalizes a synchronous drop point and clamps it to its captured surface", () => {
    expect(snapshotClientPointOrigin(75, 50, { left: 25, top: 0, width: 100, height: 100 }))
      .toEqual({ x: 0.5, y: 0.5 });
    expect(snapshotClientPointOrigin(1000, -20, { left: 0, top: 0, width: 100, height: 100 }))
      .toEqual({ x: 1, y: 0 });
  });

  it("snapshots the current in-surface field without retaining a later pointer read", () => {
    let x = 20;
    let y = 80;
    const field = {
      x: { get: () => x },
      y: { get: () => y },
    } as MainWindowPointerField;
    const snapshot = snapshotPointerFieldOrigin(field, 100);
    x = 90;
    y = 10;
    expect(snapshot).toEqual({ x: 0.2, y: 0.8 });
    expect(snapshotPointerFieldOrigin(field, 0)).toBeUndefined();
  });
});
