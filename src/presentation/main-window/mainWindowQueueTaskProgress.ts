/**
 * Shared Download queue task progress presentation helpers.
 *
 * Mechanically extracted from App.tsx (getDownloadQueueTaskProgressText /
 * getDownloadQueueTaskProgressPercent) so the Electron main window and the
 * Browser Lab render the exact same text/percent through one browser-safe
 * implementation. App remains the owner of the DownloadQueueState; this
 * module only formats already-projected production facts.
 */
import {
  selectIsTaskCancelling,
  selectTaskProgress,
  selectTaskProgressPercent,
} from "../../features/download/selectors";
import type { DownloadQueueState, DownloadTask } from "../../features/download/model";
import { getDownloadStatusText } from "../../utils/downloadViewHelpers";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export const getDownloadQueueTaskProgressText = (
  t: TranslateFn,
  downloadState: DownloadQueueState,
  task: DownloadTask,
): string => {
  if (selectIsTaskCancelling(downloadState, task.traceId)) {
    return t("app.queue.cancelling");
  }
  if (task.phase === "probing_quality") {
    return t("app.queue.probingAdvancedQuality");
  }
  if (task.phase === "selecting_quality") {
    return t("app.queue.selectAdvancedQuality");
  }
  if (task.status === "pending") {
    return t("app.queue.waiting");
  }
  const progress = selectTaskProgress(downloadState, task.traceId);
  if (!progress) {
    return t("app.downloadStage.preparing");
  }
  const statusText = getDownloadStatusText(t, progress, progress.stage);
  return progress.percent < 0
    ? statusText
    : t("app.queue.percentStatus", {
        percent: Math.round(progress.percent),
        status: statusText,
      });
};

export const getDownloadQueueTaskProgressPercent = (
  downloadState: DownloadQueueState,
  task: DownloadTask,
): number => selectTaskProgressPercent(downloadState, task);
