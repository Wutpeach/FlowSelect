import { describe, expect, it } from "vitest";
import { resolveExpandedPresentationTarget } from "./expandedPresentationPolicy";

const idleProgress = { kind: "idle" } as const;
const currentProgress = { kind: "indeterminate", traceId: "current" } as const;
const intake = {
  opportunityId: 7,
  traceId: "accepted",
  primaryTraceIdAtStart: "current",
  origin: { x: 0.2, y: 0.8 },
  startedAt: 100,
  deadlineAt: 1200,
} as const;
const folder = { opportunityId: 4, origin: { x: 0.4, y: 0.6 }, startedAt: 120 } as const;

describe("Expanded Presentation policy", () => {
  it("resolves the latest causal activation before progress and never has a terminal lane", () => {
    expect(resolveExpandedPresentationTarget({
      progress: currentProgress,
      intake,
      folder,
    })).toEqual({
      kind: "activation",
      source: "folder",
      opportunityId: 4,
      origin: { x: 0.4, y: 0.6 },
      startedAt: 120,
      progress: currentProgress,
    });
    expect(resolveExpandedPresentationTarget({
      progress: idleProgress,
      intake: null,
      folder,
    })).toMatchObject({ kind: "activation", source: "folder", opportunityId: 4 });
    expect(resolveExpandedPresentationTarget({
      progress: currentProgress,
      intake: null,
      folder: null,
    })).toEqual({ kind: "progress", progress: currentProgress });
  });
});
