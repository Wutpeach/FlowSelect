/**
 * Browser Lab overlay projection — fixture -> shared production component
 * props, through production pure selectors/helpers/projections only.
 *
 * This module mirrors the EXACT derivations App.tsx already performs for the
 * three shared components (center overlay, queue popover, runtime indicator)
 * plus the one ExpandedPresentationTarget. It accepts a `t`/`i18n.t` function
 * so production copy is single-sourced from the existing `desktop` locale
 * namespace; no Lab-side copy is invented for production surfaces.
 */
import type { DownloadQueueState, DownloadTask } from "../features/download/model";
import {
  selectAdvancedQualitySelectionTask,
  selectDownloadQueueRows,
  selectPrimaryDownloadProgress,
  selectPrimaryDownloadTask,
  selectVisibleTaskCount,
} from "../features/download/selectors";
import type { VideoTranscodeTaskPayload } from "../protocol/download/ipcTypes";
import { resolveDownloadProgressTarget } from "../presentation/main-window/downloadProgressProjection";
import type { ExpandedPresentationTarget } from "../presentation/main-window/expandedPresentationTargets";
import { getDownloadQueueTaskProgressPercent, getDownloadQueueTaskProgressText } from "../presentation/main-window/mainWindowQueueTaskProgress";
import type { MainWindowPrimaryTaskView } from "../presentation/main-window/MainWindowCenterOverlay";
import type { RuntimeDependencyGateStatePayload } from "../types/runtimeDependencies";
import type { CenterOverlayVisual, CenterOverlayState } from "../utils/centerOverlayState";
import { selectCenterOverlayVisual } from "../utils/centerOverlayState";
import { getDownloadStatusText } from "../utils/downloadViewHelpers";
import { getTranscodeTaskStatusText } from "../utils/downloadViewHelpers";
import {
  clampRuntimeGateProgressPercent,
  getRuntimeGateHeadline,
  getRuntimeGateNextLabel,
  getRuntimeGateProgressLabel,
  runtimeGateIsActive,
  runtimeGateNeedsManualAction,
  summarizeRuntimeGateError,
} from "../utils/runtimeDependencyGate";
import type { LabOverlayFixture } from "./stateFixtures";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type LabOverlayProjection = {
  /** The single production semantic WebGL input. */
  expandedTarget: ExpandedPresentationTarget;
  /** Center outcome/progress overlay inputs. */
  centerOverlayVisual: CenterOverlayVisual;
  primaryTask: MainWindowPrimaryTaskView;
  primaryTaskStatusText: string;
  primaryTaskSummaryText: string;
  showPrimaryCancel: boolean;
  isPrimaryCancelPending: boolean;
  primaryTaskTraceId: string | null;
  /** Queue badge/popover inputs. */
  totalTaskCount: number;
  totalDownloadTaskCount: number;
  totalTranscodeTaskCount: number;
  downloadQueueTasks: DownloadTask[];
  downloadState: DownloadQueueState;
  transcodeQueueTasks: VideoTranscodeTaskPayload[];
  /** Runtime indicator inputs. */
  showRuntimeIndicator: boolean;
  showRuntimeSuccess: boolean;
  runtimeHeadline: string;
  runtimeStatusText: string;
  runtimeFooterText: string | null;
  runtimeTitle: string;
  runtimeProgressPercent: number | null;
  runtimeIsIndeterminate: boolean;
  runtimeShouldRenderRing: boolean;
  runtimeRequiresManualAction: boolean;
  /** Raw facts surfaced in the Inspector. */
  raw: LabOverlayRawFacts;
};

export type LabOverlayRawFacts = {
  fixtureKind: LabOverlayFixture["kind"];
  runtimeGate: RuntimeDependencyGateStatePayload | null;
  queue: DownloadQueueState;
  transcodeTasks: VideoTranscodeTaskPayload[];
  centerOverlayState: CenterOverlayState;
};

const deriveDownloadView = (
  queue: DownloadQueueState,
  t: TranslateFn,
) => {
  const primaryDownloadTask = selectPrimaryDownloadTask(queue);
  const downloadProgress = selectPrimaryDownloadProgress(queue);
  const downloadStage = downloadProgress?.stage ?? null;
  const primaryDownloadStatusText = primaryDownloadTask
    ? primaryDownloadTask.phase === "probing_quality"
      ? t("app.queue.probingAdvancedQuality")
      : primaryDownloadTask.phase === "selecting_quality"
        ? t("app.queue.selectAdvancedQuality")
        : getDownloadStatusText(t, downloadProgress!, downloadStage)
    : "";
  const progressTarget = resolveDownloadProgressTarget(primaryDownloadTask, downloadProgress);
  return {
    primaryDownloadTask,
    downloadProgress,
    primaryDownloadStatusText,
    downloadQueueRows: selectDownloadQueueRows(queue),
    totalDownloadTaskCount: selectVisibleTaskCount(queue),
    expandedTarget: progressTarget.kind === "idle"
      ? { kind: "idle" as const }
      : { kind: "progress" as const, progress: progressTarget },
  };
};

