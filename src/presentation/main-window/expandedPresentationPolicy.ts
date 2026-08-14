import type { DownloadIntakePresentationOpportunity } from "./downloadIntakePresentation";
import type {
  ExpandedPresentationProgressTarget,
  ExpandedPresentationTarget,
  ExpandedPresentationTerminalTarget,
} from "./expandedPresentationTargets";

/** Resolves all semantic priority before the one Expanded graphics host. */
export const resolveExpandedPresentationTarget = ({
  progress,
  terminal,
  intake,
}: {
  progress: ExpandedPresentationProgressTarget;
  terminal: ExpandedPresentationTerminalTarget;
  intake: DownloadIntakePresentationOpportunity | null;
}): ExpandedPresentationTarget => {
  // Preserve MR4's current-primary suppression even for defensive overlap.
  if (progress.kind !== "idle" && terminal.kind === "terminal") {
    return { kind: "progress", progress };
  }
  if (terminal.kind === "terminal") {
    return { kind: "terminal", status: terminal.status };
  }
  if (intake !== null) {
    return {
      kind: "intake",
      opportunityId: intake.opportunityId,
      traceId: intake.traceId,
      progress,
    };
  }
  if (progress.kind !== "idle") {
    return { kind: "progress", progress };
  }
  return { kind: "idle" };
};
