import {
  validateAvatarDefinition,
  type AvatarDefinition,
} from "@bible-strong/avatar-core";

export const STROBI_UPSTREAM_REVISION = "175691ab32cefe5faec7828af62f3d50210a8eb2";
export const STROBI_DEFAULT_ANIMATION = "proud";

// Source-faithful minimum exported from the official Strobi definition at the
// pinned upstream revision. The first Compact scope deliberately retains only
// the neutral pose and the three expressions authored by the default `proud`
// loop; it is not an avatar registry or a business-state animation map.
const strobiSourceDefinition: AvatarDefinition = {
  schema: "bible-strong/avatar-definition",
  schemaVersion: 1,
  name: "Strobi",
  body: {
    primary: {
      type: "sphere",
      width: 240,
      height: 240,
      depth: 240.03671875,
      roundness: 1,
    },
    nodes: [],
  },
  colors: {
    body: "#5b7fe5",
    eyes: "#111316",
  },
  expressions: {
    neutral: {
      head: { x: 0, y: 0, z: 0 },
      eyes: {
        left: { width: 20, height: 50, x: 0, y: -7, angle: 0 },
        right: { width: 20, height: 50, x: 0, y: -7, angle: 0 },
        spacing: 35,
      },
      perspective: 1,
      motion: { eyes: "none", body: "none" },
    },
    "far-right-glance": {
      head: { x: 0.31914062500000184, y: 35.307421874999996, z: -10.904296875 },
      eyes: {
        left: { width: 22.4609375, height: 39.820703124999994, x: 0, y: 0, angle: 0 },
        right: { width: 22.4609375, height: 39.820703124999994, x: 0, y: 0, angle: 0 },
        spacing: 53.900000000000006,
      },
      perspective: 1,
      motion: { eyes: "none", body: "none" },
    },
    "curious-left": {
      head: { x: -12.303515625, y: -17.601171875, z: 5.9109375 },
      eyes: {
        left: {
          width: 20.605859374999994,
          height: 47.769921874999994,
          x: 0,
          y: 0,
          angle: 23.523046875000002,
        },
        right: {
          width: 20.605859374999994,
          height: 47.769921874999994,
          x: 0,
          y: 0,
          angle: -24.042578125000002,
        },
        spacing: 54.900000000000006,
      },
      perspective: 1,
      motion: { eyes: "none", body: "none" },
    },
    "joyful-down-right": {
      head: { x: -15.287109375000002, y: 15.006640625, z: 12.787890625 },
      eyes: {
        left: { width: 31.25390625, height: 76.720703125, x: 0, y: 0, angle: 0 },
        right: { width: 31.25390625, height: 76.720703125, x: 0, y: 0, angle: 0 },
        spacing: 68.7,
      },
      perspective: 1,
      motion: { eyes: "none", body: "none" },
    },
  },
  expressionOrder: [
    "neutral",
    "far-right-glance",
    "curious-left",
    "joyful-down-right",
  ],
  animations: {
    proud: {
      playbackMode: "loop",
      steps: [
        {
          expression: "far-right-glance",
          holdMs: 2300,
          transitionMs: 500,
          transition: "smooth",
        },
        {
          expression: "curious-left",
          holdMs: 2300,
          transitionMs: 500,
          transition: "smooth",
        },
        {
          expression: "joyful-down-right",
          holdMs: 2300,
          transitionMs: 500,
          transition: "smooth",
        },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 2100,
        minIntervalMs: 2800,
        maxIntervalMs: 5000,
        durationMs: 260,
      },
      metadata: {
        label: "proud",
        description: "Cet état enchaîne un pool de presets et des clignements.",
        group: "Réactions",
      },
    },
  },
  animationOrder: ["proud"],
};

const validation = validateAvatarDefinition(strobiSourceDefinition);
if (!validation.ok) {
  throw new Error(`Invalid pinned Strobi definition: ${validation.errors[0]?.message}`);
}

export const STROBI_DEFINITION = validation.value;