const deriveTranscodeView = (
  transcodeTasks: VideoTranscodeTaskPayload[],
  t: TranslateFn,
) => {
  const activeTranscodeTasks = transcodeTasks.filter((task) => task.status === "active");
  const primaryTranscodeTask = activeTranscodeTasks[0] ?? null;
  const primaryTranscodeStatusText = primaryTranscodeTask
    ? getTranscodeTaskStatusText(t, primaryTranscodeTask, { includePercent: false })
    : "";
  return {
    primaryTranscodeTask,
    primaryTranscodeStatusText,
    totalTranscodeTaskCount: transcodeTasks.length,
  };
};

const deriveRuntimeView = (
  gate: RuntimeDependencyGateStatePayload | null,
  hasRuntimeGateIssue: boolean,
  runtimeDependencyStatusMissing: string[],
  t: TranslateFn,
) => {
  const runtimeGatePhase = gate?.phase ?? "idle";
  const runtimeGateIsBusy = runtimeGateIsActive(runtimeGatePhase);
  const runtimeGateRequiresManualAction = runtimeGateNeedsManualAction(runtimeGatePhase);
  const runtimeIndicatorHeadline = getRuntimeGateHeadline(t, gate);
  const runtimeIndicatorProgressLabel = getRuntimeGateProgressLabel(t, gate);
  const runtimeIndicatorNextLabel = getRuntimeGateNextLabel(t, gate);
  const runtimeIndicatorErrorSummary = summarizeRuntimeGateError(gate?.lastError);
  const runtimeIndicatorFallbackSummary =
    runtimeDependencyStatusMissing.length > 0
      ? t("settings.downloaders.runtime.missingItems", {
          items: runtimeDependencyStatusMissing.join(", "),
        })
      : t("settings.downloaders.runtime.allReady");
  const runtimeIndicatorStatusText = runtimeGateRequiresManualAction
    ? runtimeIndicatorErrorSummary ?? runtimeIndicatorFallbackSummary
    : runtimeIndicatorProgressLabel ?? runtimeIndicatorFallbackSummary;
  const runtimeIndicatorFooterText = runtimeIndicatorNextLabel
    ?? (runtimeGateRequiresManualAction ? t("app.runtime.manualHint") : null);
  const runtimeIndicatorProgressPercent = clampRuntimeGateProgressPercent(gate?.progressPercent);
  const runtimeIndicatorShouldRenderRing = (
    runtimeGateIsBusy
    || (hasRuntimeGateIssue && !runtimeGateRequiresManualAction)
  );
  const runtimeIndicatorIsIndeterminate = runtimeIndicatorShouldRenderRing
    && runtimeIndicatorProgressPercent === null;
  const runtimeIndicatorTitle = runtimeGateRequiresManualAction
    ? runtimeIndicatorErrorSummary ?? runtimeIndicatorFallbackSummary
    : runtimeIndicatorProgressLabel ?? runtimeIndicatorHeadline;
  return {
    runtimeGateRequiresManualAction,
    runtimeIndicatorHeadline,
    runtimeIndicatorStatusText,
    runtimeIndicatorFooterText,
    runtimeIndicatorTitle,
    runtimeIndicatorProgressPercent,
    runtimeIndicatorIsIndeterminate,
    runtimeIndicatorShouldRenderRing,
  };
};

/**
 * Project a Lab fixture into the exact props the shared production components
 * consume. `t` is the `useTranslation("desktop")` translator — production copy
 * stays single-sourced. The Lab passes no-op callbacks where App would issue
 * commands.
 */
