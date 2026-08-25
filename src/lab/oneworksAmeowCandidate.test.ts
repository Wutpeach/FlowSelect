import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ONEWORKS_AMEOW_ACTION_IDS,
  ONEWORKS_AMEOW_CANDIDATE_CHECKSUM,
  ONEWORKS_AMEOW_CANDIDATE_ID,
  ONEWORKS_AMEOW_LAB_POSE_ENVELOPE,
  createOneWorksAmeowCandidateDefinition,
  getOneWorksAmeowActionClip,
  loadOneWorksAmeowCandidate,
  resolveOneWorksAmeowAttentionPreview,
  serializeOneWorksAmeowCandidate,
  withOneWorksAmeowActionPreview,
} from "./oneworksAmeowCandidate";

const CENTER = { x: 48, y: 48 };
const canonicalArtifact = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  "../../.trellis/tasks/08-25-oneworks-ameow-mascot-visual-candidate/canonical-candidate.json",
), "utf8"));

describe("Ameow OneWorks canonical Lab candidate", () => {
  it("keeps one identifiable three-part cone candidate", () => {
    const definition = createOneWorksAmeowCandidateDefinition();
    expect(definition.metadata?.id).toBe(ONEWORKS_AMEOW_CANDIDATE_ID);
    expect(definition.scene.entity.parts.map((part) => part.shape)).toEqual([
      "cone",
      "cone",
      "ellipse",
    ]);
    expect(definition.scene.entity.parts.filter((part) => part.occludedByFace)).toHaveLength(2);
    expect(definition.scene.entity.parts.filter((part) => part.face)).toHaveLength(1);
  });

  it("exports the same deterministic current definition and reloads it through the upstream parser", () => {
    const definition = createOneWorksAmeowCandidateDefinition();
    const first = serializeOneWorksAmeowCandidate(definition);
    const second = serializeOneWorksAmeowCandidate(createOneWorksAmeowCandidateDefinition());
    expect(first).toBe(second);
    expect(JSON.parse(first).checksum).toBe(ONEWORKS_AMEOW_CANDIDATE_CHECKSUM);
    expect(loadOneWorksAmeowCandidate(first)).toEqual(definition);
    expect(canonicalArtifact).toEqual(JSON.parse(first));
  });

  it("rejects an export whose deterministic payload checksum no longer matches", () => {
    const tampered = JSON.parse(serializeOneWorksAmeowCandidate(createOneWorksAmeowCandidateDefinition()));
    tampered.definition.scene.face.gap += 1;
    expect(() => loadOneWorksAmeowCandidate(JSON.stringify(tampered))).toThrow("Invalid Ameow OneWorks candidate export.");
  });
});

describe("Ameow candidate production-attention preview", () => {
  it("reuses center/dead-zone and outer-radius recenter semantics without inventing a second curve", () => {
    expect(resolveOneWorksAmeowAttentionPreview(CENTER, CENTER, false)).toEqual({
      productionEyeOffset: { x: 0, y: 0 },
      view: { yaw: 0, pitch: 0 },
    });
    expect(resolveOneWorksAmeowAttentionPreview({ x: 50, y: 48 }, CENTER, false).productionEyeOffset).toEqual({ x: 0, y: 0 });
    expect(resolveOneWorksAmeowAttentionPreview({ x: 94, y: 48 }, CENTER, false)).toEqual({
      productionEyeOffset: { x: 0, y: 0 },
      view: { yaw: 0, pitch: 0 },
    });
  });

  it("maps the production response peak only into the conservative Lab-only envelope", () => {
    const preview = resolveOneWorksAmeowAttentionPreview({ x: 72.5, y: 48 }, CENTER, false);
    expect(preview.productionEyeOffset).toEqual({ x: 11, y: 0 });
    expect(preview.view.yaw).toBeCloseTo(ONEWORKS_AMEOW_LAB_POSE_ENVELOPE.maxYawRadians);
    expect(preview.view.pitch).toBe(0);
  });

  it("reads the production Reduced Motion branch but keeps the candidate itself static", () => {
    const preview = resolveOneWorksAmeowAttentionPreview({ x: 72.5, y: 48 }, CENTER, true);
    expect(preview.productionEyeOffset).toEqual({ x: 6, y: 0 });
    expect(preview.view).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe("Ameow candidate action previews", () => {
  it("keeps idle static and exposes the three retained meanings through public animation clips", () => {
    expect(ONEWORKS_AMEOW_ACTION_IDS).toEqual(["idle", "surprised", "curious-short", "playful-short"]);
    expect(getOneWorksAmeowActionClip("idle")).toBeNull();
    for (const action of ONEWORKS_AMEOW_ACTION_IDS.slice(1)) {
      const clip = getOneWorksAmeowActionClip(action);
      expect(clip?.playback).toBe("once");
      expect(clip?.durationMs).toBeGreaterThan(0);
      expect(clip?.keyframes).toHaveLength(3);
    }
  });

  it("derives each action's deterministic evidence still from its public clip middle keyframe", () => {
    const canonical = createOneWorksAmeowCandidateDefinition();
    expect(withOneWorksAmeowActionPreview(canonical, "idle")).toBe(canonical);
    for (const action of ONEWORKS_AMEOW_ACTION_IDS.slice(1)) {
      expect(withOneWorksAmeowActionPreview(canonical, action)).not.toEqual(canonical);
    }
  });
});
