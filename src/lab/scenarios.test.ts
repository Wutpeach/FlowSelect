import { describe, expect, it } from "vitest";
import {
  LAB_ACTIVATION_PRESETS,
  LAB_PRIMARY_TRACE_ID,
  LAB_PROGRESS_PRESETS,
  LAB_REPLACEMENT_TRACE_ID_PREFIX,
  composeLabInput,
  createLabPresentationState,
  reduceLabPresentation,
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
});
