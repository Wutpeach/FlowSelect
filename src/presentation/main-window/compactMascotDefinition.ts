import {
  validateAvatarDefinition,
  type AvatarDefinition,
} from "@bible-strong/avatar-core";

export const KIRBY_UPSTREAM_REVISION = "175691ab32cefe5faec7828af62f3d50210a8eb2";
export const COMPACT_MASCOT_BASELINE_ANIMATION = "idle";
export const COMPACT_MASCOT_ACTIONS = ["surprised", "curious-short", "playful-short"] as const;

const sourceStep = (expression: string) => ({
  expression,
  holdMs: 2300,
  transitionMs: 500,
  transition: "smooth" as const,
});

const expression = (
  head: [number, number, number],
  eyes: [number, number, number, number, number, number, number, number, number],
) => ({
  head: { x: head[0], y: head[1], z: head[2] },
  eyes: {
    left: { width: eyes[0], height: eyes[2], x: eyes[5], y: eyes[7], angle: eyes[8] },
    right: { width: eyes[1], height: eyes[3], x: eyes[6], y: eyes[7], angle: -eyes[8] },
    spacing: eyes[4],
  },
  perspective: 1,
  motion: { eyes: "none" as const, body: "none" as const },
});

// Exact Kirby Studio body at the pinned revision. It is retained for source
// comparison; production changes only these two source nodes into diamond ears.
export const KIRBY_SOURCE_BODY = {
  primary: { type: "sphere" as const, width: 240, height: 240, depth: 240, roundness: 1 },
  nodes: [
    {
      surface: { type: "sphere" as const, width: 108.11015625, height: 81.6, depth: 81.6, roundness: 1 },
      position: [-103.30437876033604, 30.4449714479682, -9.784765625] as [number, number, number],
      rotation: [0, 0, -14.843359375] as [number, number, number],
    },
    {
      surface: { type: "sphere" as const, width: 108.11015625, height: 81.6, depth: 81.6, roundness: 1 },
      position: [98.15429266544173, 32.55003025735345, -9.784765625] as [number, number, number],
      rotation: [0, 0, 15.175] as [number, number, number],
    },
  ],
};

const compactMascotSourceDefinition: AvatarDefinition = {
  schema: "bible-strong/avatar-definition",
  schemaVersion: 1,
  name: "Ameow Kirby Cat",
  body: {
    primary: KIRBY_SOURCE_BODY.primary,
    // Ameow delta: two short, broad diamond ears with deeply embedded roots;
    // their full-pose projection remains core-rendered.
    nodes: [
      { surface: { type: "diamond", width: 76, height: 135, depth: 78, roundness: 1 }, position: [-70, -76, -82], rotation: [0, -5, -10] },
      { surface: { type: "diamond", width: 76, height: 135, depth: 78, roundness: 1 }, position: [70, -76, -82], rotation: [0, 5, 10] },
    ],
  },
  colors: { body: "#ffc2e9", eyes: "#3e4e65" },
  expressions: {
    neutral: expression([0, 0, 0], [20, 20, 60.473828125, 60.473828125, 28.74921875, 0, 0, -7, 0]),
    "expression-00": expression([7.3, 27.8, -16.1], [22.501171875, 22.501171875, 42.377734375, 42.377734375, 54.3, 0, 0, -20.5, 0]),
    "expression-02": expression([-15.287109375, 15.006640625, 12.787890625], [31.25390625, 31.25390625, 76.720703125, 76.720703125, 68.7, 0, 0, 0, 0]),
    "expression-03": expression([2.946875, -16.051171875, -20.916015625], [51.68336723153048, 51.68336723153048, 51.74054108796297, 51.74054108796297, 70.9, 0, 0, 0, 0]),
    "expression-08": expression([-12.303515625, -17.601171875, 5.9109375], [20.605859375, 20.605859375, 47.769921875, 47.769921875, 54.9, 0, 0, 0, 23.523046875]),
    "expression-15": expression([0.319140625, 35.307421875, -10.904296875], [22.4609375, 22.4609375, 39.820703125, 39.820703125, 53.9, 0, 0, 0, 0]),
    "expression-17": expression([-4.3953125, 14.07265625, -16.126171875], [19.045145681988206, 19.045145681988206, 43.370703125, 43.370703125, 51.73125, 0, 0, 0, 26.2921875]),
    "expression-21": expression([-5.428125, -11.71328125, -13.472265625], [51.4, 50.5, 50.1, 49.4, 69, 0, 0, 0, 0]),
  },
  expressionOrder: ["neutral", "expression-00", "expression-02", "expression-03", "expression-08", "expression-15", "expression-17", "expression-21"],
  animations: {
    idle: { playbackMode: "loop", steps: [{ expression: "expression-00", holdMs: 5200, transitionMs: 500, transition: "smooth" }, { expression: "expression-08", holdMs: 5200, transitionMs: 500, transition: "smooth" }], blink: { enabled: true, initialDelayMs: 2600, minIntervalMs: 3400, maxIntervalMs: 6200, durationMs: 280 } },
    surprised: { playbackMode: "once", steps: [sourceStep("expression-03"), sourceStep("expression-21")], blink: { enabled: true, initialDelayMs: 1200, minIntervalMs: 1800, maxIntervalMs: 3600, durationMs: 220 } },
    "curious-short": { playbackMode: "once", steps: [sourceStep("expression-00"), sourceStep("expression-15")], blink: { enabled: true, initialDelayMs: 2100, minIntervalMs: 2800, maxIntervalMs: 5000, durationMs: 260 } },
    "playful-short": { playbackMode: "once", steps: [sourceStep("expression-02"), sourceStep("expression-17")], blink: { enabled: true, initialDelayMs: 2100, minIntervalMs: 2800, maxIntervalMs: 5000, durationMs: 260 } },
  },
  animationOrder: ["idle", ...COMPACT_MASCOT_ACTIONS],
};

const validation = validateAvatarDefinition(compactMascotSourceDefinition);
if (!validation.ok) throw new Error(`Invalid pinned Kirby cat definition: ${validation.errors[0]?.message}`);

export const COMPACT_MASCOT_DEFINITION = validation.value;
