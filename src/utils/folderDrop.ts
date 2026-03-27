import type {
  FlowSelectDroppedFolderPathFailureReason,
  FlowSelectDroppedFolderPathResult,
} from "../types/electronBridge";

const droppedFolderErrorKeyByReason: Record<
  FlowSelectDroppedFolderPathFailureReason,
  string
> = {
  EMPTY_PATH: "app.drop.errors.unresolved",
  UNRESOLVED_DROP: "app.drop.errors.unresolved",
  PRELOAD_ERROR: "app.drop.errors.preloadFailed",
  NOT_DIRECTORY: "app.drop.errors.notDirectory",
  NOT_FOUND: "app.drop.errors.notFound",
  STAT_FAILED: "app.drop.errors.statFailed",
};

export const shouldHandleDroppedFolderResult = (
  result: FlowSelectDroppedFolderPathResult | null,
): boolean => {
  if (!result) {
    return false;
  }

  if (result.success) {
    return true;
  }

  return result.reason !== "NOT_DIRECTORY";
};

export const getDroppedFolderErrorTranslationKey = (
  reason: FlowSelectDroppedFolderPathFailureReason,
): string => droppedFolderErrorKeyByReason[reason];
