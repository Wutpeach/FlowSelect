import { describe, expect, it } from "vitest";
import {
  LAB_ACTIVATION_PRESETS,
  LAB_CATEGORY_TARGET_AVAILABILITY,
  LAB_COMPACT_SCENARIOS,
  LAB_COMPACT_SCENARIO_IDS,
  LAB_HEATMAP_PRESETS,
  LAB_PRIMARY_TRACE_ID,
  LAB_PROGRESS_PRESETS,
  LAB_REPLACEMENT_TRACE_ID_PREFIX,
  composeLabInput,
  createLabPresentationState,
  reduceLabPresentation,
  resolveLabCompactScenario,
  resolveLabPreviewReducedMotion,
  type LabPresentationState,
} from "./scenarios";

const NOW = 123456;

describe("Lab scenario model", () => {
  it("starts with a determinate primary trace at 50% and no activation", () => {
    const state = createLabPresentationState();
    expect(state.activation).toBeNull();
    expect(state.progress).toEqual({
      kind: "determinate",
      traceId: LAB_PRIMARY_TRACE_ID,
      target: 0.5,
    });
    expect(composeLabInput(state)).toEqual({
      target: {
        kind: "progress",
        progress: { kind: "determinate", traceId: LAB_PRIMARY_TRACE_ID, target: 0.5 },
      },
      reducedMotion: false,
    });
  });

  it("maps activation presets to the production activation target with the click origin", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, {
      type: "setPointerOrigin",
      origin: { x: 0.3, y: 0.7 },
    });
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-local",
      now: NOW,
    });
    const composed = composeLabInput(state);
    expect(composed.reducedMotion).toBe(false);
    expect(composed.target).toEqual({
      kind: "activation",
      source: "intake",
      opportunityId: 1,
      origin: { x: 0.3, y: 0.7 },
      startedAt: NOW,
      progress: { kind: "determinate", traceId: LAB_PRIMARY_TRACE_ID, target: 0.5 },
    });
  });

  it("maps the center preset to the neutral origin and bumps opportunity id", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, {
      type: "setPointerOrigin",
      origin: { x: 0.1, y: 0.9 },
    });
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-center",
      now: NOW,
    });
    const first = composeLabInput(state);
    expect(first.target).toMatchObject({
      kind: "activation",
      source: "intake",
      origin: { x: 0.5, y: 0.5 },
      opportunityId: 1,
    });
    // Re-igniting the same preset is a fresh bounded opportunity.
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-center",
      now: NOW + 100,
    });
    const second = composeLabInput(state);
    expect(second.target).toMatchObject({
      kind: "activation",
      opportunityId: 2,
      startedAt: NOW + 100,
      origin: { x: 0.5, y: 0.5 },
    });
  });

  it("maps Folder to the folder personality with the click origin", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, {
      type: "setPointerOrigin",
      origin: { x: 0.2, y: 0.4 },
    });
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "folder",
      now: NOW,
    });
    expect(composeLabInput(state).target).toMatchObject({
      kind: "activation",
      source: "folder",
      origin: { x: 0.2, y: 0.4 },
    });
  });

  it("forces reduced motion for RM presets even when the toggle is off", () => {
    for (const presetId of ["intake-reduced", "folder-reduced"]) {
      const state = reduceLabPresentation(
        createLabPresentationState(),
        { type: "activate", presetId, now: NOW },
      );
      expect(composeLabInput(state).reducedMotion).toBe(true);
    }
  });

  it("replay re-ignites the same activation with a fresh startedAt", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-center",
      now: NOW,
    });
    state = reduceLabPresentation(state, { type: "replay", now: NOW + 50 });
    const composed = composeLabInput(state);
    expect(composed.target).toMatchObject({
      kind: "activation",
      source: "intake",
      origin: { x: 0.5, y: 0.5 },
      opportunityId: 2,
      startedAt: NOW + 50,
    });
  });

  it("replay without an activation is a no-op", () => {
    const state = reduceLabPresentation(
      createLabPresentationState(),
      { type: "replay", now: NOW },
    );
    expect(state.activation).toBeNull();
  });

  it("maps all progress presets to determinate targets on the current trace", () => {
    for (const preset of LAB_PROGRESS_PRESETS) {
      const state = reduceLabPresentation(
        createLabPresentationState(),
        { type: "progressPreset", presetId: preset.id },
      );
      expect(composeLabInput(state).target).toEqual({
        kind: "progress",
        progress: {
          kind: "determinate",
          traceId: LAB_PRIMARY_TRACE_ID,
          target: preset.target,
        },
      });
    }
    expect(LAB_PROGRESS_PRESETS.map((preset) => preset.target)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
  });

  it("maps an arbitrary determinate target and clamps out-of-range values", () => {
    const high = reduceLabPresentation(
      createLabPresentationState(),
      { type: "progressTarget", target: 1.7 },
    );
    expect(composeLabInput(high).target).toMatchObject({
      kind: "progress",
      progress: { target: 1 },
    });
    const low = reduceLabPresentation(
      createLabPresentationState(),
      { type: "progressTarget", target: -0.2 },
    );
    expect(composeLabInput(low).target).toMatchObject({
      kind: "progress",
      progress: { target: 0 },
    });
  });

  it("maps indeterminate without any numeric frontier", () => {
    const state = reduceLabPresentation(
      createLabPresentationState(),
      { type: "progressIndeterminate" },
    );
    expect(composeLabInput(state).target).toEqual({
      kind: "progress",
      progress: { kind: "indeterminate", traceId: LAB_PRIMARY_TRACE_ID },
    });
  });

  it("downward revision keeps the trace and lowers the target by half", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-75" });
    state = reduceLabPresentation(state, { type: "downwardRevision" });
    const composed = composeLabInput(state);
    expect(composed.target).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: LAB_PRIMARY_TRACE_ID, target: 0.25 },
    });
  });

  it("downward revision from an indeterminate state is a no-op", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressIndeterminate" });
    const before = state;
    state = reduceLabPresentation(state, { type: "downwardRevision" });
    expect(state).toBe(before);
  });

  it("new trace replacement changes identity and does not inherit the old target", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-75" });
    state = reduceLabPresentation(state, { type: "replaceTrace" });
    const composed = composeLabInput(state);
    expect(composed.target).toEqual({
      kind: "progress",
      progress: {
        kind: "determinate",
        traceId: `${LAB_REPLACEMENT_TRACE_ID_PREFIX}-1`,
        target: 0.5,
      },
    });
    // A later preset keeps the replacement trace as the current primary.
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-25" });
    expect(composeLabInput(state).target).toMatchObject({
      kind: "progress",
      progress: {
        kind: "determinate",
        traceId: `${LAB_REPLACEMENT_TRACE_ID_PREFIX}-1`,
        target: 0.25,
      },
    });
  });

  it("clear progress composes to the production idle target", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-50" });
    state = reduceLabPresentation(state, { type: "clearProgress" });
    expect(composeLabInput(state).target).toEqual({ kind: "idle" });
  });

  it("activation carries the current progress as underlay", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "progressPreset", presetId: "progress-75" });
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-center",
      now: NOW,
    });
    expect(composeLabInput(state).target).toMatchObject({
      kind: "activation",
      source: "intake",
      progress: { kind: "determinate", traceId: LAB_PRIMARY_TRACE_ID, target: 0.75 },
    });
  });

  it("pointer origin is finite and clamped to the normalized unit square", () => {
    const bad: LabPresentationState = reduceLabPresentation(
      createLabPresentationState(),
      { type: "setPointerOrigin", origin: { x: Number.NaN, y: 2.4 } },
    );
    expect(bad.pointerOrigin).toEqual({ x: 0.5, y: 1 });
    const good = reduceLabPresentation(
      createLabPresentationState(),
      { type: "setPointerOrigin", origin: { x: -0.5, y: 1.1 } },
    );
    expect(good.pointerOrigin).toEqual({ x: 0, y: 1 });
  });

  it("declares all required activation presets with distinct ids", () => {
    expect(LAB_ACTIVATION_PRESETS.map((preset) => preset.id)).toEqual([
      "intake-local",
      "intake-center",
      "folder",
      "intake-reduced",
      "folder-reduced",
    ]);
    const ids = new Set(LAB_ACTIVATION_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(LAB_ACTIVATION_PRESETS.length);
  });

  it("starts with the heatmap spike disabled", () => {
    const state = createLabPresentationState();
    expect(state.heatmap).toBeNull();
  });

  it("activates the moving-field heatmap preset over a progress underlay", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "setHeatmap", presetId: "heatmap-moving" });
    expect(state.heatmap).toEqual({
      presetId: "heatmap-moving",
      forcedReducedMotion: false,
      refraction: false,
    });
    // The spike keeps a valid semantic underlay (progress) and does not force
    // reduced motion for the moving-field preset.
    const composed = composeLabInput(state);
    expect(composed.reducedMotion).toBe(false);
    expect(composed.target).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: LAB_PRIMARY_TRACE_ID, target: 0.5 },
    });
  });

  it("forces reduced motion for the static heatmap preset", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "setHeatmap", presetId: "heatmap-reduced" });
    expect(state.heatmap).toEqual({
      presetId: "heatmap-reduced",
      forcedReducedMotion: true,
      refraction: false,
    });
    expect(composeLabInput(state).reducedMotion).toBe(true);
  });

  it("heatmap selection clears any live activation and is idempotent to clear", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-center",
      now: NOW,
    });
    state = reduceLabPresentation(state, { type: "setHeatmap", presetId: "heatmap-moving" });
    expect(state.activation).toBeNull();
    expect(state.heatmap).not.toBeNull();
    // Clearing twice is a no-op the second time.
    state = reduceLabPresentation(state, { type: "clearHeatmap" });
    const cleared = reduceLabPresentation(state, { type: "clearHeatmap" });
    expect(cleared.heatmap).toBeNull();
  });

  it("derives the refraction presets from the same heatmap state/category", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, {
      type: "setHeatmap",
      presetId: "heatmap-refraction-moving",
    });
    expect(state.heatmap).toEqual({
      presetId: "heatmap-refraction-moving",
      forcedReducedMotion: false,
      refraction: true,
    });
    // Refraction is a derived Heatmap mode: it still drives the production
    // heatmap path with a valid progress underlay and no forced RM.
    const moving = composeLabInput(state);
    expect(moving.reducedMotion).toBe(false);
    expect(moving.target).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: LAB_PRIMARY_TRACE_ID, target: 0.5 },
    });

    state = reduceLabPresentation(state, {
      type: "setHeatmap",
      presetId: "heatmap-refraction-reduced",
    });
    expect(state.heatmap).toEqual({
      presetId: "heatmap-refraction-reduced",
      forcedReducedMotion: true,
      refraction: true,
    });
    // Reduced Motion freezes the refraction to a static snapshot.
    expect(composeLabInput(state).reducedMotion).toBe(true);
  });

  it("declares all four heatmap presets with distinct ids", () => {
    expect(LAB_HEATMAP_PRESETS.map((preset) => preset.id)).toEqual([
      "heatmap-moving",
      "heatmap-reduced",
      "heatmap-refraction-moving",
      "heatmap-refraction-reduced",
    ]);
    const ids = new Set(LAB_HEATMAP_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(LAB_HEATMAP_PRESETS.length);
  });
});

