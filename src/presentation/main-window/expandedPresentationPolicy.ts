import type { DownloadIntakePresentationOpportunity } from "./downloadIntakePresentation";
import type { FolderActivationPresentationOpportunity } from "./folderActivationPresentation";
import type {
  ExpandedPresentationProgressTarget,
  ExpandedPresentationTarget,
} from "./expandedPresentationTargets";

/** Resolves all semantic priority before the one Expanded graphics host. */
export const resolveExpandedPresentationTarget = ({
  progress,
  intake,
  folder,
}: {
  progress: ExpandedPresentationProgressTarget;
  intake: DownloadIntakePresentationOpportunity | null;
  folder: FolderActivationPresentationOpportunity | null;
}): ExpandedPresentationTarget => {
  const activation = intake === null
    ? folder
    : folder === null || intake.startedAt >= folder.startedAt
      ? intake
      : folder;
  if (activation !== null) {
    const source = activation === intake ? "intake" : "folder";
    return {
      kind: "activation",
      source,
      opportunityId: activation.opportunityId,
      origin: activation.origin,
      startedAt: activation.startedAt,
      progress,
    };
  }
  if (progress.kind !== "idle") {
    return { kind: "progress", progress };
  }
  return { kind: "idle" };
};
