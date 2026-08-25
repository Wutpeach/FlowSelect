/**
 * OneWorks Route A Lab fixture.
 *
 * This module deliberately owns data and browser-Lab input translation only.
 * `Avatar` and `AvatarEditor` remain the upstream renderer and authoring UI;
 * no OneWorks geometry, masking, or editor control is reimplemented here.
 */
import {
  createDefaultAvatarDefinition,
  type AvatarAnimationLibrary,
  type AvatarDefinition,
  type AvatarView,
} from "@oneworks/avatar";

export const ONEWORKS_SOURCE_REVISION = "3ad2542ea4487e95884f313b84943df602c0e742";
export const ONEWORKS_REGISTRY_VERSION = "1.0.0-rc.6";

export type OneWorksPose = Readonly<{
  id: "front" | "yaw" | "pitch" | "tangent";
  label: string;
  view: Readonly<Pick<AvatarView, "pitch" | "yaw">>;
}>;

/** Deterministic evidence poses; values are upstream scene-view radians. */
export const ONEWORKS_POSE_PRESETS: readonly OneWorksPose[] = [
  { id: "front", label: "Front", view: { yaw: 0, pitch: 0 } },
  { id: "yaw", label: "Yaw +55°", view: { yaw: 0.96, pitch: 0 } },
  { id: "pitch", label: "Pitch −28°", view: { yaw: 0, pitch: -0.49 } },
  { id: "tangent", label: "Tangent +90°", view: { yaw: Math.PI / 2, pitch: 0 } },
];

export const ONEWORKS_SWEEP_POSES = [
  { id: "yaw--180", label: "−180° rear", view: { yaw: -Math.PI, pitch: 0 } },
  { id: "yaw--135", label: "−135°", view: { yaw: -Math.PI * 0.75, pitch: 0 } },
  { id: "yaw--90", label: "−90°", view: { yaw: -Math.PI / 2, pitch: 0 } },
  { id: "yaw--55", label: "−55°", view: { yaw: -0.96, pitch: 0 } },
  { id: "front", label: "0°", view: { yaw: 0, pitch: 0 } },
  { id: "yaw-55", label: "+55°", view: { yaw: 0.96, pitch: 0 } },
  { id: "yaw-90", label: "+90°", view: { yaw: Math.PI / 2, pitch: 0 } },
  { id: "yaw-135", label: "+135°", view: { yaw: Math.PI * 0.75, pitch: 0 } },
  { id: "yaw-180", label: "+180° rear / closure", view: { yaw: Math.PI, pitch: 0 } },
] as const;

/**
 * The pinned source's cat preset data, applied to the published core's
 * canonical definition factory. It is fixture data, not a geometry port.
 */
export const createOneWorksCatDefinition = (): AvatarDefinition => {
  const definition = createDefaultAvatarDefinition();
  return {
    ...definition,
    scene: {
      ...definition.scene,
      appearance: {
        ...definition.scene.appearance,
        backgroundStyle: "solid",
        paletteId: "coral",
      },
      camera: {
        ...definition.scene.camera,
        background: "#111315",
        frame: "rounded",
        frameShadow: { direction: 90, distance: 12, opacity: 20, softness: 24 },
        showFrameShadow: true,
      },
      effects: {
        ...definition.scene.effects,
        avatarShadow: { color: "#7c3140", direction: 132, distance: 10, opacity: 28, softness: 14 },
        outline: { color: "#050608", opacity: 84, width: 4 },
        showAvatarShadow: true,
        showFaceShadow: false,
        showOutline: true,
      },
      entity: {
        preset: "cat",
        parts: [
          {
            baseColor: "#f7f7f4",
            face: false,
            foregroundColor: "#050608",
            highlightColor: "#ffffff",
            id: "cat-ear-left",
            label: "Left ear",
            occludedByFace: true,
            rotationX: -7,
            rotationY: -13,
            rotationZ: -9,
            roundness: 48,
            scaleX: 0.24,
            scaleY: 0.29,
            shadowColor: "#e8e9ec",
            shape: "cone",
            x: -56,
            y: -78,
            z: -8,
          },
          {
            baseColor: "#f7f7f4",
            face: false,
            foregroundColor: "#050608",
            highlightColor: "#ffffff",
            id: "cat-ear-right",
            label: "Right ear",
            occludedByFace: true,
            rotationX: -6,
            rotationY: 13,
            rotationZ: 9,
            roundness: 52,
            scaleX: 0.23,
            scaleY: 0.28,
            shadowColor: "#e8e9ec",
            shape: "cone",
            x: 56,
            y: -78,
            z: -10,
          },
          {
            baseColor: "#f7f7f4",
            face: true,
            foregroundColor: "#050608",
            highlightColor: "#ffffff",
            id: "cat-head",
            label: "Head",
            scaleX: 0.73,
            scaleY: 0.68,
            shadowColor: "#e8e9ec",
            shape: "ellipse",
            x: 0,
            y: 12,
            z: 0,
          },
        ],
      },
      face: {
        ...definition.scene.face,
        gap: 42,
        leftEyeRotation: -10,
        noseEnabled: true,
        noseHeight: 11,
        noseShape: "ellipse",
        noseWidth: 16,
        noseY: 22,
        rightEyeRotation: 10,
      },
      interactionMode: "move",
      lighting: {
        ...definition.scene.lighting,
        azimuth: -35,
        distance: 0,
        elevation: 40,
        enabled: false,
        gridDensity: 100,
      },
      view: {
        // Source cat body data is preserved above. The source preset's
        // exported camera framing (2.3884 / offset) is intentionally
        // normalized for a readable true-60px Lab specimen.
        pitch: 0,
        positionX: 0,
        positionY: 0,
        roll: 0,
        scale: 1.25,
        yaw: 0,
      },
    },
  };
};

export const withOneWorksPose = (
  definition: AvatarDefinition,
  view: Readonly<Pick<AvatarView, "pitch" | "yaw">>,
): AvatarDefinition => ({
  ...definition,
  scene: {
    ...definition.scene,
    view: { ...definition.scene.view, ...view },
  },
});

export type OneWorksPointerRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/** Lab-local client point → bounded upstream pose; never reads Pointer Field. */
export const resolveOneWorksPointerPose = (
  clientX: number,
  clientY: number,
  rect: OneWorksPointerRect,
): Readonly<Pick<AvatarView, "pitch" | "yaw">> | null => {
  if (
    !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }
  const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * 2 - 1;
  const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1) * 2 - 1;
  return { yaw: x * 0.96, pitch: y * 0.49 };
};

/** A Lab fixture proving the upstream public animation-library API only. */
export const ONEWORKS_INSPECTOR_ANIMATION_LIBRARY: AvatarAnimationLibrary = {
  id: "ameow-lab-inspection",
  label: "Ameow Lab inspection",
  groups: {
    pose: {
      label: "Pose",
      defaultClip: "sweep",
      clips: {
        sweep: {
          anchor: "absolute",
          durationMs: 2500,
          label: "Yaw sweep",
          playback: "loop",
          keyframes: [
            { atMs: 0, patch: { view: { yaw: -0.96, pitch: 0 } } },
            { atMs: 800, patch: { view: { yaw: 0, pitch: -0.49 } } },
            { atMs: 1600, patch: { view: { yaw: 0.96, pitch: 0 } } },
            { atMs: 2400, patch: { view: { yaw: -0.96, pitch: 0 } } },
          ],
        },
      },
    },
  },
};
