import { describe, expect, it } from "vitest";
import { resolveExpandedPresentationTarget } from "./expandedPresentationPolicy";

const idleProgress = { kind: "idle" } as const;
const currentProgress = { kind: "indeterminate", traceId: "current" } as const;
const noTerminal = { kind: "none" } as const;
const intake = {
  opportunityId: 7,
  traceId: "accepted",
  primaryTraceIdAtStart: "current",
  deadlineAt: 1200,
} as const;

describe("Expanded Presentation policy", () => {
  it("preserves current-primary suppression when defensive progress and terminal inputs overlap", () => {
    expect(resolveExpandedPresentationTarget({
      progress: currentProgress,
      terminal: { kind: "terminal", status: "success" },
      intake,
    })).toEqual({ kind: "progress", progress: currentProgress });
  });

  it("resolves Terminal, Intake, Progress, then idle without renderer competition", () => {
    expect(resolveExpandedPresentationTarget({
      progress: idleProgress,
      terminal: { kind: "terminal", status: "failure" },
      intake,
    })).toEqual({ kind: "terminal", status: "failure" });
    expect(resolveExpandedPresentationTarget({
      progress: currentProgress,
      terminal: noTerminal,
      intake,
    })).toEqual({
      kind: "intake",
      opportunityId: 7,
      traceId: "accepted",
      progress: currentProgress,
    });
    expect(resolveExpandedPresentationTarget({
      progress: currentProgress,
      terminal: noTerminal,
      intake: null,
    })).toEqual({ kind: "progress", progress: currentProgress });
    expect(resolveExpandedPresentationTarget({
      progress: idleProgress,
      terminal: noTerminal,
      intake: null,
    })).toEqual({ kind: "idle" });
  });
});
