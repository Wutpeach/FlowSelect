/**
 * MR9 Browser Presentation Lab — synthetic scenario model.
 *
 * Pure, browser-safe Lab state: every scenario/action reduces to the ONE
 * production semantic input (ExpandedPresentationTarget) plus the production
 * reducedMotion flag. No Download/Product/lifecycle authority is read or
 * written here; the Lab never touches the downloader, Electron bridge,
 * Browser Extension, task state, progress tombstones, or acknowledgement
 * correlation.
 */
import type { LocalIntakeOrigin } from "../application/download-api";
import { MAIN_WINDOW_PANEL_SIZE } from "../constants/windowMetrics";
import type {
  ExpandedPresentationProgressTarget,
  ExpandedPresentationTarget,
} from "../presentation/main-window/expandedPresentationTargets";
import { NEUTRAL_PRESENTATION_ORIGIN } from "../presentation/main-window/downloadIntakePresentation";
import type { LabPreviewTarget } from "./previewTargets";

/** The production preview surface is exactly 200x200 CSS pixels. */
export const LAB_PREVIEW_SIZE = MAIN_WINDOW_PANEL_SIZE;

export const LAB_PRIMARY_TRACE_ID = "lab-primary-trace";
export const LAB_REPLACEMENT_TRACE_ID_PREFIX = "lab-replacement-trace";

export type LabActivationSource = "intake" | "folder";

export type LabActivationPreset = Readonly<{
  id: string;
  source: LabActivationSource;
  origin: "pointer" | "center";
  forcedReducedMotion: boolean;
  label: string;
  description: string;
}>;

export const LAB_ACTIVATION_PRESETS: readonly LabActivationPreset[] = [
  {
    id: "intake-local",
    source: "intake",
    origin: "pointer",
    forcedReducedMotion: false,
    label: "Intake · local origin",
    description: "Ignition from the last preview click point.",
  },
  {
    id: "intake-center",
    source: "intake",
    origin: "center",
    forcedReducedMotion: false,
    label: "Intake · center",
    description: "Neutral viewport center (extension-style fallback origin).",
  },
  {
    id: "folder",
    source: "folder",
    origin: "pointer",
    forcedReducedMotion: false,
    label: "Folder · Anchor / Lock",
    description: "Steadier sweep with emphasized edge capture and closure.",
  },
  {
    id: "intake-reduced",
    source: "intake",
    origin: "pointer",
    forcedReducedMotion: true,
    label: "Intake · reduced motion",
    description: "Bounded static ignition blot; no travel, chase, or distortion.",
  },
  {
    id: "folder-reduced",
    source: "folder",
    origin: "pointer",
    forcedReducedMotion: true,
    label: "Folder · reduced motion",
    description: "Static edge lock plus a short warm closure state.",
  },
];

export type LabProgressPreset = Readonly<{
  id: string;
  target: number;
  label: string;
}>;

export const LAB_PROGRESS_PRESETS: readonly LabProgressPreset[] = [
  { id: "progress-0", target: 0, label: "0%" },
  { id: "progress-25", target: 0.25, label: "25%" },
  { id: "progress-50", target: 0.5, label: "50%" },
  { id: "progress-75", target: 0.75, label: "75%" },
  { id: "progress-100", target: 1, label: "100%" },
];

export type LabHeatmapPreset = Readonly<{
  id: string;
  forcedReducedMotion: boolean;
  /** Derived Heatmap mode: while true the single shader also applies the
   * lab-gated Thermal Refraction displacement to the same analytic field. */
  refraction: boolean;
  /** Lab-only accepted-contact edge response + compact exterior leakage. */
  boundaryHalo: boolean;
  label: string;
  description: string;
}>;

/**
 * Paper Shaders Heatmap visual spike presets. These drive the lab-only
 * `heatmap` flag on the single production surface; the shader field is a
 * clean-room scalar heat ramp and never a Paper runtime or second canvas.
 * The two `heatmap-refraction-*` presets are a derived mode: they reuse the
 * same heatmap state/category and only add the lab-only `refraction` flag.
 */
