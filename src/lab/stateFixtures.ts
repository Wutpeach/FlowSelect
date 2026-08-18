/**
 * Browser Lab state fixtures — synthetic visual facts for the consolidated
 * Lab.
 *
 * Static Lab-only fixtures are converted into EXISTING production model types
 * and projected through the SAME pure selectors / reducers / helpers /
 * projections the Electron main window uses (Download selectors, transcode
 * view helpers, runtime gate helpers, center-overlay selector, download
 * progress projection). No synthetic event bus, command registry, durable
 * queue, or parallel controller is introduced, and no Download / Product /
 * Transcode / config / lifecycle authority is read or written here.
 */
import type { DownloadQueueState } from "../features/download/model";
import { createInitialDownloadQueueState } from "../features/download/model";
import type { VideoTranscodeTaskPayload } from "../protocol/download/ipcTypes";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
} from "../types/runtimeDependencies";
import type { CenterOverlayState } from "../utils/centerOverlayState";
import { createCenterOverlayState } from "../utils/centerOverlayState";

/** Stable Lab trace identifiers (never collide with real session UUIDs). */
export const LAB_DOWNLOAD_TRACE_ID = "lab-download-trace";
export const LAB_QUEUED_DOWNLOAD_TRACE_ID = "lab-queued-download-trace";
export const LAB_TRANSCODE_TRACE_ID = "lab-transcode-trace";

/**
 * Discriminated Lab-only fixture union. Each member carries only the
 * production model values needed to drive the shared presentational
 * components; the Lab never owns business authority.
 */
export type LabOverlayFixture =
  | { kind: "runtime"; gate: RuntimeDependencyGateStatePayload }
  | { kind: "download"; queue: DownloadQueueState }
  | { kind: "transcode"; transcodeTasks: VideoTranscodeTaskPayload[]; centerOverlayState: CenterOverlayState }
  | { kind: "mixed"; queue: DownloadQueueState; transcodeTasks: VideoTranscodeTaskPayload[] };

export const createDownloadActiveFixture = (): LabOverlayFixture => ({
  kind: "download",
  queue: {
    tasksById: {
      [LAB_DOWNLOAD_TRACE_ID]: {
        traceId: LAB_DOWNLOAD_TRACE_ID,
        label: "galaxy-remaster-4k.mp4",
        status: "active",
        phase: "downloading",
      },
    },
    order: [LAB_DOWNLOAD_TRACE_ID],
    maxConcurrent: 1,
    progressByTrace: {
      [LAB_DOWNLOAD_TRACE_ID]: {
        traceId: LAB_DOWNLOAD_TRACE_ID,
        percent: 64,
        stage: "downloading",
        speed: "12.4 MB/s",
        eta: "0:42",
      },
    },
    cancelling: [],
    qualitySelecting: {},
    terminalTraceIds: [],
  },
});

export const createDownloadQueuedFixture = (): LabOverlayFixture => ({
  kind: "download",
  queue: {
    tasksById: {
      [LAB_DOWNLOAD_TRACE_ID]: {
        traceId: LAB_DOWNLOAD_TRACE_ID,
        label: "nebula-loop-1080p.mp4",
        status: "pending",
        phase: null,
      },
      [LAB_QUEUED_DOWNLOAD_TRACE_ID]: {
        traceId: LAB_QUEUED_DOWNLOAD_TRACE_ID,
        label: "comet-trail-4k.mp4",
        status: "pending",
        phase: null,
      },
    },
    order: [LAB_DOWNLOAD_TRACE_ID, LAB_QUEUED_DOWNLOAD_TRACE_ID],
    maxConcurrent: 1,
    progressByTrace: {},
    cancelling: [],
    qualitySelecting: {},
    terminalTraceIds: [],
  },
});

