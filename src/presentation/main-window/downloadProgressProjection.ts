import type { DownloadProgress, DownloadTask } from "../../features/download/model";
import type { ExpandedPresentationProgressTarget } from "./expandedPresentationTargets";

// MR3 Progress Field — pure Download -> Presentation projection.
//
// Maps the CURRENT primary Download selector result to one neutral Expanded
// Presentation target.
// It is a pure current-state value, not a state machine and not a second
// store: recomputing it from one Download snapshot must never depend on
// historical animation state, and it contains no terminal outcome, lifecycle
// command, cancel action, or per-frame data. Terminal/removal is observed
// only as the selector result changing to the next primary task or null.
//
// The input is specifically the primary Download task + its progress, never
// the App-level aggregate that can fall back to Transcode: a transcode-only
// state is idle for this Download Presentation.

/**
 * Resolves the projected Expanded Presentation target from the current primary Download
 * selector result.
 *
 * - no primary task                      -> idle
 * - probing/selecting phase, or percent  -> indeterminate (explicitly
 *   absent/negative/non-finite             non-quantitative)
 * - finite percent                       -> determinate(trace, clamp(0..1))
 */
export const resolveDownloadProgressTarget = (
  task: DownloadTask | null,
  progress: DownloadProgress | null,
): ExpandedPresentationProgressTarget => {
  if (task === null) {
    return { kind: "idle" };
  }
  const phaseSynthetic = task.phase === "probing_quality" || task.phase === "selecting_quality";
  const percent = progress?.percent ?? null;
  if (
    phaseSynthetic
    || percent === null
    || !Number.isFinite(percent)
    || percent < 0
  ) {
    return { kind: "indeterminate", traceId: task.traceId };
  }
  return {
    kind: "determinate",
    traceId: task.traceId,
    // Clamped only for presentation safety; never re-owns the percent.
    target: Math.min(Math.max(percent / 100, 0), 1),
  };
};