export const LAB_HEATMAP_PRESETS: readonly LabHeatmapPreset[] = [
  {
    id: "heatmap-moving",
    refraction: false,
    boundaryHalo: false,
    forcedReducedMotion: false,
    label: "Heatmap · moving field",
    description: "Full-surface moving scalar heat field (clean-room spike).",
  },
  {
    id: "heatmap-reduced",
    refraction: false,
    boundaryHalo: false,
    forcedReducedMotion: true,
    label: "Heatmap · reduced motion",
    description: "Static bounded field snapshot; no travelling frames.",
  },
  {
    id: "heatmap-refraction-moving",
    refraction: true,
    boundaryHalo: false,
    forcedReducedMotion: false,
    label: "Heatmap · thermal refraction",
    description: "Moving field with slow local low-frequency refraction (analytic resample).",
  },
  {
    id: "heatmap-refraction-reduced",
    refraction: true,
    boundaryHalo: false,
    forcedReducedMotion: true,
    label: "Heatmap · refraction, reduced motion",
    description: "Static frozen local refraction; zero travelling frames.",
  },
  {
    id: "heatmap-contact-halo-moving",
    refraction: true,
    boundaryHalo: true,
    forcedReducedMotion: false,
    label: "Heatmap · localized boundary contact",
    description: "Accepted moving contact drives a compact 14px-gutter leakage.",
  },
  {
    id: "heatmap-contact-halo-reduced",
    refraction: true,
    boundaryHalo: true,
    forcedReducedMotion: true,
    label: "Heatmap · boundary contact, reduced motion",
    description: "Static accepted contact and halo; zero continuing frames.",
  },
];

export type LabActivationState = Readonly<{
  presetId: string;
  source: LabActivationSource;
  origin: LocalIntakeOrigin;
  forcedReducedMotion: boolean;
  startedAt: number;
  opportunityId: number;
}>;

export type LabHeatmapState = Readonly<{
  presetId: string;
  forcedReducedMotion: boolean;
  /** Derived Heatmap mode flag; production never sees it. */
  refraction: boolean;
  /** Lab-only outer-domain accepted-contact response. */
  boundaryHalo: boolean;
}>;

export type LabPresentationState = Readonly<{
  activation: LabActivationState | null;
  heatmap: LabHeatmapState | null;
  progress: ExpandedPresentationProgressTarget;
  progressTraceId: string;
  replacementEpoch: number;
  pointerOrigin: LocalIntakeOrigin;
  reducedMotion: boolean;
}>;

export type LabPresentationAction =
  | { type: "activate"; presetId: string; now: number }
  | { type: "replay"; now: number }
  | { type: "setHeatmap"; presetId: string }
  | { type: "clearHeatmap" }
  | { type: "progressPreset"; presetId: string }
  | { type: "progressTarget"; target: number }
  | { type: "progressIndeterminate" }
  | { type: "downwardRevision" }
  | { type: "replaceTrace" }
  | { type: "clearProgress" }
  | { type: "setPointerOrigin"; origin: LocalIntakeOrigin }
  | { type: "setReducedMotion"; enabled: boolean };

export type LabComposedInput = Readonly<{
  target: ExpandedPresentationTarget;
  reducedMotion: boolean;
}>;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** Finite, clamped normalized origin; invalid input falls back to center. */
export const clampNormalizedOrigin = (x: number, y: number): LocalIntakeOrigin => ({
  x: Number.isFinite(x) ? clamp01(x) : NEUTRAL_PRESENTATION_ORIGIN.x,
  y: Number.isFinite(y) ? clamp01(y) : NEUTRAL_PRESENTATION_ORIGIN.y,
});

export const resolveActivationPreset = (presetId: string): LabActivationPreset | null =>
  LAB_ACTIVATION_PRESETS.find((preset) => preset.id === presetId) ?? null;

export const resolveProgressPreset = (presetId: string): LabProgressPreset | null =>
  LAB_PROGRESS_PRESETS.find((preset) => preset.id === presetId) ?? null;

export const resolveHeatmapPreset = (presetId: string): LabHeatmapPreset | null =>
  LAB_HEATMAP_PRESETS.find((preset) => preset.id === presetId) ?? null;

export const createLabPresentationState = (options?: {
  reducedMotion?: boolean;
}): LabPresentationState => ({
  activation: null,
  heatmap: null,
  progress: {
    kind: "determinate",
    traceId: LAB_PRIMARY_TRACE_ID,
    target: 0.5,
  },
  progressTraceId: LAB_PRIMARY_TRACE_ID,
  replacementEpoch: 0,
  pointerOrigin: NEUTRAL_PRESENTATION_ORIGIN,
  reducedMotion: options?.reducedMotion ?? false,
});

