/**
 * Canonical Lab-only Ameow candidate and its narrow preview policy.
 *
 * The upstream Avatar renderer/editor remain authoritative. This module owns
 * one definition-level calibration, deterministic review export, and a
 * labeled Lab-only pose projection of the production eye-attention recipe.
 */
import {
  COMPACT_MASCOT_ATTENTION_DEAD_ZONE,
  COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS,
  COMPACT_MASCOT_EYE_MAX_X,
  COMPACT_MASCOT_EYE_MAX_Y,
  COMPACT_MASCOT_EYE_MAX_X_REDUCED,
  COMPACT_MASCOT_EYE_MAX_Y_REDUCED,
  resolveCompactMascotAttention,
  type CompactMascotAttentionOffset,
  type CompactMascotPoint,
} from "../presentation/main-window/compactMascotRecipe";
import type {
  AvatarAnimationClip,
  AvatarAnimationLibrary,
  AvatarDefinition,
  AvatarScenePatch,
  AvatarView,
} from "@oneworks/avatar";
import {
  parseAvatarDefinition,
  serializeAvatarDefinition,
} from "@oneworks/avatar";
import {
  ONEWORKS_REGISTRY_VERSION,
  ONEWORKS_SOURCE_REVISION,
  createOneWorksCatDefinition,
} from "./oneworksMascot";

export const ONEWORKS_AMEOW_CANDIDATE_ID = "ameow-oneworks-cat-2026-08-25-v1";
export const ONEWORKS_AMEOW_CANDIDATE_SCHEMA_VERSION = 1;

/**
 * This is intentionally not production authority. The existing Compact leaf
 * moves only eyes; the Lab maps its exact bounded response to a conservative
 * upstream head view so the visual candidate can be evaluated at 60 px.
 */
export const ONEWORKS_AMEOW_LAB_POSE_ENVELOPE = {
  maxPitchRadians: 0.16,
  maxYawRadians: 0.28,
} as const;

export const ONEWORKS_AMEOW_ACTION_IDS = [
  "idle",
  "surprised",
  "curious-short",
  "playful-short",
] as const;

export type OneWorksAmeowActionId = (typeof ONEWORKS_AMEOW_ACTION_IDS)[number];

const ACTION_CLIPS = {
  surprised: {
    anchor: "absolute",
    durationMs: 720,
    label: "Surprised",
    playback: "once",
    keyframes: [
      { atMs: 0, patch: { face: { height: 60, width: 26 } } },
      { atMs: 180, patch: { face: { height: 42, width: 46, noseY: 16 } } },
      { atMs: 720, patch: { face: { height: 60, width: 26, noseY: 22 } } },
    ],
  },
  "curious-short": {
    anchor: "absolute",
    durationMs: 820,
    label: "Curious short",
    playback: "once",
    keyframes: [
      { atMs: 0, patch: { view: { yaw: 0 }, face: { rotation: 0 } } },
      { atMs: 240, patch: { view: { yaw: -0.28 }, face: { leftEyeRotation: -24, rightEyeRotation: 24, rotation: -14 } } },
      { atMs: 820, patch: { view: { yaw: 0 }, face: { rotation: 0 } } },
    ],
  },
  "playful-short": {
    anchor: "absolute",
    durationMs: 760,
    label: "Playful short",
    playback: "once",
    keyframes: [
      { atMs: 0, patch: { face: { mouthEnabled: false, rotation: 0 } } },
      { atMs: 220, patch: { face: { mouthEnabled: true, mouthCurve: 88, mouthHeight: 22, mouthWidth: 78, mouthY: 48, rotation: 5 } } },
      { atMs: 760, patch: { face: { mouthEnabled: false, mouthCurve: 45, mouthY: 52, rotation: 0 } } },
    ],
  },
} as const satisfies Record<Exclude<OneWorksAmeowActionId, "idle">, AvatarAnimationClip>;

