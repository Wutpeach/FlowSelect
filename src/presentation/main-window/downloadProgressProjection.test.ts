import { describe, expect, it } from "vitest";
import type { DownloadProgress, DownloadTask } from "../../features/download/model";
import { resolveDownloadProgressTarget } from "./downloadProgressProjection";

/**
 * MR3 conformance tests for the pure Download -> Presentation projection: idle,
 * determinate, indeterminate, primary replacement, terminal/removal, and the
 * transcode-only case that must NOT become Download progress. The projection
 * is a pure current-state value with no historical dependency.
 */

const TASK: DownloadTask = {
  traceId: "trace-1",
  label: "video",
  status: "active",
  phase: "downloading",
};

const PROGRESS: DownloadProgress = {
  traceId: "trace-1",
  percent: 42,
  stage: "downloading",
  speed: "1 MB/s",
  eta: "10s",
};

describe("MR3 progress projection", () => {
  it("projects idle when there is no primary Download (including transcode-only)", () => {
    expect(resolveDownloadProgressTarget(null, null)).toEqual({ kind: "idle" });
    expect(resolveDownloadProgressTarget(null, PROGRESS)).toEqual({ kind: "idle" });
  });

  it("projects determinate with a clamped 0..1 target from a finite percent", () => {
    expect(resolveDownloadProgressTarget(TASK, { ...PROGRESS, percent: 0 })).toEqual({
      kind: "determinate",
      traceId: "trace-1",
      target: 0,
    });
    expect(resolveDownloadProgressTarget(TASK, { ...PROGRESS, percent: 42 })).toEqual({
      kind: "determinate",
      traceId: "trace-1",
      target: 0.42,
    });
    expect(resolveDownloadProgressTarget(TASK, { ...PROGRESS, percent: 100 })).toEqual({
      kind: "determinate",
      traceId: "trace-1",
      target: 1,
    });
    // Percent beyond 100 is clamped only for presentation safety.
    expect(resolveDownloadProgressTarget(TASK, { ...PROGRESS, percent: 150 })).toEqual({
      kind: "determinate",
      traceId: "trace-1",
      target: 1,
    });
  });

  it("projects indeterminate when percent is absent, negative, or non-finite", () => {
    const indeterminate = { kind: "indeterminate" as const, traceId: "trace-1" };
    expect(resolveDownloadProgressTarget(TASK, null)).toEqual(indeterminate);
    expect(resolveDownloadProgressTarget(TASK, { ...PROGRESS, percent: -1 })).toEqual(indeterminate);
    expect(resolveDownloadProgressTarget(TASK, { ...PROGRESS, percent: Number.NaN })).toEqual(indeterminate);
    expect(resolveDownloadProgressTarget(TASK, { ...PROGRESS, percent: Number.POSITIVE_INFINITY })).toEqual(indeterminate);
  });

  it("projects indeterminate for the probing/selecting phases even with a percent present", () => {
    for (const phase of ["probing_quality", "selecting_quality"] as const) {
      expect(resolveDownloadProgressTarget({ ...TASK, phase }, PROGRESS)).toEqual({
        kind: "indeterminate",
        traceId: "trace-1",
      });
    }
  });

  it("carries the current trace identity for replacement scoping", () => {
    const next = resolveDownloadProgressTarget(
      { ...TASK, traceId: "trace-2" },
      { ...PROGRESS, traceId: "trace-2", percent: 12 },
    );
    expect(next).toEqual({ kind: "determinate", traceId: "trace-2", target: 0.12 });
    // Terminal/removal: the next selector result is simply the next primary or
    // idle; the projection has no terminal kind to express.
    expect(resolveDownloadProgressTarget(null, PROGRESS)).toEqual({ kind: "idle" });
  });

  it("is a pure current-state value: recomputable from one snapshot with no history", () => {
    const a = resolveDownloadProgressTarget(TASK, PROGRESS);
    const b = resolveDownloadProgressTarget(TASK, PROGRESS);
    expect(a).toEqual(b);
  });
});