/**
 * Pure Lab reducer. The Lab owns only its bounded synthetic presentation
 * state; the resolved input is exactly the production ExpandedPresentationTarget
 * the production host already consumes.
 */
export const reduceLabPresentation = (
  state: LabPresentationState,
  action: LabPresentationAction,
): LabPresentationState => {
  switch (action.type) {
    case "activate": {
      const preset = resolveActivationPreset(action.presetId);
      if (preset === null) {
        return state;
      }
      return {
        ...state,
        activation: {
          presetId: preset.id,
          source: preset.source,
          origin:
            preset.origin === "pointer"
              ? state.pointerOrigin
              : NEUTRAL_PRESENTATION_ORIGIN,
          forcedReducedMotion: preset.forcedReducedMotion,
          startedAt: action.now,
          opportunityId: (state.activation?.opportunityId ?? 0) + 1,
        },
      };
    }
    case "replay": {
      if (state.activation === null) {
        return state;
      }
      return {
        ...state,
        activation: {
          ...state.activation,
          startedAt: action.now,
          opportunityId: state.activation.opportunityId + 1,
        },
      };
    }
    case "setHeatmap": {
      const preset = resolveHeatmapPreset(action.presetId);
      if (preset === null) {
        return state;
      }
      return {
        ...state,
        activation: null,
        heatmap: {
          presetId: preset.id,
          forcedReducedMotion: preset.forcedReducedMotion,
          refraction: preset.refraction,
          boundaryHalo: preset.boundaryHalo,
        },
      };
    }
    case "clearHeatmap": {
      if (state.heatmap === null) {
        return state;
      }
      return { ...state, heatmap: null };
    }
    case "progressPreset": {
      const preset = resolveProgressPreset(action.presetId);
      if (preset === null) {
        return state;
      }
      return {
        ...state,
        activation: null,
        progress: {
          kind: "determinate",
          traceId: state.progressTraceId,
          target: preset.target,
        },
      };
    }
    case "progressTarget":
      return {
        ...state,
        activation: null,
        progress: {
          kind: "determinate",
          traceId: state.progressTraceId,
          target: clamp01(action.target),
        },
      };
    case "progressIndeterminate":
      return {
        ...state,
        activation: null,
        progress: { kind: "indeterminate", traceId: state.progressTraceId },
      };
    case "downwardRevision": {
      const current = state.progress;
      if (current.kind !== "determinate") {
        return state;
      }
      const nextTarget = Math.max(
        0,
        Math.round((current.target - 0.5) * 100) / 100,
      );
      if (nextTarget === current.target) {
        return state;
      }
      return {
        ...state,
        activation: null,
        progress: { ...current, target: nextTarget },
      };
    }
    case "replaceTrace": {
      const nextTraceId = `${LAB_REPLACEMENT_TRACE_ID_PREFIX}-${state.replacementEpoch + 1}`;
      return {
        ...state,
        activation: null,
        progressTraceId: nextTraceId,
        replacementEpoch: state.replacementEpoch + 1,
        // A replacement trace never inherits the old trace's quantitative state.
        progress: { kind: "determinate", traceId: nextTraceId, target: 0.5 },
      };
    }
    case "clearProgress":
      return state.activation === null && state.progress.kind === "idle"
        ? state
        : { ...state, activation: null, progress: { kind: "idle" } };
    case "setPointerOrigin":
      return {
        ...state,
        pointerOrigin: clampNormalizedOrigin(action.origin.x, action.origin.y),
      };
    case "setReducedMotion":
      return state.reducedMotion === action.enabled
        ? state
        : { ...state, reducedMotion: action.enabled };
  }
};

/**
 * Compose the single production semantic input. Mirrors the production policy
 * shape: activation wins and carries the current progress underlay; otherwise
 * progress; idle when no progress fact exists. Reduced Motion is the inspector
 * toggle OR the preset's forced reduced-motion flag.
 */