export const ONEWORKS_AMEOW_ACTION_LIBRARY: AvatarAnimationLibrary = {
  id: "ameow-oneworks-candidate-actions",
  label: "Ameow candidate previews",
  groups: {
    compact: {
      label: "Compact meanings",
      defaultClip: "surprised",
      clips: ACTION_CLIPS,
    },
  },
};

export const getOneWorksAmeowActionClip = (
  action: OneWorksAmeowActionId,
): AvatarAnimationClip | null => action === "idle" ? null : ACTION_CLIPS[action];

/** A deterministic still of the public clip's meaningful middle keyframe. */
export const withOneWorksAmeowActionPreview = (
  definition: AvatarDefinition,
  action: OneWorksAmeowActionId,
): AvatarDefinition => {
  const patch: AvatarScenePatch | undefined = getOneWorksAmeowActionClip(action)?.keyframes[1]?.patch;
  if (patch === undefined) return definition;
  return {
    ...definition,
    scene: {
      ...definition.scene,
      face: { ...definition.scene.face, ...patch.face },
      view: { ...definition.scene.view, ...patch.view },
    },
  };
};

/** One calibrated candidate; this is a definition patch, never renderer code. */
export const createOneWorksAmeowCandidateDefinition = (): AvatarDefinition => {
  const source = createOneWorksCatDefinition();
  return {
    ...source,
    metadata: {
      id: ONEWORKS_AMEOW_CANDIDATE_ID,
      name: "Ameow OneWorks Cat",
    },
    scene: {
      ...source.scene,
      appearance: {
        ...source.scene.appearance,
        paletteId: "ameow-indigo",
      },
      camera: {
        ...source.scene.camera,
        background: "#121827",
        frameShadow: { direction: 105, distance: 10, opacity: 18, softness: 22 },
      },
      effects: {
        ...source.scene.effects,
        avatarShadow: { color: "#49658f", direction: 132, distance: 8, opacity: 24, softness: 16 },
        outline: { color: "#101827", opacity: 76, width: 3 },
      },
      entity: {
        preset: "cat",
        parts: [
          {
            baseColor: "#b9ccff",
            face: false,
            foregroundColor: "#14213d",
            highlightColor: "#f4f7ff",
            id: "ameow-ear-left",
            label: "Ameow left ear",
            occludedByFace: true,
            rotationX: -6,
            rotationY: -14,
            rotationZ: -8,
            roundness: 64,
            scaleX: 0.27,
            scaleY: 0.31,
            shadowColor: "#8298cb",
            shape: "cone",
            x: -61,
            y: -82,
            z: -10,
          },
          {
            baseColor: "#b9ccff",
            face: false,
            foregroundColor: "#14213d",
            highlightColor: "#f4f7ff",
            id: "ameow-ear-right",
            label: "Ameow right ear",
            occludedByFace: true,
            rotationX: -5,
            rotationY: 14,
            rotationZ: 8,
            roundness: 64,
            scaleX: 0.27,
            scaleY: 0.31,
            shadowColor: "#8298cb",
            shape: "cone",
            x: 61,
            y: -82,
            z: -10,
          },
          {
            baseColor: "#b9ccff",
            face: true,
            foregroundColor: "#14213d",
            highlightColor: "#f4f7ff",
            id: "ameow-head",
            label: "Ameow head",
            scaleX: 0.78,
            scaleY: 0.7,
            shadowColor: "#8298cb",
            shape: "ellipse",
            x: 0,
            y: 10,
            z: 0,
          },
        ],
      },
      face: {
        ...source.scene.face,
        gap: 40,
        height: 60,
        leftEyeRotation: -7,
        noseHeight: 9,
        noseWidth: 14,
        noseY: 22,
        rightEyeRotation: 7,
        width: 26,
      },
      view: {
        ...source.scene.view,
        scale: 1.28,
      },
    },
  };
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

type OneWorksAmeowCandidatePayload = Readonly<{
  candidateId: string;
  candidateSchemaVersion: number;
  definition: AvatarDefinition;
  registryVersion: string;
  sourceRevision: string;
}>;

type OneWorksAmeowCandidateExport = OneWorksAmeowCandidatePayload & Readonly<{
  checksum: string;
}>;

const candidatePayload = (definition: AvatarDefinition): OneWorksAmeowCandidatePayload => ({
  candidateId: ONEWORKS_AMEOW_CANDIDATE_ID,
  candidateSchemaVersion: ONEWORKS_AMEOW_CANDIDATE_SCHEMA_VERSION,
  definition: parseAvatarDefinition(JSON.parse(serializeAvatarDefinition(definition))),
  registryVersion: ONEWORKS_REGISTRY_VERSION,
  sourceRevision: ONEWORKS_SOURCE_REVISION,
});

export const serializeOneWorksAmeowCandidate = (definition: AvatarDefinition): string => {
  const payload = candidatePayload(definition);
  return `${stableJson({ ...payload, checksum: fnv1a32(stableJson(payload)) })}\n`;
};

export const loadOneWorksAmeowCandidate = (serialized: string): AvatarDefinition => {
  const parsed = JSON.parse(serialized) as Partial<OneWorksAmeowCandidateExport>;
  const { checksum, ...payload } = parsed;
  if (
    checksum !== fnv1a32(stableJson(payload))
    || payload.candidateId !== ONEWORKS_AMEOW_CANDIDATE_ID
    || payload.candidateSchemaVersion !== ONEWORKS_AMEOW_CANDIDATE_SCHEMA_VERSION
    || payload.registryVersion !== ONEWORKS_REGISTRY_VERSION
    || payload.sourceRevision !== ONEWORKS_SOURCE_REVISION
    || payload.definition === undefined
  ) {
    throw new Error("Invalid Ameow OneWorks candidate export.");
  }
  return parseAvatarDefinition(payload.definition);
};

export const ONEWORKS_AMEOW_CANDIDATE_CHECKSUM = (() => {
  const parsed = JSON.parse(
    serializeOneWorksAmeowCandidate(createOneWorksAmeowCandidateDefinition()),
  ) as OneWorksAmeowCandidateExport;
  return parsed.checksum;
})();

export type OneWorksAmeowAttentionPreview = Readonly<{
  productionEyeOffset: CompactMascotAttentionOffset;
  view: Readonly<Pick<AvatarView, "pitch" | "yaw">>;
}>;

/**
 * Uses the production pure recipe unchanged. Only the final eye-offset →
 * moderate OneWorks pose mapping is Lab-local, explicitly zeroed for Reduced
 * Motion so this candidate returns to its static canonical frame.
 */
export const resolveOneWorksAmeowAttentionPreview = (
  point: CompactMascotPoint,
  center: CompactMascotPoint,
  reducedMotion: boolean,
): OneWorksAmeowAttentionPreview => {
  const productionEyeOffset = resolveCompactMascotAttention(point, center, reducedMotion);
  if (reducedMotion) {
    return { productionEyeOffset, view: { pitch: 0, yaw: 0 } };
  }
  return {
    productionEyeOffset,
    view: {
      pitch: productionEyeOffset.y / COMPACT_MASCOT_EYE_MAX_Y * ONEWORKS_AMEOW_LAB_POSE_ENVELOPE.maxPitchRadians,
      yaw: productionEyeOffset.x / COMPACT_MASCOT_EYE_MAX_X * ONEWORKS_AMEOW_LAB_POSE_ENVELOPE.maxYawRadians,
    },
  };
};

export const ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS = {
  deadZonePx: COMPACT_MASCOT_ATTENTION_DEAD_ZONE,
  normalEyeBounds: { x: COMPACT_MASCOT_EYE_MAX_X, y: COMPACT_MASCOT_EYE_MAX_Y },
  reducedEyeBounds: { x: COMPACT_MASCOT_EYE_MAX_X_REDUCED, y: COMPACT_MASCOT_EYE_MAX_Y_REDUCED },
  responseRadiusPx: COMPACT_MASCOT_ATTENTION_RESPONSE_RADIUS,
} as const;
