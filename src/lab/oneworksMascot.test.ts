import { describe, expect, it } from "vitest";
import {
  ONEWORKS_POSE_PRESETS,
  ONEWORKS_SWEEP_POSES,
  createOneWorksCatDefinition,
  resolveOneWorksPointerPose,
  withOneWorksPose,
} from "./oneworksMascot";

describe("OneWorks Route A cat fixture", () => {
  it("keeps the pinned cat as two occluded cone ears plus one face head", () => {
    const definition = createOneWorksCatDefinition();
    expect(definition.scene.entity.preset).toBe("cat");
    expect(definition.scene.entity.parts).toHaveLength(3);
    expect(definition.scene.entity.parts.map((part) => part.shape)).toEqual([
      "cone",
      "cone",
      "ellipse",
    ]);
    expect(definition.scene.entity.parts.filter((part) => part.occludedByFace)).toHaveLength(2);
    expect(definition.scene.entity.parts.filter((part) => part.face)).toHaveLength(1);
  });

  it("derives evidence poses without mutating the shared controlled definition", () => {
    const definition = createOneWorksCatDefinition();
    const posed = withOneWorksPose(definition, ONEWORKS_POSE_PRESETS[3].view);
    expect(posed).not.toBe(definition);
    expect(posed.scene.view).toMatchObject(ONEWORKS_POSE_PRESETS[3].view);
    expect(definition.scene.view).not.toMatchObject(ONEWORKS_POSE_PRESETS[3].view);
  });

  it("covers a complete yaw rotation with front, both tangents, and both rear closure samples", () => {
    expect(ONEWORKS_SWEEP_POSES).toHaveLength(9);
    expect(ONEWORKS_SWEEP_POSES.every((pose) => pose.view.pitch === 0)).toBe(true);
    expect(ONEWORKS_SWEEP_POSES.map((pose) => pose.id)).toEqual([
      "yaw--180",
      "yaw--135",
      "yaw--90",
      "yaw--55",
      "front",
      "yaw-55",
      "yaw-90",
      "yaw-135",
      "yaw-180",
    ]);
    expect(ONEWORKS_SWEEP_POSES.filter((pose) => Math.abs(pose.view.yaw) === Math.PI / 2)).toHaveLength(2);
    expect(ONEWORKS_SWEEP_POSES.filter((pose) => Math.abs(pose.view.yaw) === Math.PI)).toHaveLength(2);
    expect(ONEWORKS_SWEEP_POSES.find((pose) => pose.view.yaw === 0)?.id).toBe("front");
    expect(ONEWORKS_SWEEP_POSES[ONEWORKS_SWEEP_POSES.length - 1]?.label).toContain("closure");
  });
});

describe("OneWorks Lab pointer adapter", () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };

  it("maps the Lab host center to the deterministic front pose", () => {
    expect(resolveOneWorksPointerPose(110, 70, rect)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("clamps bounded upstream yaw and pitch without production Pointer Field state", () => {
    expect(resolveOneWorksPointerPose(-100, 300, rect)).toEqual({ yaw: -0.96, pitch: 0.49 });
    expect(resolveOneWorksPointerPose(500, -100, rect)).toEqual({ yaw: 0.96, pitch: -0.49 });
  });

  it("rejects invalid browser geometry", () => {
    expect(resolveOneWorksPointerPose(Number.NaN, 70, rect)).toBeNull();
    expect(resolveOneWorksPointerPose(110, 70, { ...rect, width: 0 })).toBeNull();
  });
});
