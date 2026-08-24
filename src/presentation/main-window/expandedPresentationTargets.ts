/**
 * Durable Progress Presentation facts consumed by the Expanded graphics host.
 * These values are pure projections of the current primary Download. They are
 * not renderer commands and carry no lifecycle or retention authority.
 */
import type { LocalIntakeOrigin } from "../../application/download-api";

export type ExpandedPresentationProgressTarget =
  | { kind: "idle" }
  | { kind: "indeterminate"; traceId: string }
  | { kind: "determinate"; traceId: string; target: number };

/**
 * The single semantic input consumed by the Expanded graphics host. Priority
 * has already been resolved by Presentation policy; this is not a command,
 * scene, layer, queue, or renderer-owned lifetime.
 */
export type ExpandedPresentationTarget =
  | { kind: "idle" }
  | {
      kind: "progress";
      progress: Exclude<ExpandedPresentationProgressTarget, { kind: "idle" }>;
    }
  | {
      kind: "activation";
      source: "intake" | "folder";
      opportunityId: number;
      origin: LocalIntakeOrigin;
      startedAt: number;
      progress: ExpandedPresentationProgressTarget;
    };