export const composeLabInput = (state: LabPresentationState): LabComposedInput => {
  // The Heatmap spike overrides the whole surface regardless of the semantic
  // target; keep a valid progress/idle underlay and force the preset's reduced
  // motion flag so the field freezes to a bounded static snapshot.
  if (state.heatmap !== null) {
    return {
      target: state.progress.kind === "idle"
        ? { kind: "idle" }
        : { kind: "progress", progress: state.progress },
      reducedMotion: state.reducedMotion || state.heatmap.forcedReducedMotion,
    };
  }
  if (state.activation !== null) {
    return {
      target: {
        kind: "activation",
        source: state.activation.source,
        opportunityId: state.activation.opportunityId,
        origin: state.activation.origin,
        startedAt: state.activation.startedAt,
        progress: state.progress,
      },
      reducedMotion: state.reducedMotion || state.activation.forcedReducedMotion,
    };
  }
  if (state.progress.kind === "idle") {
    return {
      target: { kind: "idle" },
      reducedMotion: state.reducedMotion,
    };
  }
  return {
    target: { kind: "progress", progress: state.progress },
    reducedMotion: state.reducedMotion,
  };
};

/**
 * Lab scenario groups (Scenario Navigation). Full categories drive the one
 * production Expanded surface; the Compact category drives the current Compact
 * renderer leaf only.
 */
export type LabCategoryId =
  | "activation"
  | "downloadProgress"
  | "runtime"
  | "transcode"
  | "mixed"
  | "reducedMotion"
  | "heatmapSpike"
  | "compact";

export type LabTargetAvailability = Readonly<{ full: boolean; compact: boolean }>;

/**
 * Static scenario-group → Preview Target compatibility. Incompatible groups
 * stay visible with a clear Full-only / Compact-only indicator; they are
 * never silently coerced into a fake projection for the other target.
 */
export const LAB_CATEGORY_TARGET_AVAILABILITY: Readonly<
  Record<LabCategoryId, LabTargetAvailability>
> = {
  activation: { full: true, compact: false },
  downloadProgress: { full: true, compact: false },
  runtime: { full: true, compact: false },
  transcode: { full: true, compact: false },
  mixed: { full: true, compact: false },
  reducedMotion: { full: true, compact: false },
  heatmapSpike: { full: true, compact: false },
  compact: { full: false, compact: true },
};

export type LabCompactScenarioId =
  | "compact-neutral"
  | "compact-pointer"
  | "compact-reduced";

export type LabCompactScenario = Readonly<{
  id: LabCompactScenarioId;
  /** Existing renderer capability: live pointer attention or pinned neutral. */
  pointerMode: "live" | "neutral";
  forcedReducedMotion: boolean;
}>;

/**
 * Compact scenarios express ONLY the current Compact renderer's capability:
 * neutral, pointer attention, and Reduced Motion. They never fake Full
 * business scenarios (download / runtime / transcode / activation) for the
 * Compact target.
 */
export const LAB_COMPACT_SCENARIOS: readonly LabCompactScenario[] = [
  {
    id: "compact-neutral",
    pointerMode: "neutral",
    forcedReducedMotion: false,
  },
  {
    id: "compact-pointer",
    pointerMode: "live",
    forcedReducedMotion: false,
  },
  {
    id: "compact-reduced",
    pointerMode: "live",
    forcedReducedMotion: true,
  },
];

export const LAB_COMPACT_SCENARIO_IDS = LAB_COMPACT_SCENARIOS.map(
  (scenario) => scenario.id,
) as readonly LabCompactScenarioId[];

export const resolveLabCompactScenario = (
  id: string,
): LabCompactScenario | null =>
  LAB_COMPACT_SCENARIOS.find((scenario) => scenario.id === id) ?? null;

/**
 * The ONE Lab reducedMotion preview value that drives both targets and every
 * scenario preset / control. It is a single derived fact with no competing
 * mirror state:
 *   - Compact target: user toggle OR the active Compact scenario's forced flag.
 *   - Full target without an overlay fixture: toggle OR the active
 *     activation/heatmap preset's forced flag (same semantics as the composed
 *     input, so the preview matches what the production surface receives).
 *   - Full target with an overlay fixture: the toggle only — business-state
 *     fixtures never force Reduced Motion (same semantics as before the
 *     Refresh).
 */
export const resolveLabPreviewReducedMotion = (
  state: LabPresentationState,
  target: LabPreviewTarget,
  compactScenario: LabCompactScenario | null,
  projectionActive: boolean,
): boolean => {
  if (target === "compact") {
    return state.reducedMotion || (compactScenario?.forcedReducedMotion ?? false);
  }
  if (projectionActive) {
    return state.reducedMotion;
  }
  return state.reducedMotion
    || (state.activation?.forcedReducedMotion ?? false)
    || (state.heatmap?.forcedReducedMotion ?? false);
};
