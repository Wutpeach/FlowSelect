import { describe, expect, it } from "vitest";

import { reducePanelHover, type PanelHoverState } from "./panelHover";

// Every real pointer enter/leave source (DOM mouse enter/leave, native
// pointer-boundary subscription, window mouseout fallback, compact hotspot
// activation) feeds the same `pointerFact` input through the surface's
// `handlePointerFact`; drop paths feed `dropHovering` through
// `updateDropHoverState`. Drop-session cleanup must issue BOTH
// `pointerFact` (final pointer truth) and `dropHovering: false` — this is
// the wiring contract `clearPanelDropInteractionState` follows. These tests
// pin the effective-hover semantics and the change detection the surface
// uses to notify `onPanelHoveredChange`.

const idle = (): PanelHoverState => ({ pointerInside: false, dropHovering: false });

describe("panel hover facts", () => {
  it("ordinary enter makes local hover true and reports a change", () => {
    const result = reducePanelHover(idle(), { type: "pointerFact", pointerInside: true });
    expect(result.hovered).toBe(true);
    expect(result.changed).toBe(true);
  });

  it("ordinary leave makes hover false when no drop hover is active", () => {
    const result = reducePanelHover(
      { pointerInside: true, dropHovering: false },
      { type: "pointerFact", pointerInside: false },
    );
    expect(result.hovered).toBe(false);
    expect(result.changed).toBe(true);
  });

  it("leave during an active drop hover keeps hover true until drop ownership clears", () => {
    const afterDropEnter = reducePanelHover(idle(), { type: "dropHovering", dropHovering: true });
    expect(afterDropEnter.hovered).toBe(true);

    const afterLeave = reducePanelHover(
      afterDropEnter.state,
      { type: "pointerFact", pointerInside: false },
    );
    expect(afterLeave.hovered).toBe(true);
    expect(afterLeave.changed).toBe(false);

    const afterDropClear = reducePanelHover(
      afterLeave.state,
      { type: "dropHovering", dropHovering: false },
    );
    expect(afterDropClear.hovered).toBe(false);
    expect(afterDropClear.changed).toBe(true);
  });

  it("native boundary and hotspot activation use the same pointerFact input as DOM enter/leave", () => {
    // Wiring contract: these paths dispatch the identical semantic input.
    const enter = reducePanelHover(idle(), { type: "pointerFact", pointerInside: true });
    const leave = reducePanelHover(
      { pointerInside: true, dropHovering: false },
      { type: "pointerFact", pointerInside: false },
    );
    expect(enter.hovered).toBe(true);
    expect(enter.changed).toBe(true);
    expect(leave.hovered).toBe(false);
    expect(leave.changed).toBe(true);
  });

  it("no-op inputs report no change so the surface never re-notifies", () => {
    const alreadyInside = reducePanelHover(
      { pointerInside: true, dropHovering: false },
      { type: "pointerFact", pointerInside: true },
    );
    expect(alreadyInside.hovered).toBe(true);
    expect(alreadyInside.changed).toBe(false);

    const alreadyDropping = reducePanelHover(
      { pointerInside: false, dropHovering: true },
      { type: "dropHovering", dropHovering: true },
    );
    expect(alreadyDropping.hovered).toBe(true);
    expect(alreadyDropping.changed).toBe(false);
  });

  it("drop enter while the pointer is inside keeps hover true through drop clear", () => {
    const afterDrop = reducePanelHover(
      { pointerInside: true, dropHovering: false },
      { type: "dropHovering", dropHovering: true },
    );
    expect(afterDrop.hovered).toBe(true);
    expect(afterDrop.changed).toBe(false);

    const afterClear = reducePanelHover(
      afterDrop.state,
      { type: "dropHovering", dropHovering: false },
    );
    expect(afterClear.hovered).toBe(true);
    expect(afterClear.changed).toBe(false);
  });
});