describe("Lab Preview Target compatibility", () => {
  it("keeps the Compact category Compact-only and every Full category Full-only", () => {
    expect(LAB_CATEGORY_TARGET_AVAILABILITY.compact).toEqual({ full: false, compact: true });
    for (const category of [
      "activation",
      "downloadProgress",
      "runtime",
      "transcode",
      "mixed",
      "reducedMotion",
      "heatmapSpike",
    ] as const) {
      expect(LAB_CATEGORY_TARGET_AVAILABILITY[category]).toEqual({ full: true, compact: false });
    }
  });

  it("declares the three current-renderer-capability Compact scenarios", () => {
    expect(LAB_COMPACT_SCENARIO_IDS).toEqual([
      "compact-neutral",
      "compact-pointer",
      "compact-reduced",
    ]);
    expect(LAB_COMPACT_SCENARIOS.map((scenario) => scenario.pointerMode)).toEqual([
      "neutral",
      "live",
      "live",
    ]);
    expect(LAB_COMPACT_SCENARIOS.map((scenario) => scenario.forcedReducedMotion)).toEqual([
      false,
      false,
      true,
    ]);
    expect(resolveLabCompactScenario("compact-neutral")?.id).toBe("compact-neutral");
    expect(resolveLabCompactScenario("nope")).toBeNull();
  });

  it("resolves ONE reduced-motion preview value for the Full target", () => {
    let state = createLabPresentationState();
    expect(resolveLabPreviewReducedMotion(state, "full", null, false)).toBe(false);
    state = reduceLabPresentation(state, { type: "setReducedMotion", enabled: true });
    expect(resolveLabPreviewReducedMotion(state, "full", null, false)).toBe(true);
    // RM presets force it even when the toggle is off.
    state = reduceLabPresentation(state, { type: "setReducedMotion", enabled: false });
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-reduced",
      now: NOW,
    });
    expect(resolveLabPreviewReducedMotion(state, "full", null, false)).toBe(true);
  });

  it("keeps overlay fixtures toggle-only on the Full target (no forced RM)", () => {
    let state = createLabPresentationState();
    state = reduceLabPresentation(state, { type: "setReducedMotion", enabled: false });
    state = reduceLabPresentation(state, {
      type: "activate",
      presetId: "intake-reduced",
      now: NOW,
    });
    // A projected fixture never forces the production Reduced Motion flag.
    expect(resolveLabPreviewReducedMotion(state, "full", null, true)).toBe(false);
    state = reduceLabPresentation(state, { type: "setReducedMotion", enabled: true });
    expect(resolveLabPreviewReducedMotion(state, "full", null, true)).toBe(true);
  });

  it("resolves ONE reduced-motion preview value for the Compact target", () => {
    const state = createLabPresentationState();
    expect(resolveLabPreviewReducedMotion(state, "compact", resolveLabCompactScenario("compact-neutral"), false))
      .toBe(false);
    expect(resolveLabPreviewReducedMotion(state, "compact", resolveLabCompactScenario("compact-reduced"), true))
      .toBe(true);
  });
});
