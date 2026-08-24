import { describe, expect, it } from "vitest";

import {
  createMainWindowPresentationState,
  reduceMainWindowPresentation,
} from "./lifecycle";
import {
  isMainWindowFullContentVisible,
  resolveMainWindowPresentationProjections,
  resolveMainWindowVisualMode,
} from "./projections";

const baseState = createMainWindowPresentationState({ startsCompact: false });

const collapseToCollapsing = () => {
  const left = reduceMainWindowPresentation(baseState, { type: "pointerLeave" }).state;
  const timerEpoch = (left.phase as { timerEpoch: number }).timerEpoch;
  return reduceMainWindowPresentation(left, { type: "collapseTimerFired", timerEpoch }).state;
};

describe("mainWindowPresentation projections", () => {
  it("full phase projects full visuals and interactive policy", () => {
    const p = resolveMainWindowPresentationProjections(baseState, {
      supportsCompactPassthrough: true,
    });
    expect(p.visual).toEqual({
      mode: "full",
      completionTarget: "full",
      transitionEpoch: null,
      recipe: "animated",
      settleEpoch: null,
    });
    expect(p.interaction).toEqual({
      mode: "interactive",
      hotspotActive: false,
      pointerBoundaryActive: true,
    });
  });

  it("expanding projects the expanding epoch and interactive policy", () => {
    const expanding = reduceMainWindowPresentation(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;

    const p = resolveMainWindowPresentationProjections(expanding, {
      supportsCompactPassthrough: true,
    });
    expect(p.visual.mode).toBe("full");
    expect(p.visual.completionTarget).toBe("full");
    expect(p.visual.transitionEpoch).toBe(0);
    expect(p.visual.recipe).toBe("animated");
    expect(p.interaction.mode).toBe("interactive");
    expect(p.interaction.pointerBoundaryActive).toBe(true);
  });

  it("collapse pending projects full visuals with interactive policy", () => {
    const pending = reduceMainWindowPresentation(baseState, { type: "pointerLeave" }).state;
    const p = resolveMainWindowPresentationProjections(pending, {
      supportsCompactPassthrough: true,
    });
    expect(p.visual.mode).toBe("full");
    expect(p.visual.transitionEpoch).toBeNull();
    expect(p.interaction.mode).toBe("interactive");
    expect(p.interaction.pointerBoundaryActive).toBe(true);
  });

  it("collapsing projects compact visuals and keeps interactive policy", () => {
    const collapsing = collapseToCollapsing();
    const p = resolveMainWindowPresentationProjections(collapsing, {
      supportsCompactPassthrough: true,
    });
    expect(p.visual.mode).toBe("compact");
    expect(p.visual.completionTarget).toBe("compact");
    expect(p.visual.transitionEpoch).toBe((collapsing.phase as { epoch: number }).epoch);
    expect(p.interaction.mode).toBe("interactive");
    expect(p.interaction.hotspotActive).toBe(false);
    expect(p.interaction.pointerBoundaryActive).toBe(true);
  });

  it("projects no native surface (reachability stays a lifecycle effect, not projection state)", () => {
    const p = resolveMainWindowPresentationProjections(baseState, {
      supportsCompactPassthrough: true,
    });
    expect(p).not.toHaveProperty("native");
  });

  it("initial compact state hides full content immediately (plain-web initial compact)", () => {
    // Plain web / compact-start launch: the lifecycle starts compact and the
    // projection must say so on the very first render — no notification
    // roundtrip from the surface can be in the loop.
    const compactStart = createMainWindowPresentationState({ startsCompact: true });
    expect(isMainWindowFullContentVisible(compactStart)).toBe(false);
    expect(resolveMainWindowVisualMode(compactStart)).toBe("compact");
  });

  it("initial full state shows full content immediately", () => {
    const fullStart = createMainWindowPresentationState({ startsCompact: false });
    expect(isMainWindowFullContentVisible(fullStart)).toBe(true);
    expect(resolveMainWindowVisualMode(fullStart)).toBe("full");
  });

  it("expanding projects full content visible before completion", () => {
    const expanding = reduceMainWindowPresentation(
      createMainWindowPresentationState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;
    expect(isMainWindowFullContentVisible(expanding)).toBe(true);
  });

  it("collapsing projects compact mode (content hidden) until completion", () => {
    const collapsing = collapseToCollapsing();
    expect(isMainWindowFullContentVisible(collapsing)).toBe(false);
  });

  it("compact projects passthrough only when the platform supports it", () => {
    const collapsing = collapseToCollapsing();
    const epoch = (collapsing.phase as { epoch: number }).epoch;
    const compact = reduceMainWindowPresentation(collapsing, {
      type: "visualTransitionCompleted",
      target: "compact",
      epoch,
    }).state;

    const supported = resolveMainWindowPresentationProjections(compact, {
      supportsCompactPassthrough: true,
    });
    expect(supported.interaction.mode).toBe("compact-passthrough");
    expect(supported.interaction.hotspotActive).toBe(true);
    expect(supported.interaction.pointerBoundaryActive).toBe(false);
    expect(supported.visual.settleEpoch).toBe((compact.phase as { settleEpoch: number }).settleEpoch);

    const unsupported = resolveMainWindowPresentationProjections(compact, {
      supportsCompactPassthrough: false,
    });
    expect(unsupported.interaction.mode).toBe("interactive");
    expect(unsupported.interaction.hotspotActive).toBe(false);
  });
});