export const projectLabOverlayFixture = (
  fixture: LabOverlayFixture,
  t: TranslateFn,
): LabOverlayProjection => {
  const downloadView =
    fixture.kind === "download" || fixture.kind === "mixed"
      ? deriveDownloadView(fixture.queue, t)
      : {
          primaryDownloadTask: null,
          downloadProgress: null,
          primaryDownloadStatusText: "",
          downloadQueueRows: [] as DownloadTask[],
          totalDownloadTaskCount: 0,
          expandedTarget: { kind: "idle" } as const,
        };
  const transcodeView =
    fixture.kind === "transcode" || fixture.kind === "mixed"
      ? deriveTranscodeView(fixture.transcodeTasks, t)
      : {
          primaryTranscodeTask: null,
          primaryTranscodeStatusText: "",
          totalTranscodeTaskCount: 0,
        };
  const queue: DownloadQueueState =
    fixture.kind === "download" || fixture.kind === "mixed" ? fixture.queue : { tasksById: {}, order: [], maxConcurrent: 1, progressByTrace: {}, cancelling: [], qualitySelecting: {}, terminalTraceIds: [] };
  const transcodeTasks: VideoTranscodeTaskPayload[] =
    fixture.kind === "transcode" || fixture.kind === "mixed" ? fixture.transcodeTasks : [];
  const runtimeGate =
    fixture.kind === "runtime" ? fixture.gate : null;
  const runtimeMissingComponents =
    fixture.kind === "runtime" ? fixture.gate.missingComponents : [];
  const hasRuntimeGateIssue = fixture.kind === "runtime";

  const primaryTask: MainWindowPrimaryTaskView = downloadView.primaryDownloadTask && downloadView.downloadProgress
    ? {
        kind: "download",
        percent: downloadView.downloadProgress.percent,
        indeterminate:
          downloadView.primaryDownloadTask.phase === "probing_quality"
          || downloadView.primaryDownloadTask.phase === "selecting_quality"
          || downloadView.downloadProgress.percent < 0,
      }
    : transcodeView.primaryTranscodeTask
      ? {
          kind: "transcode",
          percent: transcodeView.primaryTranscodeTask.progressPercent ?? -1,
          indeterminate:
            typeof transcodeView.primaryTranscodeTask.progressPercent !== "number"
            || !Number.isFinite(transcodeView.primaryTranscodeTask.progressPercent),
        }
      : null;

  const centerOverlayState: CenterOverlayState =
    fixture.kind === "transcode" ? fixture.centerOverlayState : createIdleCenterOverlayState();
  const centerOverlayVisual = selectCenterOverlayVisual({
    primaryTask: primaryTask
      ? {
          kind: primaryTask.kind,
          traceId:
            primaryTask.kind === "download"
              ? downloadView.primaryDownloadTask?.traceId
              : transcodeView.primaryTranscodeTask?.traceId,
        }
      : null,
    centerOverlayState,
  });

  const primaryTaskStatusText =
    primaryTask?.kind === "download"
      ? downloadView.primaryDownloadStatusText
      : transcodeView.primaryTranscodeStatusText;
  const primaryTaskSummaryText =
    fixture.kind === "transcode" && centerOverlayState.kind === "task-outcome-visible"
      ? (centerOverlayState.message ?? "")
      : "";

  const runtimeView = deriveRuntimeView(
    runtimeGate,
    hasRuntimeGateIssue,
    runtimeMissingComponents,
    t,
  );

  const showRuntimeIndicator = fixture.kind === "runtime";
  const primaryTaskTraceId =
    primaryTask?.kind === "download"
      ? (downloadView.primaryDownloadTask?.traceId ?? null)
      : (transcodeView.primaryTranscodeTask?.traceId ?? null);

  return {
    expandedTarget: downloadView.expandedTarget,
    centerOverlayVisual,
    primaryTask,
    primaryTaskStatusText,
    primaryTaskSummaryText,
    showPrimaryCancel: false,
    isPrimaryCancelPending: false,
    primaryTaskTraceId,
    totalTaskCount: downloadView.totalDownloadTaskCount + transcodeView.totalTranscodeTaskCount,
    totalDownloadTaskCount: downloadView.totalDownloadTaskCount,
    totalTranscodeTaskCount: transcodeView.totalTranscodeTaskCount,
    downloadQueueTasks: downloadView.downloadQueueRows,
    downloadState: queue,
    transcodeQueueTasks: transcodeTasks,
    showRuntimeIndicator,
    showRuntimeSuccess: false,
    runtimeHeadline: runtimeView.runtimeIndicatorHeadline,
    runtimeStatusText: runtimeView.runtimeIndicatorStatusText,
    runtimeFooterText: runtimeView.runtimeIndicatorFooterText,
    runtimeTitle: runtimeView.runtimeIndicatorTitle,
    runtimeProgressPercent: runtimeView.runtimeIndicatorProgressPercent,
    runtimeIsIndeterminate: runtimeView.runtimeIndicatorIsIndeterminate,
    runtimeShouldRenderRing: runtimeView.runtimeIndicatorShouldRenderRing,
    runtimeRequiresManualAction: runtimeView.runtimeGateRequiresManualAction,
    raw: {
      fixtureKind: fixture.kind,
      runtimeGate,
      queue,
      transcodeTasks,
      centerOverlayState,
    },
  };
};

const createIdleCenterOverlayState = (): CenterOverlayState => ({
  kind: "idle",
  requestId: 0,
});

/**
 * Queue-row presentation facts for the Inspector and the shared popover rows.
 * Reuses the exact production helpers the Electron main window uses.
 */
export const projectLabQueueRow = (
  downloadState: DownloadQueueState,
  task: DownloadTask,
  t: TranslateFn,
): {
  progressText: string;
  progressPercent: number;
} => ({
  progressText: getDownloadQueueTaskProgressText(t, downloadState, task),
  progressPercent: getDownloadQueueTaskProgressPercent(downloadState, task),
});

export { selectAdvancedQualitySelectionTask };