const TRANSCODE_ACTIVE_TASK: VideoTranscodeTaskPayload = {
  traceId: LAB_TRANSCODE_TRACE_ID,
  label: "aurora-clip.mp4",
  status: "active",
  stage: "transcoding",
  progressPercent: 37,
  etaSeconds: 128,
  sourcePath: "/tmp/aurora-clip.mp4",
  sourceFormat: "mp4",
  targetFormat: "mkv",
  error: null,
  failure: null,
};

export const createTranscodeActiveFixture = (): LabOverlayFixture => ({
  kind: "transcode",
  transcodeTasks: [TRANSCODE_ACTIVE_TASK],
  centerOverlayState: createCenterOverlayState(),
});

export const createTranscodeFailedFixture = (): LabOverlayFixture => {
  const errorMessage = "ffmpeg exited with code 1: Invalid data found when processing input";
  return {
    kind: "transcode",
    transcodeTasks: [
      {
        traceId: LAB_TRANSCODE_TRACE_ID,
        label: "aurora-clip.mp4",
        status: "failed",
        stage: "failed",
        progressPercent: 61,
        sourceFormat: "mp4",
        targetFormat: "mkv",
        error: errorMessage,
        failure: {
          code: "E_TRANSCODE",
          classification: "engine_execution",
          rawMessage: errorMessage,
          diagnosticCategory: "engine_execution",
        },
      },
    ],
    centerOverlayState: {
      kind: "task-outcome-visible",
      requestId: 1,
      source: "transcode",
      status: "failure",
      origin: "foreground",
      message: errorMessage,
      durationMs: 60_000,
      diagnostic: {
        surface: "transcode",
        traceId: LAB_TRANSCODE_TRACE_ID,
        userMessage: errorMessage,
        category: "transcode_merge",
      },
    },
  };
};

export const createRuntimeAutoConfigFixture = (): LabOverlayFixture => ({
  kind: "runtime",
  gate: {
    phase: "downloading",
    missingComponents: ["ytDlp", "galleryDl"],
    lastError: null,
    updatedAtMs: 0,
    currentComponent: "ytDlp" as RuntimeDependencyManagedComponent,
    currentStage: "installing",
    progressPercent: 42,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: "galleryDl" as RuntimeDependencyManagedComponent,
  },
});

export const createRuntimeFailedFixture = (): LabOverlayFixture => ({
  kind: "runtime",
  gate: {
    phase: "failed",
    missingComponents: ["ffmpeg"],
    lastError: "Runtime bootstrap failed: ffmpeg download failed (HTTP 503)",
    updatedAtMs: 0,
    currentComponent: "ffmpeg" as RuntimeDependencyManagedComponent,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: null,
  },
});

export const createMixedBusyFixture = (): LabOverlayFixture => {
  const download = createDownloadActiveFixture();
  return {
    kind: "mixed",
    queue: (download as { kind: "download"; queue: DownloadQueueState }).queue,
    transcodeTasks: [TRANSCODE_ACTIVE_TASK],
  };
};

/** One empty Download queue (used for transcode-only / runtime scenes). */
export const createEmptyDownloadQueueFixture = (): DownloadQueueState =>
  createInitialDownloadQueueState();

export const LAB_OVERLAY_FIXTURES: Readonly<Record<string, () => LabOverlayFixture>> = {
  "runtime-auto-config": createRuntimeAutoConfigFixture,
  "runtime-failed": createRuntimeFailedFixture,
  "download-active": createDownloadActiveFixture,
  "download-queued": createDownloadQueuedFixture,
  "transcode-active": createTranscodeActiveFixture,
  "transcode-failed": createTranscodeFailedFixture,
  "mixed-busy": createMixedBusyFixture,
};

export const LAB_OVERLAY_FIXTURE_IDS = Object.keys(LAB_OVERLAY_FIXTURES) as readonly string[];

export const resolveLabOverlayFixture = (
  fixtureId: string,
): LabOverlayFixture | null => LAB_OVERLAY_FIXTURES[fixtureId]?.() ?? null;
